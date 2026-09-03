/**
 * The executable definition of a SystemSketch "primitive": a saved record
 * that can load and render with tldraw 5.3.2's default schema, binding utils,
 * and shape utils alone. `meta` is intentionally not part of that definition:
 * stock tldraw preserves it but never needs to read it to paint the drawing.
 */
import {
	Editor,
	createTLSchema,
	defaultAddFontsFromNode,
	defaultBindingUtils,
	defaultShapeTools,
	defaultShapeUtils,
	defaultTools,
	parseTldrawJsonFile,
	tipTapDefaultExtensions,
	type TLRecord,
} from 'tldraw'

const forbiddenGeoTypes = new Set(['excalidraw-rounded-rect', 'systemsketch-rounded-rect'])
// Groups are a built-in structural record rather than a ShapeUtil entry.
const stockShapeTypes = new Set<string>([...defaultShapeUtils.map((util) => util.type), 'group'])
const stockBindingTypes = new Set<string>(defaultBindingUtils.map((util) => util.type))

export interface StockPrimitiveProblem {
	id: string
	reason: string
}

/** Return every record that a clean stock tldraw editor cannot own. */
export function stockPrimitiveProblems(records: Iterable<TLRecord>): StockPrimitiveProblem[] {
	const problems: StockPrimitiveProblem[] = []
	for (const record of records) {
		// Comments are registered as opt-in records in SystemSketch but are not in
		// tldraw's default TLRecord union. Keep this boundary deliberately
		// structural so the assertion catches them before stock load does.
		const candidate = record as unknown as {
			id: string
			typeName: string
			type?: string
			props?: { geo?: unknown }
		}
		if (candidate.typeName === 'shape' && !stockShapeTypes.has(candidate.type ?? '')) {
			problems.push({ id: candidate.id, reason: `custom shape type ${candidate.type}` })
			continue
		}
		if (candidate.typeName === 'binding' && !stockBindingTypes.has(candidate.type ?? '')) {
			problems.push({ id: candidate.id, reason: `custom binding type ${candidate.type}` })
			continue
		}
		if (candidate.typeName === 'shape' && candidate.type === 'geo'
			&& forbiddenGeoTypes.has(String(candidate.props?.geo))) {
			problems.push({ id: candidate.id, reason: `custom geo ${String(candidate.props?.geo)}` })
			continue
		}
		if (candidate.typeName === 'comment' || candidate.typeName === 'comment-thread' || candidate.typeName === 'comment-reaction') {
			problems.push({ id: candidate.id, reason: `SystemSketch comment record ${candidate.typeName}` })
		}
	}
	return problems
}

export function assertStockPrimitives(records: Iterable<TLRecord>): void {
	const problems = stockPrimitiveProblems(records)
	if (problems.length > 0) {
		throw new Error(`Not stock tldraw primitives: ${problems.map((problem) => `${problem.id}: ${problem.reason}`).join(', ')}`)
	}
}

/**
 * Parse and render a `.tldr` with only default tldraw constructors. This is
 * deliberately useful to the browser proof too: its SVG is the visual output
 * of stock `ShapeUtil`s, not a SystemSketch canvas or CSS approximation.
 */
export async function renderWithStockTldraw(json: string, container: HTMLElement): Promise<string> {
	const parsed = parseTldrawJsonFile({ json, schema: createTLSchema() })
	if (!parsed.ok) throw new Error(`Stock schema rejected the detached file: ${parsed.error.type}`)
	assertStockPrimitives(parsed.value.allRecords())
	const editor = new Editor({
		store: parsed.value,
		shapeUtils: defaultShapeUtils,
		bindingUtils: defaultBindingUtils,
		tools: [...defaultTools, ...defaultShapeTools],
		initialState: 'select',
		autoFocus: false,
		getContainer: () => container,
		options: {
			text: {
				addFontsFromNode: defaultAddFontsFromNode,
				tipTapConfig: { extensions: tipTapDefaultExtensions },
			},
		},
	})
	try {
		const rendered = await editor.getSvgString(editor.getCurrentPageShapes().map((shape) => shape.id), {
			background: true,
		})
		if (!rendered) throw new Error('Stock tldraw did not produce SVG output')
		return rendered.svg
	} finally {
		editor.dispose()
	}
}

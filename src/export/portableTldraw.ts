import {
	Editor,
	createTLStore,
	defaultBindingUtils,
	defaultAddFontsFromNode,
	defaultShapeTools,
	defaultShapeUtils,
	defaultTools,
	loadSnapshot,
	serializeTldrawJson,
	tipTapDefaultExtensions,
	toRichText,
	type TLAnyBindingUtilConstructor,
	type TLAnyShapeUtilConstructor,
	type TLGeoShape,
	type TLShape,
	type TLShapeId,
} from 'tldraw'

import { EXCALIDRAW_ROUNDED_RECT_GEO, EXCALIDRAW_SHAPE_UTILS } from '../excalidrawInterop'
import { SYSTEMSKETCH_THEMES } from '../appearance/figjamPalette'
import {
	BlockShapeUtil,
	isBlockShape,
	valueBlockLabel,
	valueBlockText,
	type BlockShape,
} from '../blocks'
import {
	BranchArmShapeUtil,
	BranchShapeUtil,
	isBranchShape,
} from '../branch'
import { LoopShapeUtil, detachLoopToPrimitives, isLoopShape } from '../loop'
import {
	CONNECTION_SHAPE_TYPE,
	blockConnectionBindingUtils,
	blockConnectionShapeUtils,
} from '../blocks/connections'
import { detachBlockToPrimitives, detachConnectionToArrow, type DetachResult } from '../blocks/detach'
import { detachBranchToPrimitives } from '../branch/detachBranch'
import { SYSTEMSKETCH_COMMENT_RECORDS } from '../comments'
import {
	SYSTEMSKETCH_ROUNDED_RECT_GEO,
	SYSTEMSKETCH_STOCK_PRIMITIVE_SHAPE_UTILS,
} from '../stockPrimitiveVisuals'
import { assertStockPrimitives } from './stockTldrawPrimitives'

/**
 * A portable export is made in a second editor, never by temporarily changing
 * the board the person is looking at. Besides preventing a visible flash, that
 * boundary keeps export out of undo, autosave, collaboration and host bridges.
 */
function replaceConstructorsByType<T extends { type: string }>(
	defaults: readonly T[],
	overrides: readonly T[],
): T[] {
	const replaced = new Set(overrides.map((value) => value.type))
	return [...defaults.filter((value) => !replaced.has(value.type)), ...overrides]
}

const PORTABLE_SHAPE_UTILS = replaceConstructorsByType<TLAnyShapeUtilConstructor>(
	defaultShapeUtils,
	[
		...EXCALIDRAW_SHAPE_UTILS,
		...SYSTEMSKETCH_STOCK_PRIMITIVE_SHAPE_UTILS,
		BlockShapeUtil,
		BranchShapeUtil,
		BranchArmShapeUtil,
		LoopShapeUtil,
		...blockConnectionShapeUtils,
	],
)

const PORTABLE_BINDING_UTILS = replaceConstructorsByType<TLAnyBindingUtilConstructor>(
	defaultBindingUtils,
	blockConnectionBindingUtils,
)

/** Custom FigJam names must become values stock tldraw validates. */
const PORTABLE_COLOR_FALLBACKS: Readonly<Record<string, string>> = {
	'dark-gray': 'grey',
	teal: 'light-blue',
	pink: 'light-violet',
	gray: 'grey',
	'light-gray': 'grey',
	'light-orange': 'yellow',
	'light-yellow': 'yellow',
	'light-teal': 'light-green',
	'light-pink': 'light-violet',
}

function blockDepth(editor: Editor, shape: TLShape): number {
	return editor.getShapeAncestors(shape).filter(isBlockShape).length
}

/** The text actually painted by a Value-view Block before the clone mutates. */
function portableValuePillText(block: BlockShape): string | null {
	if (block.props.view !== 'value') return null
	return valueBlockText(valueBlockLabel(block.props))
}

/**
 * `P` creates a Block in its Value view, not a second custom shape type. The
 * ordinary Block detach keeps its wiring and semantic metadata; this small
 * portable-only pass freezes the capsule face rather than exporting the
 * header/footer chrome used by the other Block views.
 */
function freezeDetachedValuePill(
	editor: Editor,
	result: DetachResult,
	label: string,
): void {
	const card = editor.getShape<TLGeoShape>(result.cardId)
	if (!card || card.type !== 'geo') return

	const keep = new Set<TLShapeId>([card.id])
	for (const id of result.shapeIds) {
		const shape = editor.getShape(id)
		if (
			shape?.type === 'geo'
			&& shape.props.geo === 'ellipse'
			&& shape.props.w >= 10
			&& shape.props.h >= 10
		) {
			keep.add(shape.id)
		}
	}
	editor.deleteShapes(result.shapeIds.filter((id) => !keep.has(id)))

	// `oval` is stock tldraw's capsule. The metadata still remembers the full
	// Value Block, while the visible record no longer needs our custom geo id.
	editor.updateShape<TLGeoShape>({
		id: card.id,
		type: 'geo',
		props: { geo: 'oval' },
	})
	const frozenCard = editor.getShape<TLGeoShape>(card.id)
	if (!frozenCard) return
	const scale = 4 / 3
	editor.createShape({
		type: 'text',
		parentId: frozenCard.parentId,
		x: frozenCard.x + 20,
		y: frozenCard.y + Math.max(0, (frozenCard.props.h - 32) / 2),
		props: {
			richText: toRichText(label),
			autoSize: false,
			color: 'black',
			font: 'mono',
			scale,
			size: 's',
			textAlign: 'middle',
			w: Math.max(1, (frozenCard.props.w - 40) / scale),
		},
	})
}

function normalizeCustomGeometries(editor: Editor): void {
	for (const shape of editor.getCurrentPageShapes()) {
		const props = shape.props as unknown as Record<string, unknown>
		const portableProps: Record<string, string> = {}
		for (const key of ['color', 'labelColor']) {
			const value = props[key]
			if (typeof value === 'string' && PORTABLE_COLOR_FALLBACKS[value]) {
				portableProps[key] = PORTABLE_COLOR_FALLBACKS[value]
			}
		}
		if (Object.keys(portableProps).length > 0) {
			editor.updateShape({ id: shape.id, type: shape.type, props: portableProps })
		}
		if (
			shape.type === 'geo'
			&& (
				String((shape as TLGeoShape).props.geo) === EXCALIDRAW_ROUNDED_RECT_GEO
				|| String((shape as TLGeoShape).props.geo) === SYSTEMSKETCH_ROUNDED_RECT_GEO
			)
		) {
			const geo = shape as TLGeoShape
			const style = geo.meta.systemSketchPrimitiveStyle
			const radius = style && typeof style === 'object' && !Array.isArray(style)
				? style.cornerRadius
				: undefined
			const stockGeo = typeof radius === 'number'
				&& radius >= Math.min(geo.props.w, geo.props.h) / 2
				? 'oval'
				: 'rectangle'
			editor.updateShape<TLGeoShape>({
				id: shape.id,
				type: 'geo',
				props: { geo: stockGeo },
			})
		}
	}
}

function isSystemSketchCommentRecord(record: { typeName: string }): boolean {
	const typeName = String(record.typeName)
	return typeName === 'comment'
		|| typeName === 'comment-thread'
		|| typeName === 'comment-reaction'
}

/**
 * Serialize the current board as a stock-readable `.tldr` without touching the
 * live editor. Blocks become remembered groups of ordinary shapes (including
 * Value-view Blocks as stock oval Pills), Branches become stock frames with
 * frozen headings and an untouched child tree, data edges become stock arrows,
 * and custom rounded geos fall back to stock rectangles or ovals.
 */
export async function exportPortableTldraw(editor: Editor): Promise<string> {
	const livePageId = editor.getCurrentPageId()
	const ownerDocument = editor.getContainer().ownerDocument
	const container = ownerDocument.createElement('div')
	container.setAttribute('aria-hidden', 'true')
	container.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:1px;height:1px;overflow:hidden'
	ownerDocument.body.appendChild(container)
	let clone: Editor | null = null

	try {
			const store = createTLStore({
				shapeUtils: PORTABLE_SHAPE_UTILS,
				bindingUtils: PORTABLE_BINDING_UTILS,
				records: SYSTEMSKETCH_COMMENT_RECORDS,
				themes: SYSTEMSKETCH_THEMES,
		})
		loadSnapshot(store, structuredClone(editor.getSnapshot()))

		const exportEditor = new Editor({
			store,
			shapeUtils: PORTABLE_SHAPE_UTILS,
			bindingUtils: PORTABLE_BINDING_UTILS,
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
		clone = exportEditor

		for (const page of exportEditor.getPages()) {
			exportEditor.setCurrentPage(page.id)
			const blocks = exportEditor.getCurrentPageShapes()
				.filter(isBlockShape)
				.sort((left, right) => blockDepth(exportEditor, left) - blockDepth(exportEditor, right))
			// Capture pill text before the first detach mutates shapes. A fed inlet
			// affects the live value, not the truth of the stored literal, so the
			// portable pill freezes the same authored text as the source board.
			const valuePillLabels = new Map(blocks.map((block) => [
				block.id,
				portableValuePillText(block),
			]))
			for (const block of blocks) {
				const result = detachBlockToPrimitives(exportEditor, block.id, { mark: false })
				const label = valuePillLabels.get(block.id)
				if (result && label !== null && label !== undefined) {
					freezeDetachedValuePill(exportEditor, result, label)
				}
			}

			for (const shape of [...exportEditor.getCurrentPageShapes()]) {
				if (shape.type === CONNECTION_SHAPE_TYPE) {
					detachConnectionToArrow(exportEditor, shape as never)
				}
			}
			for (const branch of exportEditor.getCurrentPageShapes().filter(isBranchShape)) {
				detachBranchToPrimitives(exportEditor, branch.id)
			}
			for (const loop of exportEditor.getCurrentPageShapes().filter(isLoopShape)) {
				detachLoopToPrimitives(exportEditor, loop.id)
			}
			normalizeCustomGeometries(exportEditor)
		}
		if (exportEditor.getPage(livePageId)) exportEditor.setCurrentPage(livePageId)

		// A shape replacement removes bindings to the old record through normal
		// store side effects. Remove any orphaned semantic binding defensively.
		exportEditor.deleteBindings(
			exportEditor.store
				.allRecords()
				.filter((record) => record.typeName === 'binding' && record.type === 'connection')
				.map((record) => record.id),
			)
		// Local discussion is a SystemSketch feature. A stock `.tldr` has no
		// schema for these opt-in records, so strip them from the isolated clone.
		exportEditor.store.remove(
			exportEditor.store
				.allRecords()
				.filter(isSystemSketchCommentRecord)
				.map((record) => record.id),
		)
		assertStockPrimitives(exportEditor.store.allRecords())
		return await serializeTldrawJson(exportEditor)
	} finally {
		clone?.dispose()
		container.remove()
	}
}

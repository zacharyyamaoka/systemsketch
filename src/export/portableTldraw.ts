import {
	Editor,
	createShapeId,
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
	type TLFrameShape,
	type TLGeoShape,
	type TLShape,
	type TLShapeId,
	type TLShapePartial,
} from 'tldraw'

import { EXCALIDRAW_ROUNDED_RECT_GEO, EXCALIDRAW_SHAPE_UTILS } from '../excalidrawInterop'
import { SYSTEMSKETCH_THEMES } from '../appearance/figjamPalette'
import { BlockShapeUtil, isBlockShape } from '../blocks'
import {
	BRANCH_SHAPE_TYPE,
	BranchShapeUtil,
	branchLayout,
	isBranchShape,
	type BranchShape,
} from '../branch'
import {
	CONNECTION_SHAPE_TYPE,
	blockConnectionBindingUtils,
	blockConnectionShapeUtils,
	getConnectionTerminals,
	type ConnectionShape,
} from '../blocks/connections'
import { detachBlockToPrimitives } from '../blocks/detach'
import { SYSTEMSKETCH_COMMENT_RECORDS } from '../comments'

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
		BlockShapeUtil,
		BranchShapeUtil,
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

const PORTABLE_BRANCH_FORMAT_VERSION = 1

function branchLine(
	parentId: TLShapeId,
	y: number,
	width: number,
	weight: 's' | 'm' = 's',
): TLShapePartial {
	return {
		id: createShapeId(),
		type: 'line',
		parentId,
		x: 0,
		y,
		props: {
			points: {
				a1: { id: 'a1', index: 'a1' as never, x: 0, y: 0 },
				a2: { id: 'a2', index: 'a2' as never, x: width, y: 0 },
			},
			color: 'grey',
			dash: 'solid',
			size: weight,
		},
	}
}

function branchText(
	parentId: TLShapeId,
	text: string,
	box: { x: number; y: number; w: number },
	options: { align?: 'start' | 'middle'; color?: 'black' | 'grey'; font?: 'sans' | 'mono'; scale?: number } = {},
): TLShapePartial | null {
	if (!text) return null
	const scale = options.scale ?? 0.78
	return {
		id: createShapeId(),
		type: 'text',
		parentId,
		x: box.x,
		y: box.y,
		props: {
			richText: toRichText(text),
			autoSize: false,
			color: options.color ?? 'black',
			font: options.font ?? 'sans',
			scale,
			size: 's',
			textAlign: options.align ?? 'start',
			w: Math.max(1, box.w / scale),
		},
	}
}

/**
 * Freeze a Branch region into stock frame chrome while retaining its identity
 * and child tree. Updating the isolated store record in place is important:
 * deleting a frame-like record would also delete descendants and bindings,
 * while reparenting nested regions out and back can perturb their transforms.
 */
function detachBranchToStockFrame(editor: Editor, branch: BranchShape): void {
	const layout = branchLayout(branch.props)
	const priorSystemSketchMeta = branch.meta.systemSketch
	const frame: TLFrameShape = {
		...branch,
		type: 'frame',
		props: {
			w: branch.props.w,
			h: branch.props.h,
			name: branch.props.title || 'Branch',
			color: 'black',
		},
		meta: {
			...branch.meta,
			systemSketch: {
				...(priorSystemSketchMeta && typeof priorSystemSketchMeta === 'object' && !Array.isArray(priorSystemSketchMeta)
					? priorSystemSketchMeta
					: {}),
				kind: 'branch',
				version: PORTABLE_BRANCH_FORMAT_VERSION,
				props: structuredClone(branch.props),
			},
		},
	} as unknown as TLFrameShape

	// The id, parent, transform and index do not change, so direct children,
	// nested Branches and arrow bindings remain attached to the same region.
	editor.store.put([frame])

	const chrome: Array<TLShapePartial | null> = [
		branchLine(branch.id, layout.band.h, layout.w),
		branchText(
			branch.id,
			branch.props.title || 'Branch',
			{ x: 12, y: 7, w: Math.max(1, layout.w - 24) },
			{ align: 'middle', font: 'mono', scale: 0.86 },
		),
	]

	for (const control of layout.controls) {
		chrome.push({
			id: createShapeId(),
			type: 'geo',
			parentId: branch.id,
			x: Math.max(1, control.x + 1),
			y: control.y - 5,
			props: {
				geo: 'ellipse',
				w: 10,
				h: 10,
				color: 'yellow',
				fill: 'semi',
				dash: 'solid',
				size: 's',
			},
		})
		chrome.push(branchText(
			branch.id,
			[control.port.name, control.port.type].filter(Boolean).join(': '),
			{ x: 15, y: control.y - 9, w: Math.min(140, Math.max(1, layout.w * 0.3)) },
			{ color: 'grey', scale: 0.66 },
		))
	}

	for (const row of layout.arms) {
		if (row.dividerY !== null) chrome.push(branchLine(branch.id, row.dividerY, layout.w, 'm'))
		chrome.push(branchText(
			branch.id,
			`${row.arm.open ? '⌄' : '›'} ${row.arm.title || 'case'}`,
			{ x: 10, y: row.rowTop + 5, w: Math.max(1, layout.w - 20) },
			{ scale: 0.74 },
		))
	}

	editor.createShapes(chrome.filter((shape): shape is TLShapePartial => shape !== null))
}

/**
 * A malformed or interrupted cable should not make the whole export invalid.
 * Normal cables disappear while their Blocks detach; this fallback turns any
 * surviving loose semantic cable into a plain stock arrow with the same ends.
 */
function detachLooseConnection(editor: Editor, connection: ConnectionShape): void {
	const terminals = getConnectionTerminals(editor, connection)
	editor.deleteShape(connection.id)
	editor.createShape({
		id: connection.id,
		type: 'arrow',
		parentId: connection.parentId,
		x: connection.x,
		y: connection.y,
		rotation: connection.rotation,
		index: connection.index,
		props: {
			start: terminals.start,
			end: terminals.end,
			kind: connection.props.routing === 'elbow' ? 'elbow' : 'arc',
			arrowheadStart: 'none',
			arrowheadEnd: 'none',
		},
		meta: connection.meta,
	})
	// Deleting the custom record also removes its custom bindings. Reusing the id
	// keeps any metadata reference stable without teaching stock tldraw a new id.
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
			&& String((shape as TLGeoShape).props.geo) === EXCALIDRAW_ROUNDED_RECT_GEO
		) {
			editor.updateShape<TLGeoShape>({
				id: shape.id,
				type: 'geo',
				props: { geo: 'rectangle' },
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

function assertPortableRecords(editor: Editor): void {
	const customShapes = editor.store
		.allRecords()
		.filter((record) => record.typeName === 'shape')
		.filter((record) => (
			record.type === 'block'
			|| record.type === BRANCH_SHAPE_TYPE
			|| record.type === CONNECTION_SHAPE_TYPE
		))
	const customBindings = editor.store
		.allRecords()
		.filter((record) => record.typeName === 'binding' && record.type === 'connection')
	const commentRecords = editor.store
		.allRecords()
		.filter(isSystemSketchCommentRecord)
	if (customShapes.length || customBindings.length || commentRecords.length) {
		throw new Error('Portable export still contains SystemSketch-only records')
	}
}

/**
 * Serialize the current board as a stock-readable `.tldr` without touching the
 * live editor. Blocks become remembered groups of ordinary shapes, Branches
 * become stock frames with frozen headings and an untouched child tree, data
 * edges become stock arrows, and the custom Excalidraw rounded geo falls back
 * to the stock rectangle it visually extends.
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
			for (const block of blocks) detachBlockToPrimitives(exportEditor, block.id, { mark: false })

			for (const shape of [...exportEditor.getCurrentPageShapes()]) {
				if (shape.type === CONNECTION_SHAPE_TYPE) {
					detachLooseConnection(exportEditor, shape as ConnectionShape)
				}
			}
			for (const branch of exportEditor.getCurrentPageShapes().filter(isBranchShape)) {
				detachBranchToStockFrame(exportEditor, branch)
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
		assertPortableRecords(exportEditor)
		return await serializeTldrawJson(exportEditor)
	} finally {
		clone?.dispose()
		container.remove()
	}
}

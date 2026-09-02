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
	type TLAnyBindingUtilConstructor,
	type TLAnyShapeUtilConstructor,
	type TLGeoShape,
	type TLShape,
} from 'tldraw'

import { EXCALIDRAW_ROUNDED_RECT_GEO, EXCALIDRAW_SHAPE_UTILS } from '../excalidrawInterop'
import { SYSTEMSKETCH_THEMES } from '../appearance/figjamPalette'
import { BlockShapeUtil, isBlockShape } from '../blocks'
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
		.filter((record) => record.type === 'block' || record.type === CONNECTION_SHAPE_TYPE)
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
 * live editor. Blocks become remembered groups of ordinary shapes, data edges
 * become stock arrows, and the custom Excalidraw rounded geo falls back to the
 * stock rectangle it visually extends.
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

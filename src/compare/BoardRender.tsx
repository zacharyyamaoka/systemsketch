/**
 * One board, rendered by the real SystemSketch renderer, read-only.
 *
 * The contract's third rule says it plainly: *"there is no second renderer and
 * no derived drawing — the diff is the real board plus marks."* So this is not
 * a screenshot, not an SVG export and not a mock. It is a second `<Tldraw>`
 * mount over its own throwaway store, with the same Block, connection, Branch
 * and Loop utils the product canvas registers, and with the UI removed.
 *
 * The composition list below is deliberately declared here rather than shared
 * with `App.tsx`. That is the repo's own precedent — `EmbeddedCanvas` declares
 * `EMBEDDED_SHAPE_UTILS` the same way — and `tests/test_stock_boundary.py`
 * asserts the product list literally inside `App.tsx`, so hoisting it into a
 * common module would break the rule this project rests on.
 *
 * Nothing here attaches the workspace: no `attach(editor)`, no persistence key,
 * no autosave. A comparison view that could write to a file would be a second
 * way to edit the document, and there is only supposed to be one.
 */

import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import {
	Tldraw,
	loadSnapshot,
	useEditor,
	useValue,
	type Editor,
	type TLShapeId,
	type TLStoreSnapshot,
} from 'tldraw'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'

import { EXCALIDRAW_SHAPE_UTILS } from '../excalidrawInterop'
import { BlockShapeUtil, getBlockShapeVisibility } from '../blocks'
import { BranchArmShapeUtil, BranchShapeUtil } from '../branch'
import { LoopShapeUtil } from '../loop'
import { blockConnectionBindingUtils, blockConnectionShapeUtils } from '../blocks/connections'
import { createSystemSketchStore } from '../store/createSystemSketchStore'
import { SYSTEMSKETCH_STOCK_PRIMITIVE_SHAPE_UTILS } from '../stockPrimitiveVisuals'
import { SYSTEMSKETCH_ARROW_SHAPE_UTILS } from '../systemSketchArrow'
import { SYSTEMSKETCH_THEMES } from '../appearance/figjamPalette'
import type { ChangeKind } from './compareModel'

const ASSET_URLS = getAssetUrlsByImport()
const TLDRAW_LICENSE_KEY = __TLDRAW_LICENSE_KEY__ || undefined
const COMPARE_EDITOR_OPTIONS = { maxPages: 1 }

const COMPARE_SHAPE_UTILS = [
	...EXCALIDRAW_SHAPE_UTILS,
	...SYSTEMSKETCH_ARROW_SHAPE_UTILS,
	...SYSTEMSKETCH_STOCK_PRIMITIVE_SHAPE_UTILS,
	BlockShapeUtil,
	BranchShapeUtil,
	BranchArmShapeUtil,
	LoopShapeUtil,
	...blockConnectionShapeUtils,
]
const COMPARE_BINDING_UTILS = [...blockConnectionBindingUtils]

export interface HighlightTarget {
	readonly shapeId: string | null
	readonly kind: ChangeKind | null
	/**
	 * The change's subject ('block' | 'port' | 'cable' | 'shape'), optional so
	 * the existing `CompareDialog` call sites that build a `HighlightTarget`
	 * without it keep compiling untouched. Only `HighlightMark` reads it, to
	 * pick the cable-only shadow treatment below instead of the box.
	 */
	readonly subject?: string | null
}

/**
 * The mark, and only the mark.
 *
 * Simulink's Comparison Tool is the reference here and it is worth copying
 * exactly: selecting a changed item in the tree draws *a plain rectangle around
 * the block in the ordinary, unmodified editor*. It does not tint the block,
 * resize it, or annotate it. The detail belongs in the table; the canvas only
 * has to answer "which one".
 *
 * Rendered through the `OnTheCanvas` seam so it lives in page space and the
 * camera transform carries it for free — no camera subscription, no
 * re-projection on every pan.
 *
 * The one exception is a cable: it routes as an elbow, so a bounding box
 * would be a big rectangle that says nothing about which line is meant. That
 * subject gets a drop-shadow under its own stroke instead — see the branch
 * inside `HighlightMark`.
 */
const NO_HIGHLIGHT: HighlightTarget = { shapeId: null, kind: null, subject: null }

/**
 * The highlight reaches the mark through context, not through `components`.
 *
 * `components` must keep one object identity for the life of the mount —
 * handing `<Tldraw>` a fresh object remounts the canvas, which would reset the
 * camera on every row click. A context update propagates into tldraw's tree
 * without touching that identity, which a ref cannot do.
 */
const HighlightContext = createContext<HighlightTarget>(NO_HIGHLIGHT)

function HighlightMark() {
	const target = useContext(HighlightContext)
	const editor = useEditor()
	// Unconditional and at the top regardless of which branch below fires —
	// the cable branch doesn't need the box, but a hook can't be skipped.
	const box = useValue(
		'compare-highlight',
		() => {
			if (!target.shapeId) return null
			const bounds = editor.getShapePageBounds(target.shapeId as TLShapeId)
			if (!bounds) return null
			return { x: bounds.minX, y: bounds.minY, w: bounds.width, h: bounds.height }
		},
		[editor, target.shapeId],
	)
	if (!target.shapeId) return null

	if (target.subject === 'cable') {
		// A cable routes as an elbow, so its bounding box is a big rectangle
		// that says nothing about which line is meant — with several cables
		// routed close together it's ambiguous which one changed. tldraw
		// already renders the connection as a real SVG <path>, so a CSS
		// drop-shadow on its `.tl-shape` wrapper follows the routed stroke
		// exactly, dash pattern included, with no geometry re-derived here.
		// The ids are internal, never user text, but the rule is still
		// string-built — refuse rather than risk breaking out of the selector.
		const shapeId = target.shapeId
		if (shapeId.includes('"') || shapeId.includes('\\')) return null
		return (
			<style>{`.systemsketch-compare__canvas .tl-shape[data-shape-id="${shapeId}"] { filter: drop-shadow(0 0 3px color-mix(in srgb, var(--ss-accent) 75%, transparent)) drop-shadow(0 0 7px color-mix(in srgb, var(--ss-accent) 45%, transparent)); }`}</style>
		)
	}

	if (!box) return null
	const pad = 8
	return (
		<div
			className="systemsketch-compare__mark"
			data-testid="compare-highlight-mark"
			data-kind={target.kind ?? 'modified'}
			style={{
				position: 'absolute',
				left: box.x - pad,
				top: box.y - pad,
				width: box.w + pad * 2,
				height: box.h + pad * 2,
				pointerEvents: 'none',
			}}
		/>
	)
}

export interface BoardRenderProps {
	snapshot: TLStoreSnapshot | null
	/** Which side of the comparison this is; only used for test ids. */
	side: 'before' | 'after'
	highlight: HighlightTarget
	/** Hand the mounted editor up so the parent can lock the two cameras. */
	onEditorChange?: (editor: Editor | null) => void
	/** Clicking a shape on the canvas selects its row in the table. */
	onShapePicked?: (shapeId: string) => void
}

export function BoardRender({
	snapshot,
	side,
	highlight,
	onEditorChange,
	onShapePicked,
}: BoardRenderProps) {
	const [store] = useState(createSystemSketchStore)
	const [editor, setEditor] = useState<Editor | null>(null)
	const pickedRef = useRef(onShapePicked)
	pickedRef.current = onShapePicked

	useEffect(() => () => store.dispose(), [store])

	const components = useMemo(() => ({ OnTheCanvas: HighlightMark }), [])

	const onMount = useCallback(
		(mounted: Editor) => {
			// A comparison is looked at, not drawn on.
			mounted.updateInstanceState({ isReadonly: true })
			mounted.setCurrentTool('hand')
			setEditor(mounted)
			onEditorChange?.(mounted)
			return () => {
				onEditorChange?.(null)
			}
		},
		[onEditorChange],
	)

	// Load the snapshot as a remote change so it never lands on the undo stack.
	useEffect(() => {
		if (!editor || !snapshot) return
		editor.store.mergeRemoteChanges(() => {
			loadSnapshot(editor.store, snapshot)
		})
		editor.updateInstanceState({ isReadonly: true })
		editor.zoomToFit({ animation: { duration: 0 } })
	}, [editor, snapshot])

	// Canvas → table. Reading the selection rather than the pointer keeps this
	// on tldraw's own event lifecycle instead of guessing hit-testing.
	useEffect(() => {
		if (!editor) return
		return editor.store.listen(
			() => {
				const selected = editor.getSelectedShapeIds()
				if (selected.length !== 1) return
				pickedRef.current?.(selected[0])
			},
			{ scope: 'session', source: 'user' },
		)
	}, [editor])

	return (
		<div className="systemsketch-compare__canvas" data-testid={`compare-canvas-${side}`}>
			{snapshot ? (
				<HighlightContext.Provider value={highlight}>
				<Tldraw
					assetUrls={ASSET_URLS}
					bindingUtils={COMPARE_BINDING_UTILS}
					components={components}
					getShapeVisibility={getBlockShapeVisibility}
					hideUi
					licenseKey={TLDRAW_LICENSE_KEY}
					onMount={onMount}
					options={COMPARE_EDITOR_OPTIONS}
					shapeUtils={COMPARE_SHAPE_UTILS}
					store={store}
					themes={SYSTEMSKETCH_THEMES}
				/>
				</HighlightContext.Provider>
			) : (
				<p className="systemsketch-compare__empty">No snapshot loaded.</p>
			)}
		</div>
	)
}

/**
 * Lock a follower camera to a leader's.
 *
 * Without this the Overlay slider is meaningless — crossfading two boards
 * framed differently shows the framing changing, not the board. It matters in
 * Side by side too, which is why Simulink ships a "Linked Scrolling" checkbox
 * turned on by default.
 */
export function useLinkedCameras(leader: Editor | null, follower: Editor | null) {
	useEffect(() => {
		if (!leader || !follower) return
		let applying = false
		const sync = (from: Editor, to: Editor) => {
			if (applying) return
			applying = true
			const camera = from.getCamera()
			const current = to.getCamera()
			if (camera.x !== current.x || camera.y !== current.y || camera.z !== current.z) {
				to.setCamera({ x: camera.x, y: camera.y, z: camera.z }, { immediate: true })
			}
			applying = false
		}
		const stopLeader = leader.store.listen(() => sync(leader, follower), { scope: 'session' })
		const stopFollower = follower.store.listen(() => sync(follower, leader), { scope: 'session' })
		sync(leader, follower)
		return () => {
			stopLeader()
			stopFollower()
		}
	}, [leader, follower])
}

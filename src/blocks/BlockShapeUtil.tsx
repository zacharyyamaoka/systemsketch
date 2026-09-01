import {
	BaseFrameLikeShapeUtil,
	Circle2d,
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
	Group2d,
	Rectangle2d,
	type RecordProps,
	type TLDragShapesInInfo,
	type TLDragShapesOutInfo,
	type TLResizeInfo,
	type TLShape,
} from 'tldraw'
import {
	BLOCK_SHAPE_PROPS,
	BLOCK_SHAPE_TYPE,
	canReparentDraggedShapesIntoBlock,
	canBlockContainChildren,
	findBlockContainmentTarget,
	getDefaultBlockProps,
	mergeBlockResizeProps,
	resizeBlockProps,
	type BlockShape,
} from './blockModel'
import {
	blockInlineFieldAtPoint,
	blockInlineFieldFromClientPoint,
	clearBlockInlineField,
	ensureBlockInlineField,
	rememberBlockInlineField,
} from './inlineBlockEditing'
import {
	BLOCK_CORNER_RADIUS,
	BLOCK_PORT_RADIUS,
	layoutBlock,
	type BlockLayout,
} from './layoutBlock'
import { BlockCanvas } from './ui/BlockCanvas'
import { stepIntoDepthScope } from '../depth/depthNavigation'

const blockVersions = createShapePropsMigrationIds(BLOCK_SHAPE_TYPE, {
	RestorePyblocksUi: 1,
	PortLayoutStyle: 2,
})

const LEGACY_VIEW_SIZES = {
	simple: { w: 240, h: 148 },
	port: { w: 360, h: 230 },
	expanded: { w: 640, h: 430 },
} as const

const RESTORED_VIEW_SIZES = {
	simple: { w: 320, h: 206 },
	port: { w: 340, h: 198 },
	expanded: { w: 560, h: 380 },
} as const

function exportPortColor(type: string): string {
	const normalized = type.trim().toLowerCase()
	if (normalized === 'image') return '#c060e0'
	if (normalized === 'text' || normalized === 'str' || normalized === 'string') return '#4caf50'
	if (normalized === 'model') return '#2196f3'
	if (normalized === 'number' || normalized === 'int' || normalized === 'float') return '#9e9e9e'
	if (normalized === 'latent') return '#ff9800'
	return '#c08520'
}

/** SVG export mirrors the restored face without depending on browser HTML/CSS. */
function BlockExportSvg({ shape }: { shape: BlockShape }) {
	const layout = layoutBlock(shape.props)
	const { w, h } = layout.bounds
	const surface = '#ffffff'
	const ink = '#27272a'
	const muted = '#a1a1aa'
	const divider = '#e4e4e7'

	return (
		<g pointerEvents="none">
			<rect
				x={0.75}
				y={0.75}
				width={Math.max(0, w - 1.5)}
				height={Math.max(0, h - 1.5)}
				rx={BLOCK_CORNER_RADIUS}
				fill={surface}
				stroke="#dedee3"
				strokeWidth={1}
			/>

			{layout.header ? (
				<>
					<line x1={1} y1={layout.header.h} x2={Math.max(1, w - 1)} y2={layout.header.h} stroke={divider} />
					<text x={12} y={layout.header.h / 2} dominantBaseline="middle" fill={ink} fontFamily="ui-monospace, monospace" fontSize={36} fontWeight={500}>
						{shape.props.title}
					</text>
					<text x={Math.max(12, w - 12)} y={layout.header.h / 2} dominantBaseline="middle" textAnchor="end" fill={muted} fontFamily="ui-sans-serif, system-ui" fontSize={18}>
						{shape.props.blockType}
					</text>
				</>
			) : (
				<>
					<text x={w / 2} y={layout.title ? layout.title.y + layout.title.h / 2 : h / 2} textAnchor="middle" dominantBaseline="middle" fill={ink} fontFamily="ui-sans-serif, system-ui" fontSize={44} fontWeight={600}>
						{shape.props.title}
					</text>
					{layout.typeLabel ? (
						<text x={w / 2} y={layout.typeLabel.y + layout.typeLabel.h / 2} textAnchor="middle" dominantBaseline="middle" fill={muted} fontFamily="ui-sans-serif, system-ui" fontSize={18}>
							{shape.props.blockType}
						</text>
					) : null}
				</>
			)}

			{layout.description ? (
				<text
					x={layout.view === 'simple' ? w / 2 : layout.description.x}
					y={layout.description.y + layout.description.h / 2}
					textAnchor={layout.view === 'simple' ? 'middle' : 'start'}
					dominantBaseline="middle"
					fill={muted}
					fontFamily="ui-sans-serif, system-ui"
					fontSize={layout.view === 'simple' ? 18 : 11}
				>
					{shape.props.description}
				</text>
			) : null}

			{layout.dividers.map((rule, index) => (
				<line key={index} x1={rule.x} y1={rule.y} x2={rule.x + rule.w} y2={rule.y} stroke={divider} />
			))}
			{layout.header ? (
				<line x1={1} y1={layout.footerTop} x2={Math.max(1, w - 1)} y2={layout.footerTop} stroke={divider} />
			) : null}

			{layout.ports.filter((placed) => !placed.subtle).map((placed) => (
				<g key={`${placed.side}:${placed.port.id}`}>
					<circle cx={placed.x} cy={placed.y} r={BLOCK_PORT_RADIUS} fill={surface} stroke={exportPortColor(placed.port.type)} strokeWidth={2} />
					{placed.label ? (
						<>
							<text
								x={placed.side === 'input' ? placed.label.x : placed.label.x + placed.label.w}
								y={placed.y}
								textAnchor={placed.side === 'input' ? 'start' : 'end'}
								dominantBaseline="middle"
								fill={ink}
								fontFamily="ui-sans-serif, system-ui"
								fontSize={18}
							>
								{placed.port.name}
							</text>
						</>
					) : null}
				</g>
			))}
		</g>
	)
}

/** The concrete tldraw bridge for SystemSketch's semantic Block. */
export class BlockShapeUtil extends BaseFrameLikeShapeUtil<BlockShape> {
	static override type = BLOCK_SHAPE_TYPE
	static override props: RecordProps<BlockShape> = BLOCK_SHAPE_PROPS
	static override migrations = createShapePropsMigrationSequence({
		sequence: [{
			id: blockVersions.RestorePyblocksUi,
			up(props) {
				const view = props.view as keyof typeof LEGACY_VIEW_SIZES
				const views = props.views as Record<string, { w?: number; h?: number }> | undefined
				if (!views || !(view in LEGACY_VIEW_SIZES)) return
				const nextViews = { ...views }
				for (const key of Object.keys(LEGACY_VIEW_SIZES) as (keyof typeof LEGACY_VIEW_SIZES)[]) {
					const box = views[key]
					const legacy = LEGACY_VIEW_SIZES[key]
					if (box?.w === legacy.w && box?.h === legacy.h) {
						nextViews[key] = { ...RESTORED_VIEW_SIZES[key] }
					}
				}
				const activeLegacy = LEGACY_VIEW_SIZES[view]
				if (props.w === activeLegacy.w && props.h === activeLegacy.h) {
					props.w = nextViews[view]?.w ?? props.w
					props.h = nextViews[view]?.h ?? props.h
				}
				props.views = nextViews
			},
			down(props) {
				const view = props.view as keyof typeof RESTORED_VIEW_SIZES
				const views = props.views as Record<string, { w?: number; h?: number }> | undefined
				if (!views || !(view in RESTORED_VIEW_SIZES)) return
				const nextViews = { ...views }
				for (const key of Object.keys(RESTORED_VIEW_SIZES) as (keyof typeof RESTORED_VIEW_SIZES)[]) {
					const box = views[key]
					const restored = RESTORED_VIEW_SIZES[key]
					if (box?.w === restored.w && box?.h === restored.h) {
						nextViews[key] = { ...LEGACY_VIEW_SIZES[key] }
					}
				}
				const activeRestored = RESTORED_VIEW_SIZES[view]
				if (props.w === activeRestored.w && props.h === activeRestored.h) {
					props.w = nextViews[view]?.w ?? props.w
					props.h = nextViews[view]?.h ?? props.h
				}
				props.views = nextViews
			},
		}, {
			id: blockVersions.PortLayoutStyle,
			up(props) {
				// portLayout became a tldraw StyleProp so that a multi-selection can
				// switch Aligned/Offset in one write. A style prop cannot be optional,
				// so every stored Block needs the donor default made explicit.
				if (props.portLayout === undefined) props.portLayout = 'inline'
			},
			// The pre-style validator accepted a present portLayout, so stepping
			// back down needs no change to the record.
			down: 'none',
		}],
	})

	override getDefaultProps(): BlockShape['props'] {
		return getDefaultBlockProps()
	}

	override onBeforeUpdate(previous: BlockShape, next: BlockShape): BlockShape | void {
		const viewChanged = previous.props.view !== next.props.view
		const sizeChanged = previous.props.w !== next.props.w || previous.props.h !== next.props.h
		const remembered = next.props.views[next.props.view]
		const rememberedChanged =
			previous.props.views[next.props.view].w !== remembered.w ||
			previous.props.views[next.props.view].h !== remembered.h

		// Commands should normally use setBlockViewProps. This guard also makes a
		// direct/imported view write safe by restoring that view's parked box.
		if (viewChanged && (next.props.w !== remembered.w || next.props.h !== remembered.h)) {
			return {
				...next,
				props: { ...next.props, w: remembered.w, h: remembered.h },
			}
		}

		// tldraw owns top-level w/h during resize and layout operations. Mirror
		// those writes back into the active view's memory.
		if (sizeChanged && (remembered.w !== next.props.w || remembered.h !== next.props.h)) {
			return { ...next, props: resizeBlockProps(next.props, next.props.w, next.props.h) }
		}

		// A model/inspector may write the active remembered box directly.
		if (rememberedChanged && !sizeChanged) {
			return { ...next, props: { ...next.props, w: remembered.w, h: remembered.h } }
		}
	}

	override canResizeChildren(_shape: BlockShape): boolean {
		return false
	}

	override hideRotateHandle(_shape: BlockShape): boolean {
		return true
	}

	override isAspectRatioLocked(_shape: BlockShape): boolean {
		return false
	}

	override getAriaDescriptor(shape: BlockShape): string {
		return `${shape.props.title || 'Untitled Block'}, ${shape.props.view} view`
	}

	override getText(shape: BlockShape): string {
		return shape.props.title
	}

	override canEdit(_shape: BlockShape): boolean {
		return true
	}

	/**
	 * tldraw owns the editing lifecycle; the restored HTML face only selects
	 * which semantic Block field that lifecycle exposes.
	 */
	override onDoubleClick(shape: BlockShape) {
		const screenPoint = this.editor.inputs.getCurrentScreenPoint()
		const editorContainer = this.editor.getContainer()
		const containerBounds = editorContainer.getBoundingClientRect()
		const domField = blockInlineFieldFromClientPoint(
			editorContainer.ownerDocument,
			{
				x: containerBounds.left + screenPoint.x,
				y: containerBounds.top + screenPoint.y,
			},
			shape.id,
		)
		if (shape.props.view === 'expanded' && !domField) {
			stepIntoDepthScope(this.editor, shape.id)
			// A truthy no-op partial tells tldraw that the double-click was handled,
			// preserving inline editing only for the real editable fields above.
			return { id: shape.id, type: shape.type, props: {} }
		}
		const localPoint = this.editor.getPointInShapeSpace(
			shape,
			this.editor.inputs.getCurrentPagePoint(),
		)
		rememberBlockInlineField(
			this.editor,
			shape.id,
			domField ?? blockInlineFieldAtPoint(shape.props, localPoint),
		)
	}

	override onDoubleClickEdge(shape: BlockShape) {
		if (shape.props.view !== 'expanded') return
		stepIntoDepthScope(this.editor, shape.id)
		return { id: shape.id, type: shape.type, props: {} }
	}

	override onDoubleClickCorner(shape: BlockShape) {
		if (shape.props.view !== 'expanded') return
		stepIntoDepthScope(this.editor, shape.id)
		return { id: shape.id, type: shape.type, props: {} }
	}

	override onEditStart(shape: BlockShape): void {
		ensureBlockInlineField(this.editor, shape.id)
	}

	override onEditEnd(shape: BlockShape): void {
		clearBlockInlineField(this.editor, shape.id)
	}

	override getGeometry(shape: BlockShape) {
		const layout = layoutBlock(shape.props)
		const isContainer = canBlockContainChildren(shape.props.view)
		const body = new Rectangle2d({
			width: layout.bounds.w,
			height: layout.bounds.h,
			isFilled: !isContainer,
		})
		const header = isContainer && layout.header
			? new Rectangle2d({
					width: layout.header.w,
					height: layout.header.h,
					isFilled: true,
					isLabel: true,
				})
			: null
		const portGeometry = layout.ports
			.filter((port) => !port.subtle)
			.map((port) => new Circle2d({
				x: port.x - BLOCK_PORT_RADIUS,
				y: port.y - BLOCK_PORT_RADIUS,
				radius: BLOCK_PORT_RADIUS,
				isFilled: true,
				isLabel: true,
				excludeFromShapeBounds: true,
			}))
		return new Group2d({ children: [body, ...(header ? [header] : []), ...portGeometry] })
	}

	override component(shape: BlockShape) {
		return <BlockCanvas shape={shape} />
	}

	override toSvg(shape: BlockShape) {
		return <BlockExportSvg shape={shape} />
	}

	override getIndicatorPath(shape: BlockShape): Path2D {
		const { w, h } = layoutBlock(shape.props).bounds
		const path = new Path2D()
		path.roundRect(0, 0, w, h, BLOCK_CORNER_RADIUS)
		const drawn = new Set<string>()
		for (const port of layoutBlock(shape.props).ports) {
			if (port.subtle) continue
			const key = `${Math.round(port.x)}:${Math.round(port.y)}`
			if (drawn.has(key)) continue
			drawn.add(key)
			path.moveTo(port.x + 9, port.y)
			path.arc(port.x, port.y, 9, 0, Math.PI * 2)
		}
		return path
	}

	private getContainerTarget(shape: BlockShape, allowAncestorProxy: boolean): BlockShape | undefined {
		const ancestors = this.editor.getShapeAncestors(shape)
		return findBlockContainmentTarget(shape, ancestors, allowAncestorProxy)
	}

	override isFrameLike(shape: BlockShape): boolean {
		return canBlockContainChildren(shape.props.view)
	}

	override canReceiveNewChildrenOfType(shape: BlockShape, type: TLShape['type']): boolean {
		if (canBlockContainChildren(shape.props.view)) {
			return super.canReceiveNewChildrenOfType(shape, type)
		}
		// Do not proxy while createShape is finding a parent. A collapsed child
		// must decline so tldraw can continue to the expanded frame behind it.
		if (this.editor.getPath() !== 'select.translating') return false
		const container = this.getContainerTarget(shape, true)
		return Boolean(container && super.canReceiveNewChildrenOfType(container, type))
	}

	override canRemoveChildrenOfType(shape: BlockShape, type: TLShape['type']): boolean {
		return canBlockContainChildren(shape.props.view)
			? super.canRemoveChildrenOfType(shape, type)
			: true
	}

	/** Semantic cables may cross an Expanded Block's frame boundary. */
	override shouldClipChild(child: TLShape): boolean {
		return child.type !== 'connection' && super.shouldClipChild(child)
	}

	override getClipPath(shape: BlockShape) {
		return canBlockContainChildren(shape.props.view) ? super.getClipPath(shape) : undefined
	}

	override isExportBoundsContainer(shape: BlockShape): boolean {
		return canBlockContainChildren(shape.props.view)
	}

	override onDragShapesIn(
		shape: BlockShape,
		draggingShapes: TLShape[],
		info: TLDragShapesInInfo,
	): void {
		const container = this.getContainerTarget(shape, true)
		if (
			!container
			|| container.isLocked
			|| !canReparentDraggedShapesIntoBlock(container, draggingShapes)
		) return
		super.onDragShapesIn(container, draggingShapes, info)
	}

	override onDragShapesOut(
		shape: BlockShape,
		draggingShapes: TLShape[],
		info: TLDragShapesOutInfo,
	): void {
		const container = this.getContainerTarget(shape, true)
		if (!container) return
		super.onDragShapesOut(container, draggingShapes, info)
	}

	override onResize(shape: BlockShape, info: TLResizeInfo<BlockShape>) {
		const resized = super.onResize(shape, info)
		return {
			...resized,
			props: mergeBlockResizeProps(shape.props, resized.props ?? {}),
		}
	}
}

export type { BlockLayout }

import {
	BaseFrameLikeShapeUtil,
	Rectangle2d,
	Stadium2d,
	type RecordProps,
	type TLDragShapesInInfo,
	type TLDragShapesOutInfo,
	type TLResizeInfo,
	type TLShape,
} from 'tldraw'
import {
	BLOCK_SHAPE_PROPS,
	BLOCK_SHAPE_TYPE,
	PILL_TOOL_ID,
	canReparentDraggedShapesIntoBlock,
	canBlockContainChildren,
	getDefaultBlockProps,
	mergeBlockResizeProps,
	resizeBlockProps,
	type BlockShape,
} from './blockModel'
import { blockShapeMigrations } from './blockShapeMigrations'
import {
	createValueBlockProps,
	isBlankBlockProps,
	normalizeValueBlockProps,
	valueBlockLabel,
	valueBlockText,
} from './valueBlock'
import { applyCanvasPillSignature, canvasPortSignaturePatch } from './canvasPython'
import { patchBlockPortProps } from './commands/blockCommands'
import {
	blockInlineFieldAtPoint,
	blockInlineFieldFromClientPoint,
	clearBlockInlineField,
	ensureBlockInlineField,
	getBlockInlineField,
	rememberBlockInlineField,
} from './inlineBlockEditing'
import { commitBlockDefinitionName } from './definitions/definitionLinking'
import { containerHitGeometry } from './containerGeometry'
import {
	BLOCK_CORNER_RADIUS,
	BLOCK_PORT_RADIUS,
	VALUE_FONT_PX,
	layoutBlock,
	portLabelHitArea,
	type BlockLayout,
} from './layoutBlock'
import { BlockCanvas } from './ui/BlockCanvas'
import { stepIntoDepthScope } from '../depth/depthNavigation'
import { steppedInResizeRelocation } from './avoidSiblingOcclusion'
import {
	BranchArmShapeUtil,
	isBranchArmShape,
	type BranchArmShape,
} from '../branch/BranchArmShapeUtil'

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

	if (layout.view === 'value') {
		return (
			<g pointerEvents="none">
				<rect x={0.75} y={0.75} width={Math.max(0, w - 1.5)} height={Math.max(0, h - 1.5)} rx={h / 2} fill="#f4f4f5" stroke="#9ca3af" strokeWidth={1.5} />
				<text x={w / 2} y={h / 2} textAnchor="middle" dominantBaseline="middle" fill={ink} fontFamily="ui-monospace, monospace" fontSize={VALUE_FONT_PX} fontWeight={500}>
					{valueBlockText(valueBlockLabel(shape.props))}
				</text>
				{layout.ports.filter((placed) => !placed.subtle).map((placed) => (
					<circle key={`${placed.side}:${placed.port.id}`} cx={placed.x} cy={placed.y} r={BLOCK_PORT_RADIUS} fill={surface} stroke={exportPortColor(placed.port.type)} strokeWidth={2} />
				))}
			</g>
		)
	}

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
	static override migrations = blockShapeMigrations

	/**
	 * The capsule's invariants (no inputs, one typed outlet, a box that fits
	 * the text) hold on every write, however the write arrived: a typed
	 * literal, a batch view switch, a pasted record.
	 */
	override onBeforeCreate(next: BlockShape): BlockShape | void {
		// The Pill tool draws through the stock box tool, whose click path makes
		// the default Block and never calls the tool's onCreate (only the drag
		// path does). This seam sees every creation, so a blank Block drawn while
		// the Pill tool is active becomes a capsule here — before the box tool
		// reads its size to centre it on the click.
		const drawnAsPill = this.editor.getCurrentToolId() === PILL_TOOL_ID
			&& isBlankBlockProps(next.props)
		if (drawnAsPill) {
			// A fresh capsule begins on its variable name, just like a new code
			// line. `name: Type = value` is then expanded on edit completion.
			rememberBlockInlineField(this.editor, next.id, {
				kind: 'portName', side: 'outputs', portId: 'out_1',
			})
		}
		const props = drawnAsPill
			? createValueBlockProps(next.props)
			: normalizeValueBlockProps(next.props)
		return props === next.props ? undefined : { ...next, props }
	}

	/** A capsule sizes itself to its text; there is nothing to drag a handle for. */
	override canResize(shape: BlockShape): boolean {
		return shape.props.view !== 'value'
	}

	override getDefaultProps(): BlockShape['props'] {
		return getDefaultBlockProps()
	}

	override onBeforeUpdate(previous: BlockShape, next: BlockShape): BlockShape | void {
		if (next.props.view === 'value') {
			const props = normalizeValueBlockProps(next.props, previous.props)
			return props === next.props ? undefined : { ...next, props }
		}

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
		const field = getBlockInlineField(this.editor, shape.id)
		// Stock's creation lifecycle can begin editing before `onBeforeCreate`
		// records its preferred field. Resolve that race at the lifecycle seam
		// too, but only for an actually blank new capsule — an existing value's
		// title remains its value editor.
		if (
			shape.props.view === 'value'
			&& shape.props.title === ''
			&& shape.props.outputs[0]?.name === ''
			&& field.kind === 'title'
		) {
			rememberBlockInlineField(this.editor, shape.id, {
				kind: 'portName', side: 'outputs', portId: shape.props.outputs[0]?.id ?? 'out_1',
			})
		}
	}

	override onEditEnd(shape: BlockShape): void {
		const field = getBlockInlineField(this.editor, shape.id)
		if (field.kind === 'portName') {
			const port = shape.props[field.side].find((candidate) => candidate.id === field.portId)
			if (port) {
				const props = shape.props.view === 'value'
					? applyCanvasPillSignature(shape.props, port.name)
					: (() => {
						const patch = canvasPortSignaturePatch(port, field.side, port.name)
						return patch ? patchBlockPortProps(shape.props, field.side, port.id, patch) : shape.props
					})()
				if (props !== shape.props) {
					this.editor.updateShape<BlockShape>({ id: shape.id, type: shape.type, props })
				}
			}
		}
		if (field.kind === 'title') {
			commitBlockDefinitionName(this.editor, shape.id)
		}
		clearBlockInlineField(this.editor, shape.id)
	}

	override getGeometry(shape: BlockShape) {
		const layout = layoutBlock(shape.props)
		const isContainer = canBlockContainChildren(shape.props.view)
		return containerHitGeometry({
			body: shape.props.view === 'value'
				? new Stadium2d({
						width: layout.bounds.w,
						height: layout.bounds.h,
						isFilled: true,
					})
				: new Rectangle2d({
						width: layout.bounds.w,
						height: layout.bounds.h,
						isFilled: !isContainer,
					}),
			chrome: isContainer
				? [
						layout.header,
						...layout.ports.map((placed) => portLabelHitArea(placed, layout.width)),
						layout.footer,
					]
				: [],
			dots: layout.ports
				.filter((port) => !port.subtle)
				.map((port) => ({ x: port.x, y: port.y, radius: BLOCK_PORT_RADIUS })),
		})
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
		path.roundRect(0, 0, w, h, shape.props.view === 'value' ? h / 2 : BLOCK_CORNER_RADIUS)
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

	private getContainerTarget(
		shape: BlockShape,
		allowAncestorProxy: boolean,
	): BlockShape | BranchArmShape | undefined {
		if (canBlockContainChildren(shape.props.view)) return shape
		if (!allowAncestorProxy) return undefined
		const ancestors = this.editor.getShapeAncestors(shape)
		// The closest real container wins. Arm frames and Expanded Blocks share
		// the same stock ancestor behavior; the arm frame is intentionally not a
		// second semantic scope.
		for (let index = ancestors.length - 1; index >= 0; index -= 1) {
			const ancestor = ancestors[index]
			if (isBranchArmShape(ancestor)) return ancestor
			if (ancestor.type === 'block' && canBlockContainChildren(ancestor.props.view)) {
				return ancestor
			}
		}
		return undefined
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
		if (!container) return false
		return isBranchArmShape(container)
			? (this.editor.getShapeUtil(container) as BranchArmShapeUtil)
				.canReceiveNewChildrenOfType(container, type)
			: super.canReceiveNewChildrenOfType(container, type)
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
		if (!container || container.isLocked) return
		if (isBranchArmShape(container)) {
			const armUtil = this.editor.getShapeUtil(container) as BranchArmShapeUtil
			armUtil.onDragShapesIn(container, draggingShapes, info)
			return
		}
		if (!canReparentDraggedShapesIntoBlock(container, draggingShapes)) return
		super.onDragShapesIn(container, draggingShapes, info)
	}

	override onDragShapesOut(
		shape: BlockShape,
		draggingShapes: TLShape[],
		info: TLDragShapesOutInfo,
	): void {
		const container = this.getContainerTarget(shape, true)
		if (!container) return
		if (isBranchArmShape(container)) {
			const armUtil = this.editor.getShapeUtil(container) as BranchArmShapeUtil
			armUtil.onDragShapesOut(container, draggingShapes, info)
			return
		}
		super.onDragShapesOut(container, draggingShapes, info)
	}

	override onResize(shape: BlockShape, info: TLResizeInfo<BlockShape>) {
		const resized = super.onResize(shape, info)
		return {
			...resized,
			props: mergeBlockResizeProps(shape.props, resized.props ?? {}),
		}
	}

	override onResizeEnd(_initial: BlockShape, current: BlockShape) {
		const relocation = steppedInResizeRelocation(this.editor, current)
		if (!relocation) return
		return {
			id: current.id,
			type: current.type,
			...relocation,
		}
	}
}

export type { BlockLayout }

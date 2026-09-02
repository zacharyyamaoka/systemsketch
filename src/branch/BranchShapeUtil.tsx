import {
	BaseFrameLikeShapeUtil,
	Circle2d,
	Group2d,
	Rectangle2d,
	createShapePropsMigrationSequence,
	type RecordProps,
	type TLDragShapesInInfo,
	type TLDragShapesOutInfo,
	type TLResizeInfo,
	type TLShape,
} from 'tldraw'

import { BranchCanvas } from './BranchCanvas'
import {
	branchInlineFieldAtPoint,
	branchInlineFieldFromClientPoint,
	clearBranchInlineField,
	ensureBranchInlineField,
	rememberBranchInlineField,
} from './branchInlineEditing'
import {
	BRANCH_CORNER_RADIUS,
	BRANCH_PORT_RADIUS,
	BRANCH_SHAPE_PROPS,
	BRANCH_SHAPE_TYPE,
	branchLayout,
	getDefaultBranchProps,
	reconcileBranchProps,
	type BranchShape,
} from './branchModel'

/** SVG export: the region's chrome without the browser's HTML. */
function BranchExportSvg({ shape }: { shape: BranchShape }) {
	const layout = branchLayout(shape.props)
	const ink = '#27272a'
	const muted = '#a1a1aa'
	const border = '#a9adb8'
	return (
		<g pointerEvents="none">
			<rect x={0.75} y={0.75} width={Math.max(0, layout.w - 1.5)} height={Math.max(0, layout.h - 1.5)} rx={BRANCH_CORNER_RADIUS} fill="none" stroke={border} strokeWidth={1.2} />
			<line x1={0} y1={layout.band.h} x2={layout.w} y2={layout.band.h} stroke={border} />
			<text x={layout.w / 2} y={layout.band.h / 2} textAnchor="middle" dominantBaseline="middle" fill={ink} fontFamily="ui-monospace, monospace" fontSize={18}>
				{shape.props.title}
			</text>
			{layout.controls.map((control) => (
				<g key={control.port.id}>
					<circle cx={control.x} cy={control.y} r={BRANCH_PORT_RADIUS} fill="#fff" stroke="#c08520" strokeWidth={2} />
					<text x={control.label.x} y={control.y} dominantBaseline="middle" fill={muted} fontFamily="ui-sans-serif, system-ui" fontSize={13}>
						{control.port.name}
					</text>
				</g>
			))}
			{layout.arms.map((row) => (
				<g key={row.arm.id}>
					{row.dividerY !== null ? <line x1={0} y1={row.dividerY} x2={layout.w} y2={row.dividerY} stroke={ink} strokeWidth={2} /> : null}
					<text x={row.title.x} y={row.rowCy} dominantBaseline="middle" fill={ink} fontFamily="ui-sans-serif, system-ui" fontSize={16} fontWeight={700}>
						{`${row.arm.open ? '⌄' : '›'} ${row.arm.title}`}
					</text>
				</g>
			))}
		</g>
	)
}

/**
 * The concrete tldraw bridge for the Branch region.
 *
 * A frame-like shape — the same base the Expanded Block derives from — so
 * tldraw's own frame drop, child carrying, clipping and export apply. It adds
 * only: a band that hit-tests like a frame heading, control-port circles that
 * hit-test like a Block's dots, arm header rows that select the region, and
 * the reconciliation that keeps `h` and the arms in step.
 */
export class BranchShapeUtil extends BaseFrameLikeShapeUtil<BranchShape> {
	static override type = BRANCH_SHAPE_TYPE
	static override props: RecordProps<BranchShape> = BRANCH_SHAPE_PROPS
	static override migrations = createShapePropsMigrationSequence({ sequence: [] })

	override getDefaultProps(): BranchShape['props'] {
		return getDefaultBranchProps()
	}

	override onBeforeUpdate(previous: BranchShape, next: BranchShape): BranchShape | void {
		const props = reconcileBranchProps(previous.props, next.props)
		if (props !== next.props) return { ...next, props }
	}

	override canResizeChildren(_shape: BranchShape): boolean {
		return false
	}

	override hideRotateHandle(_shape: BranchShape): boolean {
		return true
	}

	override isAspectRatioLocked(_shape: BranchShape): boolean {
		return false
	}

	override getAriaDescriptor(shape: BranchShape): string {
		return `${shape.props.title || 'Branch'}, ${shape.props.arms.length} arms, ${shape.props.view} view`
	}

	override getText(shape: BranchShape): string {
		return shape.props.title
	}

	override canEdit(_shape: BranchShape): boolean {
		return true
	}

	override onDoubleClick(shape: BranchShape) {
		const screenPoint = this.editor.inputs.getCurrentScreenPoint()
		const container = this.editor.getContainer()
		const bounds = container.getBoundingClientRect()
		const painted = branchInlineFieldFromClientPoint(
			container.ownerDocument,
			{ x: bounds.left + screenPoint.x, y: bounds.top + screenPoint.y },
			shape.id,
		)
		const local = this.editor.getPointInShapeSpace(shape, this.editor.inputs.getCurrentPagePoint())
		rememberBranchInlineField(this.editor, shape.id, painted ?? branchInlineFieldAtPoint(shape.props, local))
	}

	override onEditStart(shape: BranchShape): void {
		ensureBranchInlineField(this.editor, shape.id)
	}

	override onEditEnd(shape: BranchShape): void {
		clearBranchInlineField(this.editor, shape.id)
	}

	override getGeometry(shape: BranchShape) {
		const layout = branchLayout(shape.props)
		const body = new Rectangle2d({ width: layout.w, height: layout.h, isFilled: false })
		const band = new Rectangle2d({ width: layout.band.w, height: layout.band.h, isFilled: true, isLabel: true })
		const headers = layout.arms.map((row) => new Rectangle2d({
			x: row.header.x,
			y: row.header.y,
			width: row.header.w,
			height: row.header.h,
			isFilled: true,
			isLabel: true,
		}))
		const dots = layout.controls.map((control) => new Circle2d({
			x: control.x - BRANCH_PORT_RADIUS,
			y: control.y - BRANCH_PORT_RADIUS,
			radius: BRANCH_PORT_RADIUS,
			isFilled: true,
			isLabel: true,
			excludeFromShapeBounds: true,
		}))
		return new Group2d({ children: [body, band, ...headers, ...dots] })
	}

	override component(shape: BranchShape) {
		return <BranchCanvas shape={shape} />
	}

	override toSvg(shape: BranchShape) {
		return <BranchExportSvg shape={shape} />
	}

	override getIndicatorPath(shape: BranchShape): Path2D {
		const layout = branchLayout(shape.props)
		const path = new Path2D()
		path.roundRect(0, 0, layout.w, layout.h, BRANCH_CORNER_RADIUS)
		for (const control of layout.controls) {
			path.moveTo(control.x + 9, control.y)
			path.arc(control.x, control.y, 9, 0, Math.PI * 2)
		}
		return path
	}

	override isFrameLike(_shape: BranchShape): boolean {
		return true
	}

	/** Cables cross the region freely; they live in the scope outside it. */
	override shouldClipChild(child: TLShape): boolean {
		return child.type !== 'connection' && super.shouldClipChild(child)
	}

	override isExportBoundsContainer(_shape: BranchShape): boolean {
		return true
	}

	override onDragShapesIn(shape: BranchShape, draggingShapes: TLShape[], info: TLDragShapesInInfo): void {
		if (shape.isLocked) return
		// Never adopt a drag that contains the region itself.
		if (draggingShapes.some((dragging) => dragging.id === shape.id)) return
		super.onDragShapesIn(shape, draggingShapes, info)
	}

	override onDragShapesOut(shape: BranchShape, draggingShapes: TLShape[], info: TLDragShapesOutInfo): void {
		super.onDragShapesOut(shape, draggingShapes, info)
	}

	override onResize(shape: BranchShape, info: TLResizeInfo<BranchShape>) {
		const resized = super.onResize(shape, info)
		const props = reconcileBranchProps(shape.props, {
			...shape.props,
			w: Math.max(1, Math.round(resized.props?.w ?? shape.props.w)),
			h: Math.max(1, Math.round(resized.props?.h ?? shape.props.h)),
		})
		return { ...resized, props }
	}
}

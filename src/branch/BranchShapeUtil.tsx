import {
	Rectangle2d,
	createShapePropsMigrationSequence,
	type RecordProps,
	type TLResizeInfo,
	type TLShape,
} from 'tldraw'
import { containerHitGeometry } from '../blocks/containerGeometry'
import { RegionShapeUtil } from '../blocks/RegionShapeUtil'

import { BranchCanvas } from './BranchCanvas'
import { isBranchArmShape } from './BranchArmShapeUtil'
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
export class BranchShapeUtil extends RegionShapeUtil<BranchShape> {
	static override type = BRANCH_SHAPE_TYPE
	static override props: RecordProps<BranchShape> = BRANCH_SHAPE_PROPS
	static override migrations = createShapePropsMigrationSequence({ sequence: [] })

	override getDefaultProps(): BranchShape['props'] {
		return getDefaultBranchProps()
	}

	/** A programmatic create with an off-layout height lands consistent. */
	override onBeforeCreate(next: BranchShape): BranchShape | void {
		// The base box tool's 1×1 placeholder is resized within the same gesture.
		if (next.props.w <= 1 && next.props.h <= 1) return
		const props = reconcileBranchProps(next.props, next.props)
		if (props !== next.props) return { ...next, props }
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
		return containerHitGeometry({
			// The record, not the layout: during a drag-create the base box tool
			// holds a 1x1 placeholder and scales props by new-bounds / initial-bounds,
			// so bounds taller than the record would shrink every arm to its floor.
			body: new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: false }),
			chrome: [layout.band, ...layout.arms.map((row) => row.header)],
			dots: layout.controls
				.map((control) => ({ x: control.x, y: control.y, radius: BRANCH_PORT_RADIUS })),
		})
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
		// Matches the live dot's ring: BRANCH_PORT_RADIUS core plus the 3px
		// surface gap, same halo `.Port`'s box-shadow paints in block-canvas.css.
		const controlIndicatorRadius = BRANCH_PORT_RADIUS + 3
		for (const control of layout.controls) {
			path.moveTo(control.x + controlIndicatorRadius, control.y)
			path.arc(control.x, control.y, controlIndicatorRadius, 0, Math.PI * 2)
		}
		return path
	}

	/** Cables cross the region freely; they live in the scope outside it. */
	override shouldClipChild(child: TLShape): boolean {
		// A framed arm supplies the tighter mask. Applying the Branch's coincident
		// outer rectangle as well is redundant and exposes polygon-intersection
		// degeneracies when the two frames share their left and right edges.
		if (this.editor.getShapeAncestors(child).some(isBranchArmShape)) return false
		return child.type !== 'connection' && super.shouldClipChild(child)
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

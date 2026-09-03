import {
	BaseFrameLikeShapeUtil,
	Circle2d,
	Group2d,
	Rectangle2d,
	createShapePropsMigrationSequence,
	type RecordProps,
	type TLDragShapesInInfo,
	type TLResizeInfo,
	type TLShape,
} from 'tldraw'

import { LoopCanvas } from './LoopCanvas'
import {
	LOOP_CORNER_RADIUS,
	LOOP_PORT_RADIUS,
	LOOP_SHAPE_PROPS,
	LOOP_SHAPE_TYPE,
	getDefaultLoopProps,
	loopLayout,
	reconcileLoopProps,
	type LoopShape,
} from './loopModel'

/** SVG export: the region's chrome without the browser's HTML. */
function LoopExportSvg({ shape }: { shape: LoopShape }) {
	const layout = loopLayout(shape.props)
	const ink = '#27272a'
	const muted = '#a1a1aa'
	const border = '#a9adb8'
	return (
		<g pointerEvents="none">
			<rect x={0.75} y={0.75} width={Math.max(0, layout.w - 1.5)} height={Math.max(0, layout.h - 1.5)} rx={LOOP_CORNER_RADIUS} fill="none" stroke={border} strokeWidth={1.2} />
			<line x1={0} y1={layout.header.h} x2={layout.w} y2={layout.header.h} stroke={border} />
			{layout.footer ? <line x1={0} y1={layout.footer.y} x2={layout.w} y2={layout.footer.y} stroke={border} /> : null}
			<text x={layout.title.x} y={layout.title.y} textAnchor="middle" dominantBaseline="middle" fill={ink} fontFamily="ui-monospace, monospace" fontSize={18}>
				{shape.props.title}
			</text>
			{layout.turn ? (
				<>
					<rect x={layout.turn.x} y={layout.turn.y} width={layout.turn.w} height={layout.turn.h} rx={11} fill="none" stroke="#6b4fbf" />
					<text x={layout.turn.x + layout.turn.w / 2} y={layout.turn.y + layout.turn.h / 2} textAnchor="middle" dominantBaseline="middle" fill="#6b4fbf" fontFamily="ui-monospace, monospace" fontSize={11}>
						{shape.props.turn}
					</text>
				</>
			) : null}
			{[layout.iterable, layout.item].map((placed) => (
				<g key={placed.port.id}>
					<circle cx={placed.x} cy={placed.y} r={LOOP_PORT_RADIUS} fill="#fff" stroke="#c08520" strokeWidth={2} />
					<text x={placed.label.x} y={placed.label.y} dominantBaseline="middle" fill={muted} fontFamily="ui-sans-serif, system-ui" fontSize={12.5}>
						{placed.port.name}
					</text>
				</g>
			))}
		</g>
	)
}

/**
 * The concrete tldraw bridge for the Loop region.
 *
 * A frame-like shape — the same base the Branch and the Expanded Block derive
 * from — so tldraw's own frame drop, child carrying, clipping and export
 * apply. It adds only: a header that hit-tests like a frame heading, two port
 * circles that hit-test like a Block's dots, and a floor under `w`/`h`.
 */
export class LoopShapeUtil extends BaseFrameLikeShapeUtil<LoopShape> {
	static override type = LOOP_SHAPE_TYPE
	static override props: RecordProps<LoopShape> = LOOP_SHAPE_PROPS
	static override migrations = createShapePropsMigrationSequence({ sequence: [] })

	override getDefaultProps(): LoopShape['props'] {
		return getDefaultLoopProps()
	}

	/** A programmatic create with an off-layout size lands on the floor. */
	override onBeforeCreate(next: LoopShape): LoopShape | void {
		// The base box tool's 1×1 placeholder is resized within the same gesture.
		if (next.props.w <= 1 && next.props.h <= 1) return
		const props = reconcileLoopProps(next.props)
		if (props !== next.props) return { ...next, props }
	}

	override canResizeChildren(_shape: LoopShape): boolean {
		return false
	}

	override hideRotateHandle(_shape: LoopShape): boolean {
		return true
	}

	override isAspectRatioLocked(_shape: LoopShape): boolean {
		return false
	}

	override getAriaDescriptor(shape: LoopShape): string {
		return `${shape.props.title || 'Loop'}, iterates ${shape.props.iterable.name}, emits ${shape.props.item.name}`
	}

	override getText(shape: LoopShape): string {
		return shape.props.title
	}

	override getGeometry(shape: LoopShape) {
		const layout = loopLayout(shape.props)
		// The record, not the layout: during a drag-create the base box tool
		// holds a 1×1 placeholder and scales props by new-bounds / initial-bounds.
		const body = new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: false })
		const header = new Rectangle2d({
			width: layout.header.w,
			height: layout.header.h,
			isFilled: true,
			isLabel: true,
			excludeFromShapeBounds: true,
		})
		const dots = [layout.iterable, layout.item].map((placed) => new Circle2d({
			x: placed.x - LOOP_PORT_RADIUS,
			y: placed.y - LOOP_PORT_RADIUS,
			radius: LOOP_PORT_RADIUS,
			isFilled: true,
			isLabel: true,
			excludeFromShapeBounds: true,
		}))
		return new Group2d({ children: [body, header, ...dots] })
	}

	override component(shape: LoopShape) {
		return <LoopCanvas shape={shape} />
	}

	override toSvg(shape: LoopShape) {
		return <LoopExportSvg shape={shape} />
	}

	override getIndicatorPath(shape: LoopShape): Path2D {
		const layout = loopLayout(shape.props)
		const path = new Path2D()
		path.roundRect(0, 0, layout.w, layout.h, LOOP_CORNER_RADIUS)
		for (const placed of [layout.iterable, layout.item]) {
			path.moveTo(placed.x + 9, placed.y)
			path.arc(placed.x, placed.y, 9, 0, Math.PI * 2)
		}
		return path
	}

	override isFrameLike(_shape: LoopShape): boolean {
		return true
	}

	/** Cables cross the region freely; they live in the scope outside it. */
	override shouldClipChild(child: TLShape): boolean {
		return child.type !== 'connection' && super.shouldClipChild(child)
	}

	override isExportBoundsContainer(_shape: LoopShape): boolean {
		return true
	}

	override onDragShapesIn(shape: LoopShape, draggingShapes: TLShape[], info: TLDragShapesInInfo): void {
		if (shape.isLocked) return
		// Never adopt a drag that contains the region itself.
		if (draggingShapes.some((dragging) => dragging.id === shape.id)) return
		super.onDragShapesIn(shape, draggingShapes, info)
	}

	override onResize(shape: LoopShape, info: TLResizeInfo<LoopShape>) {
		const resized = super.onResize(shape, info)
		return {
			...resized,
			props: reconcileLoopProps({
				...shape.props,
				w: Math.max(1, Math.round(resized.props?.w ?? shape.props.w)),
				h: Math.max(1, Math.round(resized.props?.h ?? shape.props.h)),
			}),
		}
	}
}

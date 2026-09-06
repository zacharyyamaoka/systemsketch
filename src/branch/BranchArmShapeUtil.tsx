import {
	BaseFrameLikeShapeUtil,
	Group2d,
	Polyline2d,
	SVGContainer,
	T,
	Vec,
	createShapePropsMigrationSequence,
	isShapeId,
	type RecordProps,
	type TLDragShapesInInfo,
	type TLShape,
} from 'tldraw'

import {
	BRANCH_ARM_META_KEY,
	isBranchShape,
	type BranchArm,
	type BranchShape,
} from './branchModel'

/**
 * One invisible tldraw frame per Branch arm.
 *
 * The Branch record remains the semantic authority. This record exists only
 * because tldraw clipping is ancestor-shaped: giving each arm a real parent
 * lets the stock mask, hit-test and nested-frame behavior do the cropping.
 */
export const BRANCH_ARM_SHAPE_TYPE = 'branch-arm' as const

export const BRANCH_ARM_SHAPE_PROPS = {
	w: T.number,
	h: T.number,
	armId: T.string,
} as const

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[BRANCH_ARM_SHAPE_TYPE]: {
			w: number
			h: number
			armId: string
		}
	}
}

export type BranchArmShape = TLShape<typeof BRANCH_ARM_SHAPE_TYPE>

export function isBranchArmShape(shape: TLShape | null | undefined): shape is BranchArmShape {
	return shape?.type === BRANCH_ARM_SHAPE_TYPE
}

export function branchForArmShape(
	shape: BranchArmShape,
	getShape: (id: BranchArmShape['parentId']) => TLShape | undefined,
): BranchShape | null {
	if (!isShapeId(shape.parentId)) return null
	const parent = getShape(shape.parentId)
	return isBranchShape(parent) ? parent : null
}

export function armForArmShape(branch: BranchShape, shape: BranchArmShape): BranchArm | null {
	return branch.props.arms.find((arm) => arm.id === shape.props.armId) ?? null
}

/** Invisible on the canvas; its descendants are the visible part. */
function EmptyArmFrame({ shape }: { shape: BranchArmShape }) {
	return (
		<SVGContainer>
			<rect
				width={shape.props.w}
				height={shape.props.h}
				fill="none"
				stroke="none"
				pointerEvents="none"
			/>
		</SVGContainer>
	)
}

/**
 * The smallest supported clipping primitive: one ordinary frame rectangle.
 * Its top is the arm header's top and its bottom is the next arm's top, so a
 * child paints above its own header but cannot paint into a sibling arm.
 */
export class BranchArmShapeUtil extends BaseFrameLikeShapeUtil<BranchArmShape> {
	static override type = BRANCH_ARM_SHAPE_TYPE
	static override props: RecordProps<BranchArmShape> = BRANCH_ARM_SHAPE_PROPS
	static override migrations = createShapePropsMigrationSequence({ sequence: [] })

	override getDefaultProps(): BranchArmShape['props'] {
		return { w: 1, h: 1, armId: '' }
	}

	override getGeometry(shape: BranchArmShape) {
		const w = Math.max(1, shape.props.w)
		const h = Math.max(1, shape.props.h)
		// WHY: arm frames must still be real tldraw clipping/drop containers, but
		// their invisible face may not terminate hit testing before a semantic
		// cable owned by the Branch. An open perimeter preserves a full bounds
		// envelope and a selectable edge while letting a click in the arm body
		// reach the cable or the Branch below it.
		return new Group2d({
			children: [new Polyline2d({
				points: [new Vec(0, 0), new Vec(w, 0), new Vec(w, h), new Vec(0, h), new Vec(0, 0)],
			})],
		})
	}

	/** The clipping rectangle is intentionally independent of the open hit perimeter. */
	override getClipPath(shape: BranchArmShape): Vec[] {
		const w = Math.max(1, shape.props.w)
		const h = Math.max(1, shape.props.h)
		return [new Vec(0, 0), new Vec(w, 0), new Vec(w, h), new Vec(0, h)]
	}

	override component(shape: BranchArmShape) {
		return <EmptyArmFrame shape={shape} />
	}

	override toSvg(_shape: BranchArmShape) {
		return <g />
	}

	/** Never expose a hover/selection outline for an implementation detail. */
	override getIndicatorPath(_shape: BranchArmShape): Path2D {
		return new Path2D()
	}

	override canEdit(_shape: BranchArmShape): boolean {
		return false
	}

	override canResize(_shape: BranchArmShape): boolean {
		return false
	}

	override canResizeChildren(_shape: BranchArmShape): boolean {
		return false
	}

	override canBind(): boolean {
		return false
	}

	override canTabTo(_shape: BranchArmShape): boolean {
		return false
	}

	override hideResizeHandles(_shape: BranchArmShape): boolean {
		return true
	}

	override hideRotateHandle(_shape: BranchArmShape): boolean {
		return true
	}

	override hideSelectionBoundsBg(_shape: BranchArmShape): boolean {
		return true
	}

	override hideSelectionBoundsFg(_shape: BranchArmShape): boolean {
		return true
	}

	override isExportBoundsContainer(_shape: BranchArmShape): boolean {
		return true
	}

	override canReceiveNewChildrenOfType(shape: BranchArmShape, type: TLShape['type']): boolean {
		if (type === 'connection') return false
		const branch = branchForArmShape(shape, (id) => this.editor.getShape(id))
		return Boolean(branch && armForArmShape(branch, shape)?.open)
	}

	/** Semantic cables cross arm boundaries and remain in the surrounding scope. */
	override shouldClipChild(child: TLShape): boolean {
		return child.type !== 'connection' && super.shouldClipChild(child)
	}

	override onDragShapesIn(
		shape: BranchArmShape,
		draggingShapes: TLShape[],
		info: TLDragShapesInInfo,
	): void {
		if (!this.canReceiveNewChildrenOfType(shape, draggingShapes[0]?.type ?? 'geo')) return
		super.onDragShapesIn(shape, draggingShapes, info)
		const updates = draggingShapes
			.map((dragging) => this.editor.getShape(dragging.id))
			.filter((dragging): dragging is TLShape => Boolean(dragging && dragging.parentId === shape.id))
			.filter((dragging) => dragging.meta?.[BRANCH_ARM_META_KEY] !== shape.props.armId)
			.map((dragging) => ({
				id: dragging.id,
				type: dragging.type,
				meta: { ...dragging.meta, [BRANCH_ARM_META_KEY]: shape.props.armId },
			}))
		if (updates.length > 0) this.editor.updateShapes(updates as never)
	}
}

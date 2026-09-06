/**
 * The concrete tldraw bridge for the Behavior Tree region.
 *
 * Frame-like, so children ride with it and export bounds are its own; sized
 * by its projection rather than by a person, so there are no resize handles.
 * Clicking its band selects it; clicking its interior selects whichever
 * projected child is there, exactly as a stock Frame behaves.
 */
import {
	Rectangle2d,
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
	type RecordProps,
	type TLShape,
} from 'tldraw'

import { containerHitGeometry } from '../blocks/containerGeometry'
import { RegionShapeUtil } from '../blocks/RegionShapeUtil'
import { BehaviorTreeCanvas } from './BehaviorTreeCanvas'
import {
	BEHAVIOR_TREE_SHAPE_PROPS,
	BEHAVIOR_TREE_SHAPE_TYPE,
	BT_HEADER_H,
	getDefaultBehaviorTreeProps,
	type BehaviorTreeShape,
} from './behaviorTreeModel'
import { projectBehaviorTree, projectedEdges } from './behaviorTreeProjection'
import { arrowHeadPath, edgeColor, edgeEndAngle, edgePathData } from './sceneSvg'

const REGION_RADIUS = 8

const behaviorTreeVersions = createShapePropsMigrationIds(BEHAVIOR_TREE_SHAPE_TYPE, {
	InsertVisibilityNodeOverridesAndTreeStack: 1,
	SpacingScale: 2,
})

export const behaviorTreeShapeMigrations = createShapePropsMigrationSequence({
	sequence: [{
		id: behaviorTreeVersions.InsertVisibilityNodeOverridesAndTreeStack,
		up(props) {
			// Regions saved before hover-reveal landed painted every "+" at rest,
			// which is Process view's old (undesired) behaviour — 'all' keeps a
			// loaded file looking the way it did the moment before this shipped.
			if (props.insertVisibility === undefined) props.insertVisibility = 'all'
			if (props.nodeViewOverrides === undefined) props.nodeViewOverrides = {}
			if (props.treeStack === undefined) props.treeStack = []
		},
		down(props) {
			delete props.insertVisibility
			delete props.nodeViewOverrides
			delete props.treeStack
		},
	}, {
		id: behaviorTreeVersions.SpacingScale,
		up(props) {
			// Regions saved before the Inspector's Spacing slider: 1 is the gap
			// constants exactly as they were, so a loaded file does not move.
			if (props.spacingScale === undefined) props.spacingScale = 1
		},
		down(props) {
			delete props.spacingScale
		},
	}],
})

function BehaviorTreeExportSvg({ shape }: { shape: BehaviorTreeShape }) {
	const projection = projectBehaviorTree(shape.props)
	const { origin } = projection
	const edges = projectedEdges(projection)
	return (
		<g pointerEvents="none">
			<rect x={0.75} y={0.75} width={Math.max(0, shape.props.w - 1.5)} height={Math.max(0, shape.props.h - 1.5)} rx={REGION_RADIUS} fill="none" stroke="#a9adb8" strokeWidth={1.2} />
			<line x1={0} y1={BT_HEADER_H} x2={shape.props.w} y2={BT_HEADER_H} stroke="#a9adb8" />
			<text x={16} y={BT_HEADER_H / 2} dominantBaseline="middle" fill="#27272a" fontFamily="ui-monospace, monospace" fontSize={18}>{shape.props.title}</text>
			{projection.scene.groups.map((group) => (
				<g key={group.path}>
					<rect x={group.rect.x + origin.x} y={group.rect.y + origin.y} width={group.rect.w} height={group.rect.h} rx={6} fill="none" stroke="#c9ccd3" strokeDasharray="6 5" />
					<text x={group.rect.x + origin.x + 44} y={group.rect.y + origin.y + 30} fontFamily="Inter, ui-sans-serif" fontSize={18} fontWeight={600} fill="#27272a">{group.title}</text>
				</g>
			))}
			{edges.map((edge) => (
				<g key={edge.id}>
					<path d={edgePathData(edge)} fill="none" stroke={edgeColor(edge.kind)} strokeWidth={2} />
					{edge.arrowEnd ? <path d={arrowHeadPath(edge.points[edge.points.length - 1], edgeEndAngle(edge))} fill={edgeColor(edge.kind)} /> : null}
				</g>
			))}
			{projection.scene.chips.map((chip) => (
				<g key={chip.id}>
					<rect x={chip.rect.x + origin.x} y={chip.rect.y + origin.y} width={chip.rect.w} height={chip.rect.h} rx={5} fill="#ffffff" stroke="#27272a" strokeWidth={chip.kind === 'fail' ? 3 : 1.4} />
					<text x={chip.rect.x + origin.x + chip.rect.w / 2} y={chip.rect.y + origin.y + chip.rect.h / 2} textAnchor="middle" dominantBaseline="middle" fontFamily="Inter, ui-sans-serif" fontSize={16} fill="#27272a">{chip.text}</text>
				</g>
			))}
			{projection.scene.start ? (
				<g>
					<rect x={projection.scene.start.x + origin.x} y={projection.scene.start.y + origin.y} width={projection.scene.start.w} height={projection.scene.start.h} rx={projection.scene.start.h / 2} fill="#ffffff" stroke="#27272a" strokeWidth={1.6} />
					<text x={projection.scene.start.x + origin.x + projection.scene.start.w / 2} y={projection.scene.start.y + origin.y + projection.scene.start.h / 2} textAnchor="middle" dominantBaseline="middle" fontFamily="Inter, ui-sans-serif" fontSize={18} fontWeight={600} fill="#27272a">Start</text>
				</g>
			) : null}
		</g>
	)
}

export class BehaviorTreeShapeUtil extends RegionShapeUtil<BehaviorTreeShape> {
	static override type = BEHAVIOR_TREE_SHAPE_TYPE
	static override props: RecordProps<BehaviorTreeShape> = BEHAVIOR_TREE_SHAPE_PROPS
	static override migrations = behaviorTreeShapeMigrations

	override getDefaultProps(): BehaviorTreeShape['props'] {
		return getDefaultBehaviorTreeProps()
	}

	override canResize(_shape: BehaviorTreeShape): boolean {
		return false
	}

	override hideResizeHandles(_shape: BehaviorTreeShape): boolean {
		return true
	}

	override hideRotateHandle(_shape: BehaviorTreeShape): boolean {
		return true
	}

	override canResizeChildren(_shape: BehaviorTreeShape): boolean {
		return false
	}

	override canEdit(_shape: BehaviorTreeShape): boolean {
		return false
	}

	override getAriaDescriptor(shape: BehaviorTreeShape): string {
		return `${shape.props.title || 'Behavior Tree'}, ${shape.props.projection} view`
	}

	override getText(shape: BehaviorTreeShape): string {
		return shape.props.title
	}

	override getGeometry(shape: BehaviorTreeShape) {
		return containerHitGeometry({
			body: new Rectangle2d({ width: Math.max(1, shape.props.w), height: Math.max(1, shape.props.h), isFilled: false }),
			chrome: [{ x: 0, y: 0, w: Math.max(1, shape.props.w), h: BT_HEADER_H }],
		})
	}

	override component(shape: BehaviorTreeShape) {
		return <BehaviorTreeCanvas shape={shape} />
	}

	override toSvg(shape: BehaviorTreeShape) {
		return <BehaviorTreeExportSvg shape={shape} />
	}

	override getIndicatorPath(shape: BehaviorTreeShape): Path2D {
		const path = new Path2D()
		path.roundRect(0, 0, shape.props.w, shape.props.h, REGION_RADIUS)
		return path
	}

	/** Never clip: a dragged node or a Blackboard pill may sit past the frame for a moment. */
	override shouldClipChild(_child: TLShape): boolean {
		return false
	}

	/** Foreign shapes are not adopted; the region's children come from its XML. */
	override onDragShapesIn(): void {
		return undefined
	}
}

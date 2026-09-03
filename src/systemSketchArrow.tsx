import {
	ArrowShapeUtil,
	Group2d,
	PathBuilder,
	Polyline2d,
	SVGContainer,
	Vec,
	getArrowInfo,
	getDisplayValues,
	useColorMode,
	type IndexKey,
	type Editor,
	type JsonObject,
	type TLArrowShape,
	type TLHandle,
	type TLHandleDragInfo,
	type TLShapeId,
	type SvgExportContext,
} from 'tldraw'
import {
	captureAuthoredRoute,
	captureResolvedRoute,
	moveAuthoredSegment,
	resolveAuthoredRoute,
	type ConnectionElbowRouteModel,
} from './blocks/connections/elbowAuthoredRoute'

/**
 * A versioned, namespaced enhancement carried by an otherwise stock arrow.
 *
 * tldraw 5.3.2 validates exactly one elbow scalar (`elbowMidPoint`). Replacing
 * its prop schema would also mean owning every upstream arrow migration, so an
 * authored multi-elbow route lives in the record's supported `meta` extension
 * instead. Plain tldraw preserves this object and continues to open the arrow;
 * it simply draws the stock one-control route when SystemSketch is absent.
 */
export const SYSTEMSKETCH_ARROW_ROUTE_META_KEY = 'systemSketchArrowRoute'
const SYSTEMSKETCH_ARROW_ROUTE_VERSION = 1
const MIN_ARROW_SEGMENT_HANDLE_LENGTH = 20

interface StoredArrowRoute {
	version: typeof SYSTEMSKETCH_ARROW_ROUTE_VERSION
	route: ConnectionElbowRouteModel
}

interface ResolvedArrowRoute {
	points: { x: number; y: number }[]
	model: ConnectionElbowRouteModel | null
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value)
}

/** Read authored geometry defensively; malformed / future metadata falls back to stock. */
export function readSystemSketchArrowRoute(
	meta: JsonObject,
): ConnectionElbowRouteModel | null {
	const stored = meta[SYSTEMSKETCH_ARROW_ROUTE_META_KEY]
	if (!isObject(stored) || stored.version !== SYSTEMSKETCH_ARROW_ROUTE_VERSION) return null
	const route = stored.route
	if (!isObject(route) || (route.startAxis !== 'x' && route.startAxis !== 'y')) return null
	if (!Array.isArray(route.corners)) return null
	const corners: Array<Record<'tx' | 'ox' | 'ty' | 'oy', unknown>> = []
	for (const corner of route.corners) {
		if (!isObject(corner)) return null
		corners.push({ tx: corner.tx, ox: corner.ox, ty: corner.ty, oy: corner.oy })
	}
	if (!corners.every((corner) => (
		isFiniteNumber(corner.tx)
		&& isFiniteNumber(corner.ox)
		&& isFiniteNumber(corner.ty)
		&& isFiniteNumber(corner.oy)
	))) return null
	return {
		startAxis: route.startAxis,
		corners: corners as ConnectionElbowRouteModel['corners'],
	}
}

function metaWithArrowRoute(
	meta: JsonObject,
	route: ConnectionElbowRouteModel,
): JsonObject {
	const stored: StoredArrowRoute = {
		version: SYSTEMSKETCH_ARROW_ROUTE_VERSION,
		route,
	}
	return { ...meta, [SYSTEMSKETCH_ARROW_ROUTE_META_KEY]: stored as unknown as JsonObject }
}

function metaWithoutArrowRoute(meta: JsonObject): JsonObject {
	const next = { ...meta }
	delete next[SYSTEMSKETCH_ARROW_ROUTE_META_KEY]
	return next
}

function visibleStockElbowPoints(
	editor: Editor,
	shape: TLArrowShape,
): { x: number; y: number }[] | null {
	const info = getArrowInfo(editor, shape.id)
	if (info?.type !== 'elbow' || !info.isValid) return null
	const points = info.route.points
		.filter((point) => !info.route.skipPointsWhenDrawing.has(point))
		.map((point) => ({ x: point.x, y: point.y }))
		.filter((point, index, all) => (
			index === 0 || !Vec.Equals(point, all[index - 1])
		))
	return points.length >= 2 ? points : null
}

function resolveArrowRoute(editor: Editor, shape: TLArrowShape): ResolvedArrowRoute | null {
	const stockPoints = visibleStockElbowPoints(editor, shape)
	if (!stockPoints) return null
	const model = readSystemSketchArrowRoute(shape.meta)
	if (!model) return { points: stockPoints, model: null }
	const start = stockPoints[0]
	const end = stockPoints[stockPoints.length - 1]
	const route = resolveAuthoredRoute(model, start, end)
	return { points: [start, ...route.points, end], model }
}

function routeHandles(shape: TLArrowShape, points: readonly { x: number; y: number }[]): TLHandle[] {
	const handles: TLHandle[] = []
	for (let index = 0; index < points.length - 1; index += 1) {
		// The stock component continues to own arrowheads. Do not offer the one
		// endpoint-segment drag that would rotate a head away from the stock
		// fallback's tangent; default arrows can grow repeatedly from their open
		// start, while every interior rail remains movable.
		if (index === 0 && shape.props.arrowheadStart !== 'none') continue
		if (index === points.length - 2 && shape.props.arrowheadEnd !== 'none') continue
		const start = points[index]
		const end = points[index + 1]
		if (Vec.Dist(start, end) < MIN_ARROW_SEGMENT_HANDLE_LENGTH) continue
		handles.push({
			id: `systemsketch-route:${index}`,
			type: 'vertex',
			index: `a${index + 2}` as IndexKey,
			x: (start.x + end.x) / 2,
			y: (start.y + end.y) / 2,
		})
	}
	return handles
}

function authoredArrowPath(points: readonly { x: number; y: number }[]): PathBuilder {
	return PathBuilder.lineThroughPoints(points.map((point) => Vec.From(point)))
}

/** Render only the authored body; the stock component still owns heads and text. */
function AuthoredArrowBody({
	util,
	shape,
	points,
}: {
	util: SystemSketchArrowShapeUtil
	shape: TLArrowShape
	points: readonly { x: number; y: number }[]
}) {
	const colorMode = useColorMode()
	const display = getDisplayValues(util, shape, colorMode)
	const strokeWidth = display.strokeWidth * shape.props.scale
	return (
		<SVGContainer
			className="systemsketch-authored-arrow__body"
			style={{ minWidth: 50, minHeight: 50 }}
		>
			<g
				fill="none"
				stroke={display.strokeColor}
				strokeWidth={strokeWidth}
				strokeLinejoin="round"
				strokeLinecap="round"
				pointerEvents="none"
			>
				{authoredArrowPath(points).toSvg({
					style: shape.props.dash,
					strokeWidth,
					forceSolid: false,
					randomSeed: shape.id,
				})}
			</g>
		</SVGContainer>
	)
}

function StockArrow({ util, shape }: { util: SystemSketchArrowShapeUtil; shape: TLArrowShape }) {
	return util.renderStockComponent(shape)
}

function SystemSketchArrow({
	util,
	shape,
	points,
}: {
	util: SystemSketchArrowShapeUtil
	shape: TLArrowShape
	points: readonly { x: number; y: number }[] | null
}) {
	if (!points) return <StockArrow util={util} shape={shape} />
	return (
		<>
			<div className="systemsketch-authored-arrow__stock">
				<StockArrow util={util} shape={shape} />
			</div>
			<AuthoredArrowBody util={util} shape={shape} points={points} />
		</>
	)
}

/**
 * Stock tldraw arrow plus the one degree of freedom its schema omits.
 *
 * The stock tool, bindings, terminal drag, styles, labels, arrowheads and the
 * un-authored renderer remain `ArrowShapeUtil`. SystemSketch replaces only an
 * authored elbow body and its segment handles, using the same pure route model
 * as semantic data edges and tldraw's normal `select.dragging_handle` state.
 */
export class SystemSketchArrowShapeUtil extends ArrowShapeUtil {
	private activeRouteDrag: {
		shapeId: TLShapeId
		handleId: string
		model: ConnectionElbowRouteModel
		segmentIndex: number
	} | null = null

	private route(shape: TLArrowShape): ResolvedArrowRoute | null {
		return resolveArrowRoute(this.editor, shape)
	}

	override onBeforeUpdate(previous: TLArrowShape, next: TLArrowShape): TLArrowShape | void {
		const routingContractChanged = previous.props.kind !== next.props.kind
			|| previous.props.arrowheadStart !== next.props.arrowheadStart
			|| previous.props.arrowheadEnd !== next.props.arrowheadEnd
		if (!routingContractChanged) return
		if (!(SYSTEMSKETCH_ARROW_ROUTE_META_KEY in next.meta)) return
		return { ...next, meta: metaWithoutArrowRoute(next.meta) }
	}

	override getGeometry(shape: TLArrowShape) {
		const route = this.route(shape)
		if (!route?.model) return super.getGeometry(shape)
		const stock = super.getGeometry(shape)
		return new Group2d({
			children: [
				new Polyline2d({ points: route.points.map((point) => Vec.From(point)) }),
				// Preserve the stock label geometry (and any debug geometry) exactly.
				...stock.children.slice(1),
			],
		})
	}

	override getHandles(shape: TLArrowShape): TLHandle[] {
		if (shape.props.kind !== 'elbow') return super.getHandles(shape)
		const route = this.route(shape)
		if (!route) return super.getHandles(shape)
		const terminals = super.getHandles(shape)
			.filter((handle) => handle.id === 'start' || handle.id === 'end')
		return [...terminals, ...routeHandles(shape, route.points)]
	}

	override onHandleDrag(shape: TLArrowShape, info: TLHandleDragInfo<TLArrowShape>) {
		if (!info.handle.id.startsWith('systemsketch-route:')) {
			return super.onHandleDrag(shape, info)
		}

		const route = this.route(shape)
		if (!route) return undefined
		const segmentIndex = Number(info.handle.id.slice('systemsketch-route:'.length))
		if (!Number.isInteger(segmentIndex) || segmentIndex < 0) return undefined
		const start = route.points[0]
		const end = route.points[route.points.length - 1]

		if (
			this.activeRouteDrag?.shapeId !== shape.id
			|| this.activeRouteDrag.handleId !== info.handle.id
		) {
			this.activeRouteDrag = {
				shapeId: shape.id,
				handleId: info.handle.id,
				model: route.model ?? captureResolvedRoute(route.points, start, end),
				segmentIndex,
			}
		}

		const base = this.activeRouteDrag
		const moved = moveAuthoredSegment(
			start,
			end,
			resolveAuthoredRoute(base.model, start, end),
			base.segmentIndex,
			{ x: info.handle.x, y: info.handle.y },
		)
		return {
			id: shape.id,
			type: shape.type,
			// tldraw 5.3.2 intentionally keys geometry / indicator caches on
			// `props`, not `meta`. Give the otherwise stock props a fresh rich-text
			// identity so the supported meta enhancement invalidates those caches;
			// the label value itself is unchanged.
			props: { richText: structuredClone(shape.props.richText) },
			meta: metaWithArrowRoute(shape.meta, captureAuthoredRoute(moved, start, end)),
		}
	}

	override onHandleDragEnd(): void {
		this.activeRouteDrag = null
	}

	override onHandleDragCancel(): void {
		this.activeRouteDrag = null
	}

	override component(shape: TLArrowShape) {
		const route = this.route(shape)
		return (
			<SystemSketchArrow
				util={this}
				shape={shape}
				points={route?.model ? route.points : null}
			/>
		)
	}

	/** Called from a child component so the stock util's hooks keep a stable owner. */
	renderStockComponent(shape: TLArrowShape) {
		return super.component(shape)
	}

	override getIndicatorPath(shape: TLArrowShape) {
		const route = this.route(shape)
		if (!route?.model) return super.getIndicatorPath(shape)
		return authoredArrowPath(route.points).toPath2D({
			style: 'solid',
			strokeWidth: 1,
		})
	}

	/**
	 * Keep tldraw's complete export implementation (heads, labels and fills).
	 * A non-SystemSketch viewer also ignores the namespaced route metadata and
	 * displays the valid stock elbow fallback, so exported SVGs follow that same
	 * compatibility rule instead of producing a headless partial arrow.
	 */
	override toSvg(shape: TLArrowShape, ctx: SvgExportContext) {
		return super.toSvg(shape, ctx)
	}
}

/** Replace only the default `arrow` util through tldraw's public shape seam. */
export const SYSTEMSKETCH_ARROW_SHAPE_UTILS = [SystemSketchArrowShapeUtil]

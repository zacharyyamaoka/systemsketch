import {
	ArrowShapeUtil,
	Group2d,
	Mat,
	PathBuilder,
	Polyline2d,
	SVGContainer,
	Vec,
	getArrowBindings,
	getArrowInfo,
	getDisplayValues,
	useColorMode,
	useEditor,
	useValue,
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
import {
	readSystemSketchPrimitiveStyle,
	systemSketchPrimitiveMeta,
	type AffineTransform,
	type SystemSketchArrowPathSnapshot,
} from './stockPrimitiveVisuals'

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

interface ExactArrowPath {
	d: string
	transform: AffineTransform
	points: { x: number; y: number }[]
	strokeColor: string
	strokeWidth: number
}

function multiplyAffine(left: AffineTransform, right: AffineTransform): AffineTransform {
	return {
		a: left.a * right.a + left.c * right.b,
		b: left.b * right.a + left.d * right.b,
		c: left.a * right.c + left.c * right.d,
		d: left.b * right.c + left.d * right.d,
		e: left.a * right.e + left.c * right.f + left.e,
		f: left.b * right.e + left.d * right.f + left.f,
	}
}

function applyAffine(transform: AffineTransform, point: { x: number; y: number }) {
	return {
		x: transform.a * point.x + transform.c * point.y + transform.e,
		y: transform.b * point.x + transform.d * point.y + transform.f,
	}
}

/** Similarity transform that carries the captured terminal pair to the live one. */
function frameTransform(
	from: SystemSketchArrowPathSnapshot['frame'],
	to: SystemSketchArrowPathSnapshot['frame'],
): AffineTransform {
	const baseX = from.end.x - from.start.x
	const baseY = from.end.y - from.start.y
	const liveX = to.end.x - to.start.x
	const liveY = to.end.y - to.start.y
	const baseLengthSquared = baseX * baseX + baseY * baseY
	if (baseLengthSquared <= 1e-9) {
		return {
			a: 1,
			b: 0,
			c: 0,
			d: 1,
			e: to.start.x - from.start.x,
			f: to.start.y - from.start.y,
		}
	}
	const a = (liveX * baseX + liveY * baseY) / baseLengthSquared
	const b = (liveY * baseX - liveX * baseY) / baseLengthSquared
	return {
		a,
		b,
		c: -b,
		d: a,
		e: to.start.x - a * from.start.x + b * from.start.y,
		f: to.start.y - b * from.start.x - a * from.start.y,
	}
}

function exactArrowPath(editor: Editor, shape: TLArrowShape): ExactArrowPath | null {
	const style = readSystemSketchPrimitiveStyle(shape)
	if (style?.kind !== 'arrow' || !style.path) return null
	const bindings = getArrowBindings(editor, shape)
	const arrowPageTransform = editor.getShapePageTransform(shape)
	const pageToArrow = Mat.Inverse(arrowPageTransform)
	const exactTerminal = (terminal: 'start' | 'end') => {
		const binding = bindings[terminal]
		if (!binding) return shape.props[terminal]
		const target = editor.getShape(binding.toId)
		if (!target) return shape.props[terminal]
		const bounds = editor.getShapeGeometry(target).bounds
		const anchor = binding.props.normalizedAnchor
		const local = {
			x: bounds.x + anchor.x * bounds.width,
			y: bounds.y + anchor.y * bounds.height,
		}
		const page = editor.getShapePageTransform(target).applyToPoint(local)
		return Mat.applyToPoint(pageToArrow, page)
	}
	// tldraw clamps exact normalized anchors a thousandth of the way inside a
	// target before drawing a stock arrow. A cable terminates on the port centre
	// itself, so this fidelity path intentionally resolves the public binding's
	// authored anchor without that stock anti-degeneracy inset.
	const terminals = { start: exactTerminal('start'), end: exactTerminal('end') }
	const carry = frameTransform(style.path.frame, terminals)
	const transform = multiplyAffine(carry, style.path.transform)
	return {
		d: style.path.d,
		transform,
		points: style.path.samples.map((point) => applyAffine(transform, point)),
		strokeColor: style.strokeColor,
		strokeWidth: style.strokeWidth * shape.props.scale,
	}
}

function transformAttribute(transform: AffineTransform): string {
	return `matrix(${transform.a} ${transform.b} ${transform.c} ${transform.d} ${transform.e} ${transform.f})`
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

function ExactArrowBody({ exact }: { exact: ExactArrowPath }) {
	return (
		<SVGContainer
			className="systemsketch-detached-arrow__body"
			style={{ minWidth: 50, minHeight: 50 }}
		>
			<path
				data-systemsketch-detached-edge="exact"
				d={exact.d}
				transform={transformAttribute(exact.transform)}
				fill="none"
				stroke={exact.strokeColor}
				strokeWidth={exact.strokeWidth}
				strokeLinecap="round"
				strokeLinejoin="round"
				vectorEffect="non-scaling-stroke"
				pointerEvents="none"
			/>
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
	const editor = useEditor()
	const exact = useValue(
		`exact detached arrow ${shape.id}`,
		() => exactArrowPath(editor, shape),
		[editor, shape],
	)
	if (exact) return <ExactArrowBody exact={exact} />
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
 * Stock tldraw arrow plus the narrow visual degrees of freedom its schema omits.
 *
 * The stock tool, bindings, terminal drag, styles, labels, arrowheads and the
 * un-authored renderer remain `ArrowShapeUtil`. SystemSketch replaces an
 * authored elbow body and its segment handles, or the initial body of a cable
 * that was just detached. Both are namespaced metadata enhancements on a valid
 * stock arrow record.
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
		let meta = next.meta
		let changed = false
		if (routingContractChanged && SYSTEMSKETCH_ARROW_ROUTE_META_KEY in meta) {
			meta = metaWithoutArrowRoute(meta)
			changed = true
		}

		const style = readSystemSketchPrimitiveStyle(previous)
		const exactGeometryChanged = style?.kind === 'arrow' && style.path
			&& (routingContractChanged
				|| previous.props.bend !== next.props.bend
				|| previous.props.scale !== next.props.scale
				|| previous.props.start.x !== next.props.start.x
				|| previous.props.start.y !== next.props.start.y
				|| previous.props.end.x !== next.props.end.x
				|| previous.props.end.y !== next.props.end.y
				|| previous.props.richText !== next.props.richText)
		if (exactGeometryChanged && style?.kind === 'arrow') {
			meta = systemSketchPrimitiveMeta({
				kind: 'arrow',
				strokeColor: style.strokeColor,
				strokeWidth: style.strokeWidth,
			}, meta)
			changed = true
		}
		return changed ? { ...next, meta } : undefined
	}

	override getGeometry(shape: TLArrowShape) {
		const exact = exactArrowPath(this.editor, shape)
		if (exact && exact.points.length >= 2) {
			const stock = super.getGeometry(shape)
			return new Group2d({
				children: [
					new Polyline2d({ points: exact.points.map((point) => Vec.From(point)) }),
					...stock.children.slice(1),
				],
			})
		}
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
		const exact = exactArrowPath(this.editor, shape)
		if (exact) {
			const path = new Path2D(exact.d)
			const transformed = new Path2D()
			transformed.addPath(path, new DOMMatrix([
				exact.transform.a,
				exact.transform.b,
				exact.transform.c,
				exact.transform.d,
				exact.transform.e,
				exact.transform.f,
			]))
			return transformed
		}
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
		const exact = exactArrowPath(this.editor, shape)
		if (exact) {
			return (
				<path
					d={exact.d}
					transform={transformAttribute(exact.transform)}
					fill="none"
					stroke={exact.strokeColor}
					strokeWidth={exact.strokeWidth}
					strokeLinecap="round"
					strokeLinejoin="round"
					vectorEffect="non-scaling-stroke"
				/>
			)
		}
		return super.toSvg(shape, ctx)
	}
}

/** Replace only the default `arrow` util through tldraw's public shape seam. */
export const SYSTEMSKETCH_ARROW_SHAPE_UTILS = [SystemSketchArrowShapeUtil]

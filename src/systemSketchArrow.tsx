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
	type TLArrowInfo,
	type TLArrowShape,
	type TLHandle,
	type TLHandleDragInfo,
	type TLShapeId,
	type VecLike,
	type SvgExportContext,
} from 'tldraw'
import {
	captureAuthoredRoute,
	captureResolvedRoute,
	moveAuthoredSegment,
	resolveAuthoredRoute,
	type ConnectionElbowRouteModel,
} from './blocks/connections/elbowAuthoredRoute'
import { showConnectorInteriorControls } from './connectorControlVisibility'
import {
	readSystemSketchPrimitiveStyle,
	systemSketchPrimitiveMeta,
	type AffineTransform,
	type SystemSketchArrowPathSnapshot,
} from './stockPrimitiveVisuals'
import {
	delayPillLabel,
	pointAtFraction,
	polylineLength,
	splitDashArrays,
} from './blocks/connections/connectionPresentation'
import { clampPillPosition } from './blocks/connections/connectionModel'
import { getConnectionControlPoints } from './blocks/connections/connectionRouting'
import type { SystemSketchArrowPrimitiveStyle } from './stockPrimitiveVisuals'
import {
	DataCablePath as ConnectionDataCablePath,
	DelayedCablePaths as ConnectionDelayedCablePaths,
	DelayPill as ConnectionDelayPill,
	type DelayPillGeometry,
} from './blocks/connections/ConnectionShapeUtil'

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
export const SYSTEMSKETCH_ARROW_SLANTED_META_KEY = 'systemSketchSlantedArrow'
const SYSTEMSKETCH_ARROW_SLANTED_VERSION = 1
const MIN_ARROW_SEGMENT_HANDLE_LENGTH = 20
const SLANTED_ARROW_ELBOW_HANDLE_ID = 'systemsketch-slanted-elbow'

interface StoredArrowRoute {
	version: typeof SYSTEMSKETCH_ARROW_ROUTE_VERSION
	route: ConnectionElbowRouteModel
}

interface StoredSlantedArrow {
	version: typeof SYSTEMSKETCH_ARROW_SLANTED_VERSION
	/**
	 * Absent means use the established automatic lead. Once the virtual elbow is
	 * dragged, keep its x position as a fraction of the endpoint span so it
	 * keeps following terminal moves just like the other arrow controls.
	 */
	elbowT?: number
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

type DetachedArrowPresentation = NonNullable<SystemSketchArrowPrimitiveStyle['presentation']>

interface DetachedArrowVisual {
	exact: boolean
	d: string
	transform?: AffineTransform
	points: { x: number; y: number }[]
	length: number
	strokeColor: string
	strokeWidth: number
}

const EXACT_ARROW_TERMINAL_EPSILON = 0.01

function terminalFrameChanged(
	captured: SystemSketchArrowPathSnapshot['frame'],
	current: SystemSketchArrowPathSnapshot['frame'],
): boolean {
	return Vec.Dist(captured.start, current.start) > EXACT_ARROW_TERMINAL_EPSILON
		|| Vec.Dist(captured.end, current.end) > EXACT_ARROW_TERMINAL_EPSILON
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
	// The exact snapshot bridges the instant of detachment; it is not a second
	// arrow router. Once either bound target changes the arrow's local terminal
	// frame, hand the body and geometry back to tldraw's stock arrow so curves
	// and elbows reflow through their normal resize behaviour. Translating both
	// targets together leaves this local frame unchanged and keeps the snapshot.
	if (terminalFrameChanged(style.path.frame, terminals)) return null
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

/**
 * The body path from stock arrow geometry, expressed through the public
 * `getArrowInfo` result and public `PathBuilder`. tldraw still owns binding,
 * routing and endpoint reflow; detached presentation only paints that result.
 */
function stockArrowBodyPath(info: TLArrowInfo): PathBuilder {
	if (info.type === 'straight') {
		return new PathBuilder()
			.moveTo(info.start.point.x, info.start.point.y, { offset: 0, roundness: 0 })
			.lineTo(info.end.point.x, info.end.point.y, { offset: 0, roundness: 0 })
	}
	if (info.type === 'arc') {
		return new PathBuilder()
			.moveTo(info.start.point.x, info.start.point.y, { offset: 0, roundness: 0 })
			.circularArcTo(
				info.bodyArc.radius,
				Boolean(info.bodyArc.largeArcFlag),
				Boolean(info.bodyArc.sweepFlag),
				info.end.point.x,
				info.end.point.y,
				{ offset: 0, roundness: 0 },
			)
	}
	const path = new PathBuilder().moveTo(info.start.point.x, info.start.point.y, { offset: 0 })
	for (let index = 1; index < info.route.points.length; index += 1) {
		const point = info.route.points[index]
		if (info.route.skipPointsWhenDrawing.has(point)) continue
		path.lineTo(point.x, point.y, {
			offset: index === info.route.points.length - 1 ? 0 : undefined,
		})
	}
	return path
}

function stockArrowPoints(info: TLArrowInfo): { x: number; y: number }[] {
	if (info.type === 'straight') return [
		{ x: info.start.point.x, y: info.start.point.y },
		{ x: info.end.point.x, y: info.end.point.y },
	]
	if (info.type === 'elbow') {
		return info.route.points
			.filter((point) => !info.route.skipPointsWhenDrawing.has(point))
			.map((point) => ({ x: point.x, y: point.y }))
	}
	const arc = info.bodyArc
	const startAngle = Math.atan2(
		info.start.point.y - arc.center.y,
		info.start.point.x - arc.center.x,
	)
	const span = arc.radius > 0 ? Math.abs(arc.length / arc.radius) : 0
	const direction = arc.sweepFlag ? 1 : -1
	const steps = Math.max(16, Math.ceil(span * 24))
	return Array.from({ length: steps + 1 }, (_, index) => {
		const angle = startAngle + direction * span * (index / steps)
		return {
			x: arc.center.x + Math.cos(angle) * arc.radius,
			y: arc.center.y + Math.sin(angle) * arc.radius,
		}
	})
}

function detachedArrowVisual(
	editor: Editor,
	shape: TLArrowShape,
	exact: ExactArrowPath | null,
	authoredPoints: readonly { x: number; y: number }[] | null,
): DetachedArrowVisual | null {
	const style = readSystemSketchPrimitiveStyle(shape)
	if (style?.kind !== 'arrow') return null
	if (exact) return {
		exact: true,
		d: exact.d,
		transform: exact.transform,
		points: exact.points,
		length: polylineLength(exact.points),
		strokeColor: exact.strokeColor,
		strokeWidth: exact.strokeWidth,
	}
	if (authoredPoints) {
		const points = authoredPoints.map((point) => ({ x: point.x, y: point.y }))
		return {
			exact: false,
			d: authoredArrowPath(points).toD(),
			points,
			length: polylineLength(points),
			strokeColor: style.strokeColor,
			strokeWidth: style.strokeWidth * shape.props.scale,
		}
	}
	const info = getArrowInfo(editor, shape)
	if (!info?.isValid) return null
	const points = stockArrowPoints(info)
	return {
		exact: false,
		d: stockArrowBodyPath(info).toD(),
		points,
		length: polylineLength(points),
		strokeColor: style.strokeColor,
		strokeWidth: style.strokeWidth * shape.props.scale,
	}
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
	// tldraw merges `meta` patches rather than treating this nested object as a
	// replacement. A JSON null is therefore the supported tombstone for an
	// enhancement that must really stop affecting the live arrow.
	next[SYSTEMSKETCH_ARROW_ROUTE_META_KEY] = null
	return next
}

/** A deliberately small record extension: plain tldraw still sees a valid straight arrow. */
export function isSlantedArrow(shape: TLArrowShape): boolean {
	const stored = shape.meta[SYSTEMSKETCH_ARROW_SLANTED_META_KEY]
	return isObject(stored) && stored.version === SYSTEMSKETCH_ARROW_SLANTED_VERSION
}

function slantedArrowElbowT(meta: JsonObject): number | null {
	const stored = meta[SYSTEMSKETCH_ARROW_SLANTED_META_KEY]
	if (!isObject(stored) || stored.version !== SYSTEMSKETCH_ARROW_SLANTED_VERSION) return null
	return isFiniteNumber(stored.elbowT) ? Math.max(0, Math.min(1, stored.elbowT)) : null
}

function metaWithSlantedArrow(meta: JsonObject, elbowT: number | null = slantedArrowElbowT(meta)): JsonObject {
	const stored: StoredSlantedArrow = {
		version: SYSTEMSKETCH_ARROW_SLANTED_VERSION,
		...(elbowT === null ? {} : { elbowT: Math.max(0, Math.min(1, elbowT)) }),
	}
	return {
		...metaWithoutArrowRoute(meta),
		[SYSTEMSKETCH_ARROW_SLANTED_META_KEY]: stored as unknown as JsonObject,
	}
}

function metaWithoutSlantedArrow(meta: JsonObject): JsonObject {
	const next = { ...meta }
	// See `metaWithoutArrowRoute`: omit would retain an old nested key after an
	// `updateShapes` merge, leaving the rendered route unexpectedly Slanted.
	next[SYSTEMSKETCH_ARROW_SLANTED_META_KEY] = null
	return next
}

export type ArrowInspectorRouting = 'straight' | 'slanted' | 'mixed'

/** The inspector is an arrow-only surface; mixed shape selections keep their ordinary facts panel. */
export function getArrowInspectorRouting(editor: Editor): ArrowInspectorRouting | null {
	const selected = editor.getSelectedShapes()
	if (selected.length === 0 || selected.some((shape) => shape.type !== 'arrow')) return null
	const arrows = selected as TLArrowShape[]
	const first = isSlantedArrow(arrows[0])
	return arrows.every((arrow) => isSlantedArrow(arrow) === first)
		? first ? 'slanted' : 'straight'
		: 'mixed'
}

/**
 * The endpoint-gapped polyline used by established graph routers, not a new
 * obstacle solver. `getConnectionControlPoints` is already our shared
 * readable-output lead; its first point gives this arrow the horizontal run.
 *
 * WHY: ELK's POLYLINE option is the right prior art for the horizontal-then-
 * sloped reading, but ELK's layout phase owns node positions. A loose tldraw
 * arrow must follow the endpoints its author placed, so it reuses the existing
 * lead distance and lets SVG orient the endpoint marker along the last segment.
 */
export function getSlantedArrowPoints(
	start: VecLike,
	end: VecLike,
	elbowT: number | null = null,
): Vec[] {
	const dx = end.x - start.x
	const dy = end.y - start.y
	if (Math.abs(dx) < 0.001 || Math.abs(dy) < 0.001) {
		return [Vec.From(start), Vec.From(end)]
	}
	if (elbowT !== null) {
		return [
			Vec.From(start),
			new Vec(start.x + dx * Math.max(0, Math.min(1, elbowT)), start.y),
			Vec.From(end),
		]
	}
	const [firstControl] = getConnectionControlPoints(start, end)
	const lead = Math.min(Math.abs(firstControl.x - start.x), Math.abs(dx) / 2)
	const x = start.x + Math.sign(dx) * lead
	return [Vec.From(start), new Vec(x, start.y), Vec.From(end)]
}

function slantedArrowPoints(editor: Editor, shape: TLArrowShape): Vec[] | null {
	const info = getArrowInfo(editor, shape)
	if (!info?.isValid) return null
	return getSlantedArrowPoints(info.start.point, info.end.point, slantedArrowElbowT(shape.meta))
}

/** Apply the uncommon route from the dock without making it a tool or A-key preset. */
export function setArrowInspectorRouting(editor: Editor, routing: Exclude<ArrowInspectorRouting, 'mixed'>): void {
	const arrows = editor.getSelectedShapes()
		.filter((shape): shape is TLArrowShape => shape.type === 'arrow')
	if (arrows.length === 0) return
	editor.markHistoryStoppingPoint(`use ${routing} arrow routing`)
	editor.updateShapes(arrows.map((arrow) => ({
		id: arrow.id,
		type: 'arrow' as const,
		props: routing === 'slanted'
			? {
				// A simple stock fallback preserves the record in a plain tldraw viewer.
				kind: 'arc' as const,
				bend: 0,
				arrowheadStart: 'none' as const,
				arrowheadEnd: 'arrow' as const,
			}
			: { kind: 'arc' as const, bend: 0 },
		meta: routing === 'slanted'
			? metaWithSlantedArrow(arrow.meta)
			: metaWithoutSlantedArrow(arrow.meta),
	})))
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

/**
 * The marker is browser-owned geometry: `orient="auto"` follows the final
 * sloped segment without duplicating tldraw's arrowhead-angle calculation.
 * Slanted arrows standardise on the ordinary open head when selected in the
 * inspector; choosing another endpoint style returns the arrow to stock routing.
 */
function SlantedArrowBody({
	util,
	shape,
	points,
}: {
	util: SystemSketchArrowShapeUtil
	shape: TLArrowShape
	points: readonly Vec[]
}) {
	const colorMode = useColorMode()
	const display = getDisplayValues(util, shape, colorMode)
	const strokeWidth = display.strokeWidth * shape.props.scale
	const markerId = `systemsketch-slanted-arrowhead-${shape.id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
	const penultimate = points[points.length - 2]
	const tip = points[points.length - 1]
	return (
		<SVGContainer
			className="systemsketch-slanted-arrow__body"
			style={{ minWidth: 50, minHeight: 50 }}
		>
			<defs>
				<marker
					id={markerId}
					viewBox="0 0 6 6"
					refX="6"
					refY="3"
					markerWidth="3"
					markerHeight="3"
					markerUnits="strokeWidth"
					orient="auto"
				>
					<path
						d="M 0 0 L 6 3 L 0 6"
						fill="none"
						stroke={display.strokeColor}
						strokeWidth="1"
						strokeLinejoin="round"
						strokeLinecap="round"
					/>
				</marker>
			</defs>
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
				{/* A transparent carrier retains the real stroke width for markerUnits.
					`stroke="none"` makes browsers resolve the marker against a zero-width
					line at large scales, which is how its open head could collapse into a
					heavy blob. */}
				<path
					d={`M ${penultimate.x} ${penultimate.y} L ${tip.x} ${tip.y}`}
					stroke={display.strokeColor}
					strokeOpacity="0"
					markerEnd={`url(#${markerId})`}
				/>
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

function DetachedDelayPill({
	visual,
	presentation,
}: {
	visual: DetachedArrowVisual
	presentation: DetachedArrowPresentation
}) {
	const label = delayPillLabel(presentation.delayValue)
	const point = pointAtFraction(visual.points, clampPillPosition(presentation.pillPosition))
	const pill: DelayPillGeometry = {
		x: point.x,
		y: point.y,
		length: visual.length,
		dash: splitDashArrays(visual.length, presentation.pillPosition),
	}
	return <ConnectionDelayPill
		pill={pill}
		label={label}
		stroke={visual.strokeColor}
		fill="var(--ss-surface, #ffffff)"
		ink="var(--ss-text, #1d2230)"
	/>
}

function DetachedArrowPaint({
	visual,
	presentation,
}: {
	visual: DetachedArrowVisual
	presentation: DetachedArrowPresentation
}) {
	const transform = visual.transform ? transformAttribute(visual.transform) : undefined
	if (presentation.temporal === 'async') {
		return (
			<g transform={transform} data-detached-edge-type="async">
				<ConnectionDataCablePath
					path={visual.d}
					length={visual.length}
					temporal="async"
					stroke={visual.strokeColor}
					strokeWidth={visual.strokeWidth}
					vectorEffect="non-scaling-stroke"
				/>
			</g>
		)
	}
	const point = pointAtFraction(visual.points, clampPillPosition(presentation.pillPosition))
	const pill: DelayPillGeometry = {
		x: point.x,
		y: point.y,
		length: visual.length,
		dash: splitDashArrays(visual.length, presentation.pillPosition),
	}
	return (
		<>
			<g transform={transform} data-detached-delay-segment="presentation">
				<ConnectionDelayedCablePaths
					path={visual.d}
					pill={pill}
					solidBeforePill={presentation.solidBeforePill ?? presentation.dashAfterPill ?? false}
					stroke={visual.strokeColor}
					strokeWidth={visual.strokeWidth}
					vectorEffect="non-scaling-stroke"
				/>
			</g>
			<DetachedDelayPill visual={visual} presentation={presentation} />
		</>
	)
}

function DetachedArrowPresentationBody({
	visual,
	presentation,
}: {
	visual: DetachedArrowVisual
	presentation: DetachedArrowPresentation
}) {
	return (
		<SVGContainer
			className="systemsketch-detached-arrow-presentation__body"
			style={{ minWidth: 50, minHeight: 50 }}
			data-temporal={presentation.temporal}
			data-systemsketch-detached-edge={visual.exact ? 'exact' : undefined}
		>
			<DetachedArrowPaint visual={visual} presentation={presentation} />
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
	slanted,
}: {
	util: SystemSketchArrowShapeUtil
	shape: TLArrowShape
	points: readonly { x: number; y: number }[] | null
	slanted: boolean
}) {
	const editor = useEditor()
	const slantedPoints = useValue(
		`slanted arrow route ${shape.id}`,
		() => slanted ? slantedArrowPoints(editor, shape) : null,
		[editor, shape, slanted],
	)
	const exact = useValue(
		`exact detached arrow ${shape.id}`,
		() => exactArrowPath(editor, shape),
		[editor, shape],
	)
	const style = readSystemSketchPrimitiveStyle(shape)
	const presentation = style?.kind === 'arrow' ? style.presentation : undefined
	const visual = useValue(
		`detached arrow presentation ${shape.id}`,
		() => detachedArrowVisual(editor, shape, exact, points),
		[editor, shape, exact, points],
	)
	if (presentation && presentation.temporal !== 'data' && visual) {
		return (
			<>
				<div className="systemsketch-authored-arrow__stock">
					<StockArrow util={util} shape={shape} />
				</div>
				<DetachedArrowPresentationBody visual={visual} presentation={presentation} />
			</>
		)
	}
	if (exact) return <ExactArrowBody exact={exact} />
	if (slanted && slantedPoints && slantedPoints.length >= 2) {
		return (
			<>
				{/* The stock head follows its single straight fallback, not this
					arrow's final diagonal. Slanted therefore replaces the complete
					stock stroke and head with its own browser-oriented marker. */}
				<div className="systemsketch-authored-arrow__stock systemsketch-authored-arrow__stock--replace-head">
					<StockArrow util={util} shape={shape} />
				</div>
				<SlantedArrowBody util={util} shape={shape} points={slantedPoints} />
			</>
		)
	}
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
 * authored elbow body and its segment handles, the initial body of a cable
 * that was just detached, or an Inspector-selected horizontal-then-diagonal
 * body. These are namespaced metadata enhancements on a valid stock arrow
 * record; Slanted deliberately uses SVG's public marker orientation and falls
 * back to stock if someone chooses a different endpoint style.
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

	private slantedRoute(shape: TLArrowShape): Vec[] | null {
		return isSlantedArrow(shape) ? slantedArrowPoints(this.editor, shape) : null
	}

	override onBeforeUpdate(previous: TLArrowShape, next: TLArrowShape): TLArrowShape | void {
		const routingContractChanged = previous.props.kind !== next.props.kind
			|| previous.props.bend !== next.props.bend
			|| previous.props.arrowheadStart !== next.props.arrowheadStart
			|| previous.props.arrowheadEnd !== next.props.arrowheadEnd
		let meta = next.meta
		let changed = false
		if (routingContractChanged && SYSTEMSKETCH_ARROW_ROUTE_META_KEY in meta) {
			meta = metaWithoutArrowRoute(meta)
			changed = true
		}
		if (isSlantedArrow(previous) && routingContractChanged) {
			meta = metaWithoutSlantedArrow(meta)
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
				presentation: style.presentation,
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
		const slanted = this.slantedRoute(shape)
		if (slanted && slanted.length >= 2) {
			const stock = super.getGeometry(shape)
			return new Group2d({
				children: [
					new Polyline2d({ points: slanted }),
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
		const stockHandles = super.getHandles(shape)
		const terminals = stockHandles
			.filter((handle) => handle.id === 'start' || handle.id === 'end')
		if (!showConnectorInteriorControls(this.editor, shape.id)) return terminals
		if (isSlantedArrow(shape)) {
			const route = this.slantedRoute(shape)
			if (!route || route.length < 3) return terminals
			return [...terminals, {
				id: SLANTED_ARROW_ELBOW_HANDLE_ID,
				// Match stock straight/curved arrows: a default virtual point does
				// not alter the route until someone grabs it, then it becomes an
				// authored vertex that survives terminal movement.
				type: slantedArrowElbowT(shape.meta) === null ? 'virtual' : 'vertex',
				index: 'a2' as IndexKey,
				x: route[1].x,
				y: route[1].y,
			}]
		}
		if (shape.props.kind !== 'elbow') return stockHandles
		const route = this.route(shape)
		if (!route) return stockHandles
		return [...terminals, ...routeHandles(shape, route.points)]
	}

	override onHandleDrag(shape: TLArrowShape, info: TLHandleDragInfo<TLArrowShape>) {
		if (info.handle.id === SLANTED_ARROW_ELBOW_HANDLE_ID) {
			const arrowInfo = getArrowInfo(this.editor, shape)
			if (!arrowInfo?.isValid) return undefined
			const start = arrowInfo.start.point
			const end = arrowInfo.end.point
			const dx = end.x - start.x
			const dy = end.y - start.y
			if (Math.abs(dx) < 0.001 || Math.abs(dy) < 0.001) return undefined
			const elbowT = Math.max(0, Math.min(1, (info.handle.x - start.x) / dx))
			return {
				id: shape.id,
				type: shape.type,
				// See the matching authored-route update below: tldraw's geometry
				// cache is prop-keyed, while this optional control lives in `meta`.
				props: { richText: structuredClone(shape.props.richText) },
				meta: metaWithSlantedArrow(shape.meta, elbowT),
			}
		}
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
				slanted={isSlantedArrow(shape)}
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
		const slanted = this.slantedRoute(shape)
		if (slanted && slanted.length >= 2) {
			return authoredArrowPath(slanted).toPath2D({
				style: 'solid',
				strokeWidth: 1,
			})
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
		const style = readSystemSketchPrimitiveStyle(shape)
		const presentation = style?.kind === 'arrow' ? style.presentation : undefined
		if (presentation && presentation.temporal !== 'data') {
			const route = this.route(shape)
			const visual = detachedArrowVisual(
				this.editor,
				shape,
				exact,
				route?.model ? route.points : null,
			)
			if (visual) return (
				<g data-temporal={presentation.temporal}>
					<DetachedArrowPaint visual={visual} presentation={presentation} />
				</g>
			)
		}
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

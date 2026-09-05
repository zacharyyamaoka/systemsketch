/**
 * A dependency-free SVG painter for a `BtScene`.
 *
 * Two customers: the region's own export (`toSvg`), and the layout tests,
 * which write these files so a layout change can be looked at before it is
 * wired into tldraw. Cards are drawn as plain boxes here — the live canvas
 * paints real Blocks — so what this shows is the *grammar*: rails, groups,
 * chips, wires and spacing.
 */
import { btControlLabel, btLeafBlockType, type BtPoint, type BtScene, type BtSceneEdge } from './behaviorTreeModel'

export const SCENE_COLORS = {
	ink: '#27272a',
	muted: '#71717a',
	border: '#c9ccd3',
	surface: '#ffffff',
	groupFill: '#fafafa',
	groupHeader: '#eceef2',
	wire: '#3f3f46',
	write: '#2f6fe4',
	read: '#22a35a',
	use: '#9ca3af',
	chip: '#ffffff',
	fail: '#f4f4f5',
	accent: '#5b4bdb',
}

export function edgePathData(edge: BtSceneEdge): string {
	const points = edge.points
	if (points.length === 0) return ''
	if (edge.curve && points.length === 2) {
		const [from, to] = points
		const bend = Math.abs(to.y - from.y) >= Math.abs(to.x - from.x)
			? { x: 0, y: (to.y - from.y) * 0.5 }
			: { x: (to.x - from.x) * 0.5, y: 0 }
		return `M ${from.x} ${from.y} C ${from.x + bend.x} ${from.y + bend.y}, ${to.x - bend.x} ${to.y - bend.y}, ${to.x} ${to.y}`
	}
	return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
}

/** The direction a wire arrives at its last point, for the arrowhead. */
export function edgeEndAngle(edge: BtSceneEdge): number {
	const points = edge.points
	if (points.length < 2) return 0
	const to = points[points.length - 1]
	let from = points[points.length - 2]
	if (edge.curve && points.length === 2) {
		const bend = Math.abs(to.y - from.y) >= Math.abs(to.x - from.x)
		from = bend ? { x: to.x, y: from.y } : { x: from.x, y: to.y }
	}
	return Math.atan2(to.y - from.y, to.x - from.x)
}

export function arrowHeadPath(tip: BtPoint, angle: number, size = 9): string {
	const left = { x: tip.x - size * Math.cos(angle - Math.PI / 7), y: tip.y - size * Math.sin(angle - Math.PI / 7) }
	const right = { x: tip.x - size * Math.cos(angle + Math.PI / 7), y: tip.y - size * Math.sin(angle + Math.PI / 7) }
	return `M ${tip.x} ${tip.y} L ${left.x} ${left.y} L ${right.x} ${right.y} Z`
}

export function edgeColor(kind: BtSceneEdge['kind']): string {
	switch (kind) {
		case 'write': return SCENE_COLORS.write
		case 'read': return SCENE_COLORS.read
		case 'use': return SCENE_COLORS.use
		default: return SCENE_COLORS.wire
	}
}

function esc(text: string): string {
	return text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char] ?? char)
}

export interface SceneSvgOptions {
	padding?: number
	/** Draw hover-only insertion targets too. */
	showAllInserts?: boolean
	controlWireOpacity?: number
}

export function sceneToSvg(scene: BtScene, options: SceneSvgOptions = {}): string {
	const pad = options.padding ?? 40
	const width = scene.bounds.w + pad * 2
	const height = scene.bounds.h + pad * 2
	const parts: string[] = []
	parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${-pad} ${-pad} ${width} ${height}" font-family="Inter, ui-sans-serif, system-ui" font-size="18">`)
	parts.push(`<rect x="${-pad}" y="${-pad}" width="${width}" height="${height}" fill="#f7f7f8"/>`)
	for (const group of scene.groups) {
		const { x, y, w, h } = group.rect
		parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${SCENE_COLORS.groupFill}" stroke="${SCENE_COLORS.border}" stroke-dasharray="6 5"/>`)
		parts.push(`<rect x="${x}" y="${y}" width="${w}" height="48" rx="6" fill="${SCENE_COLORS.groupHeader}"/>`)
		parts.push(`<text x="${x + 44}" y="${y + 30}" font-weight="600" fill="${SCENE_COLORS.ink}">${esc(group.title)}</text>`)
		parts.push(`<rect x="${x + 14}" y="${y + 15}" width="18" height="18" fill="none" stroke="${SCENE_COLORS.ink}" stroke-width="1.6"/>`)
	}
	const wireOpacity = options.controlWireOpacity ?? 1
	for (const edge of scene.edges) {
		const color = edgeColor(edge.kind)
		const opacity = edge.kind === 'control' || edge.kind === 'recovery' || edge.kind === 'merge' ? wireOpacity : 1
		parts.push(`<path d="${edgePathData(edge)}" fill="none" stroke="${color}" stroke-width="2" opacity="${opacity}"/>`)
		if (edge.arrowEnd) {
			parts.push(`<path d="${arrowHeadPath(edge.points[edge.points.length - 1], edgeEndAngle(edge))}" fill="${color}" opacity="${opacity}"/>`)
		}
	}
	for (const rail of scene.rails) {
		const horizontal = Math.abs(rail.from.y - rail.to.y) < 0.5
		const offset = horizontal ? { x: 0, y: 3 } : { x: 3, y: 0 }
		for (const sign of [-1, 1]) {
			parts.push(`<line x1="${rail.from.x + offset.x * sign}" y1="${rail.from.y + offset.y * sign}" x2="${rail.to.x + offset.x * sign}" y2="${rail.to.y + offset.y * sign}" stroke="${SCENE_COLORS.wire}" stroke-width="2" opacity="${wireOpacity}"/>`)
		}
	}
	if (scene.start) {
		const { x, y, w, h } = scene.start
		parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="${SCENE_COLORS.surface}" stroke="${SCENE_COLORS.ink}" stroke-width="1.6"/>`)
		parts.push(`<text x="${x + w / 2}" y="${y + h / 2 + 6}" text-anchor="middle" font-weight="600">Start</text>`)
	}
	for (const entry of scene.nodes) {
		const { x, y, w, h } = entry.rect
		if (entry.role === 'control') {
			parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${SCENE_COLORS.surface}" stroke="${SCENE_COLORS.ink}" stroke-width="1.6"/>`)
			parts.push(`<text x="${x + w / 2}" y="${y + h / 2 + 6}" text-anchor="middle" font-weight="600">${esc(btControlLabel(entry.node))}</text>`)
			continue
		}
		parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="9" fill="${SCENE_COLORS.surface}" stroke="${SCENE_COLORS.border}"/>`)
		parts.push(`<text x="${x + w / 2}" y="${y + 44}" text-anchor="middle" font-weight="600" font-size="28" font-family="ui-monospace, monospace">${esc(entry.node.label)}</text>`)
		parts.push(`<text x="${x + w / 2}" y="${y + 74}" text-anchor="middle" fill="${SCENE_COLORS.muted}" font-size="15">${esc(btLeafBlockType(entry.node))}</text>`)
	}
	for (const chip of scene.chips) {
		const { x, y, w, h } = chip.rect
		const bold = chip.kind === 'fail'
		parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${chip.kind === 'fail' ? 3 : 5}" fill="${bold ? SCENE_COLORS.fail : SCENE_COLORS.chip}" stroke="${SCENE_COLORS.ink}" stroke-width="${bold ? 3 : 1.4}"/>`)
		parts.push(`<text x="${x + w / 2}" y="${y + h / 2 + 6}" text-anchor="middle" font-size="16" font-weight="${bold ? 700 : 500}">${esc(chip.text)}</text>`)
	}
	for (const key of scene.keys) {
		const { x, y, w, h } = key.rect
		parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${h / 2}" fill="#eef0f3" stroke="#9ca3af" stroke-width="1.5"/>`)
		parts.push(`<text x="${x + w / 2}" y="${y + h / 2 + 7}" text-anchor="middle" font-size="22" font-family="ui-monospace, monospace">${esc(key.label)}</text>`)
		parts.push(`<circle cx="${x}" cy="${y + h / 2}" r="6" fill="#fff" stroke="#c08520" stroke-width="2"/>`)
		parts.push(`<circle cx="${x + w}" cy="${y + h / 2}" r="6" fill="#fff" stroke="#c08520" stroke-width="2"/>`)
	}
	for (const insert of scene.inserts) {
		if (!insert.persistent && !options.showAllInserts) continue
		const { x, y } = insert.at
		parts.push(`<rect x="${x - 13}" y="${y - 13}" width="26" height="26" rx="4" fill="${SCENE_COLORS.accent}"/>`)
		parts.push(`<path d="M ${x - 6} ${y} H ${x + 6} M ${x} ${y - 6} V ${y + 6}" stroke="#fff" stroke-width="2.2"/>`)
	}
	parts.push('</svg>')
	return parts.join('\n')
}

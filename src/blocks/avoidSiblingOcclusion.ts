import type { Editor, TLShape } from 'tldraw'

import { getActiveDepthScopeId } from '../depth/depthNavigation'
import type { BlockShape } from './blockModel'

export const STEPPED_IN_NODE_CLEARANCE = 32

export interface PageRect {
	minX: number
	minY: number
	maxX: number
	maxY: number
}

export interface PagePoint {
	x: number
	y: number
}

const PASS_THROUGH_SHAPES = new Set(['arrow', 'connection', 'draw', 'highlight', 'line'])

function overlaps(a: PageRect, b: PageRect, gap = 0): boolean {
	return a.minX < b.maxX + gap
		&& a.maxX > b.minX - gap
		&& a.minY < b.maxY + gap
		&& a.maxY > b.minY - gap
}

function moved(rect: PageRect, x: number, y: number): PageRect {
	const width = rect.maxX - rect.minX
	const height = rect.maxY - rect.minY
	return { minX: x, minY: y, maxX: x + width, maxY: y + height }
}

/**
 * Find the smallest page-space translation that leaves an axis-aligned box
 * clear of every obstacle. A closest solution must put one of its four edges
 * on an obstacle clearance edge, so the finite cross-product below is exact
 * for these rectangular bounds rather than a grid/radius approximation.
 */
export function nearestClearTopLeft(
	subject: PageRect,
	obstacles: readonly PageRect[],
	gap = STEPPED_IN_NODE_CLEARANCE,
): PagePoint {
	if (!obstacles.some((obstacle) => overlaps(subject, obstacle))) {
		return { x: subject.minX, y: subject.minY }
	}

	const width = subject.maxX - subject.minX
	const height = subject.maxY - subject.minY
	const xs = new Set([subject.minX])
	const ys = new Set([subject.minY])
	for (const obstacle of obstacles) {
		xs.add(obstacle.minX - gap - width)
		xs.add(obstacle.maxX + gap)
		ys.add(obstacle.minY - gap - height)
		ys.add(obstacle.maxY + gap)
	}

	const candidates = Array.from(xs).flatMap((x) => Array.from(ys, (y) => ({ x, y })))
		.filter(({ x, y }) => {
			const candidate = moved(subject, x, y)
			return obstacles.every((obstacle) => !overlaps(candidate, obstacle, gap))
		})

	const score = ({ x, y }: PagePoint): readonly number[] => {
		const dx = x - subject.minX
		const dy = y - subject.minY
		return [
			dx * dx + dy * dy,
			Number(dx < 0) + Number(dy < 0),
			Math.abs(dx) + Math.abs(dy),
			Math.abs(dx),
			y,
			x,
		]
	}
	const compare = (a: PagePoint, b: PagePoint): number => {
		const aScore = score(a)
		const bScore = score(b)
		for (let index = 0; index < aScore.length; index += 1) {
			if (aScore[index] !== bScore[index]) return aScore[index] - bScore[index]
		}
		return 0
	}
	return candidates.sort(compare)[0] ?? { x: subject.minX, y: subject.minY }
}

function isOcclusionObstacle(shape: TLShape): boolean {
	// Lines are expected to pass behind nodes. Every area-bearing sibling,
	// including stock Frames and annotations, must remain visibly discoverable.
	return !PASS_THROUGH_SHAPES.has(shape.type)
}

/**
 * Resolve a resize-end correction for the currently entered Expanded Block.
 * Only x/y change: the Block keeps its parent, every child keeps its parent,
 * and no sibling is adopted merely because the new box covered it.
 */
export function steppedInResizeRelocation(
	editor: Editor,
	current: BlockShape,
): Pick<BlockShape, 'x' | 'y'> | null {
	if (getActiveDepthScopeId(editor) !== current.id || current.props.view !== 'expanded') return null
	const subject = editor.getShapePageBounds(current)
	if (!subject) return null

	const obstacles = editor.getSortedChildIdsForParent(current.parentId)
		.filter((id) => id !== current.id)
		.map((id) => editor.getShape(id))
		.filter((shape): shape is TLShape => Boolean(shape && isOcclusionObstacle(shape)))
		.map((shape) => editor.getShapePageBounds(shape))
		.filter((bounds): bounds is NonNullable<typeof bounds> => Boolean(bounds))
	const target = nearestClearTopLeft(subject, obstacles)
	const dx = target.x - subject.minX
	const dy = target.y - subject.minY
	if (Math.abs(dx) < 0.01 && Math.abs(dy) < 0.01) return null

	const pageOrigin = editor.getShapePageTransform(current).applyToPoint({ x: 0, y: 0 })
	const parentPoint = editor.getPointInParentSpace(current, {
		x: pageOrigin.x + dx,
		y: pageOrigin.y + dy,
	})
	return {
		x: Math.round(parentPoint.x * 100) / 100,
		y: Math.round(parentPoint.y * 100) / 100,
	}
}

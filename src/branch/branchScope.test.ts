import { Mat, type Editor, type TLShape, type TLShapeId } from 'tldraw'
import { describe, expect, it } from 'vitest'

import {
	BRANCH_ARM_HEADER_HEIGHT,
	BRANCH_BAND_HEIGHT,
	BRANCH_FADE_OPACITY,
	branchLayout,
	getDefaultBranchProps,
	setBranchActiveArmProps,
	setBranchArmOpenProps,
	setBranchViewProps,
	type BranchShape,
} from './branchModel'
import {
	branchAncestry,
	branchArmIdOfChild,
	branchFadeOpacity,
	branchFoldAttachPoint,
	foldedUnderCaseView,
	isHiddenByFoldedArm,
} from './branchScope'

function shape(id: string, type: string, parentId: string, x: number, y: number, extra: Partial<TLShape> = {}): TLShape {
	return {
		id: `shape:${id}` as TLShapeId,
		typeName: 'shape',
		type,
		x,
		y,
		rotation: 0,
		index: 'a1' as TLShape['index'],
		parentId: parentId as TLShape['parentId'],
		isLocked: false,
		opacity: 1,
		meta: {},
		props: {},
		...extra,
	} as TLShape
}

function branch(id: string, parentId: string, x: number, y: number, props = getDefaultBranchProps()): BranchShape {
	return shape(id, 'branch', parentId, x, y, { props } as Partial<TLShape>) as BranchShape
}

/** The slice of the editor the scope walk reads, over an in-memory tree. */
function stubEditor(shapes: TLShape[]): Editor {
	const byId = new Map(shapes.map((s) => [s.id, s]))
	const pagePoint = (s: TLShape): { x: number; y: number } => {
		const parent = byId.get(s.parentId as TLShapeId)
		if (!parent) return { x: s.x, y: s.y }
		const origin = pagePoint(parent)
		return { x: origin.x + s.x, y: origin.y + s.y }
	}
	return {
		getShape: (id: TLShapeId) => byId.get(id),
		getShapePageTransform: (id: TLShapeId) => {
			const target = byId.get(id)
			const origin = target ? pagePoint(target) : { x: 0, y: 0 }
			return Mat.Translate(origin.x, origin.y)
		},
	} as unknown as Editor
}

const open = getDefaultBranchProps()
const layout = branchLayout(open)

describe('arm membership', () => {
	it('reads the stamped arm first, then geometry', () => {
		const region = branch('br', 'page:page', 100, 100)
		const inFirst = shape('a', 'block', region.id, 20, layout.arms[0].bodyTop + 10)
		const inSecond = shape('b', 'block', region.id, 20, layout.arms[1].bodyTop + 10)
		expect(branchArmIdOfChild(region, inFirst)).toBe('arm_1')
		expect(branchArmIdOfChild(region, inSecond)).toBe('arm_2')
		const stamped = { ...inSecond, meta: { branchArm: 'arm_1' } }
		expect(branchArmIdOfChild(region, stamped)).toBe('arm_1')
		const stale = { ...inSecond, meta: { branchArm: 'arm_gone' } }
		expect(branchArmIdOfChild(region, stale)).toBe('arm_2')
	})
})

describe('fold attach and visibility', () => {
	const folded = setBranchArmOpenProps(open, 'arm_2', false)
	const region = branch('br', 'page:page', 100, 100, folded)
	const child = shape('c', 'block', region.id, 40, 60, { meta: { branchArm: 'arm_2' } })
	const outside = shape('o', 'block', 'page:page', 900, 100)
	const editor = stubEditor([region, child, outside])

	it('walks the Branch ancestry outermost first', () => {
		const levels = branchAncestry(editor, child.id)
		expect(levels.map((level) => [level.branch.id, level.armId])).toEqual([[region.id, 'arm_2']])
		expect(branchAncestry(editor, outside.id)).toEqual([])
	})

	it('attaches a cable into a folded arm at its header row edge, in page space', () => {
		const row = branchLayout(folded).arms[1]
		const into = branchFoldAttachPoint(editor, child.id, 'in')
		const outOf = branchFoldAttachPoint(editor, child.id, 'out')
		expect([into?.x, into?.y]).toEqual([100, 100 + row.rowCy])
		expect([outOf?.x, outOf?.y]).toEqual([100 + folded.w, 100 + row.rowCy])
		expect(row.rowCy).toBe(BRANCH_BAND_HEIGHT + BRANCH_ARM_HEADER_HEIGHT + open.arms[0].h + BRANCH_ARM_HEADER_HEIGHT / 2)
		expect(branchFoldAttachPoint(editor, outside.id, 'in')).toBeNull()
	})

	it('hides the child of a folded arm and reports the Case rule', () => {
		expect(isHiddenByFoldedArm(editor, child)).toBe(true)
		expect(isHiddenByFoldedArm(editor, outside)).toBe(false)
		expect(foldedUnderCaseView(editor, child.id)).toBe(false)
		const caseRegion = branch('br', 'page:page', 100, 100, setBranchViewProps(folded, 'case'))
		const caseEditor = stubEditor([caseRegion, child, outside])
		expect(foldedUnderCaseView(caseEditor, child.id)).toBe(true)
	})
})

describe('active arm fade', () => {
	it('fades everything outside the active arm, nested Branches included', () => {
		const active = setBranchActiveArmProps(open, 'arm_1')
		const outer = branch('outer', 'page:page', 0, 0, active)
		const inner = branch('inner', outer.id, 10, layout.arms[1].bodyTop + 4)
		const deep = shape('deep', 'block', inner.id, 10, branchLayout(open).arms[0].bodyTop + 4)
		const first = shape('first', 'block', outer.id, 10, layout.arms[0].bodyTop + 4)
		const editor = stubEditor([outer, inner, deep, first])
		expect(branchFadeOpacity(editor, first.id)).toBe(1)
		expect(branchFadeOpacity(editor, inner.id)).toBe(BRANCH_FADE_OPACITY)
		expect(branchFadeOpacity(editor, deep.id)).toBe(BRANCH_FADE_OPACITY)
		const nobody = stubEditor([branch('outer', 'page:page', 0, 0, open), first])
		expect(branchFadeOpacity(nobody, first.id)).toBe(1)
	})
})

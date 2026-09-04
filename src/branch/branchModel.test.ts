import { describe, expect, it } from 'vitest'

import {
	BRANCH_ARM_HEADER_HEIGHT,
	BRANCH_BAND_HEIGHT,
	BRANCH_MIN_ARM_HEIGHT,
	BRANCH_PAD_BOTTOM,
	appendBranchArmProps,
	appendBranchControlProps,
	branchArmIdForChildTop,
	branchHeightForArms,
	branchLayout,
	getDefaultBranchProps,
	moveBranchArmProps,
	reconcileBranchProps,
	removeBranchArmProps,
	setBranchActiveArmProps,
	setBranchArmOpenProps,
	setBranchViewProps,
	toggleBranchActiveArmProps,
	type BranchShapeProps,
} from './branchModel'

function props(overrides: Partial<BranchShapeProps> = {}): BranchShapeProps {
	const base = getDefaultBranchProps()
	const next = { ...base, ...overrides }
	return { ...next, h: branchHeightForArms(next.arms) }
}

describe('branch layout', () => {
	it('stacks the band, one header row per arm, and the open bodies', () => {
		const layout = branchLayout(props())
		expect(layout.band.h).toBe(BRANCH_BAND_HEIGHT)
		expect(layout.arms).toHaveLength(2)
		expect(layout.arms[0].rowTop).toBe(BRANCH_BAND_HEIGHT)
		expect(layout.arms[0].bodyTop).toBe(BRANCH_BAND_HEIGHT + BRANCH_ARM_HEADER_HEIGHT)
		expect(layout.arms[1].rowTop).toBe(layout.arms[0].bottom)
		expect(layout.arms[1].dividerY).toBe(layout.arms[1].rowTop)
		expect(layout.h).toBe(layout.arms[1].bottom + BRANCH_PAD_BOTTOM)
	})

	it('folds an arm to its header row and moves the arms below it up', () => {
		const open = props()
		const folded = setBranchArmOpenProps(open, 'arm_1', false)
		const before = branchLayout(open)
		const after = branchLayout(folded)
		expect(after.arms[0].bodyH).toBe(0)
		expect(after.arms[0].bottom).toBe(after.arms[0].rowTop + BRANCH_ARM_HEADER_HEIGHT)
		expect(after.arms[1].rowTop).toBe(before.arms[1].rowTop - before.arms[0].bodyH)
		expect(folded.h).toBe(open.h - before.arms[0].bodyH)
	})

	it('spreads control ports evenly within the band, on the left edge', () => {
		const one = appendBranchControlProps(props()).props
		const two = appendBranchControlProps(one, { name: 'mode' }).props
		expect(branchLayout(one).controls.map((c) => [c.x, c.y])).toEqual([[0, BRANCH_BAND_HEIGHT / 2]])
		expect(branchLayout(two).controls.map((c) => c.y)).toEqual([
			BRANCH_BAND_HEIGHT / 3,
			(BRANCH_BAND_HEIGHT * 2) / 3,
		])
		expect(two.controls[1].name).toBe('mode')
		expect(two.controls.map((c) => c.id)).toEqual(['ctrl_1', 'ctrl_2'])
		expect(one.controls[0].name).toBe('')
	})

	it('assigns a child to the arm whose row holds its top edge', () => {
		const p = props()
		const layout = branchLayout(p)
		expect(branchArmIdForChildTop(p, layout.arms[0].bodyTop + 10)).toBe('arm_1')
		expect(branchArmIdForChildTop(p, layout.arms[1].bodyTop + 10)).toBe('arm_2')
		// A folded arm has no body to be inside: the nearest open arm answers.
		const folded = setBranchArmOpenProps(p, 'arm_1', false)
		expect(branchArmIdForChildTop(folded, BRANCH_BAND_HEIGHT + 5)).toBe('arm_2')
	})

	it('reserves a fixed right-side control-exit lane without moving the active target', () => {
		const withIcons = props({
			arms: [
				{ ...props().arms[0], controlIcons: [{ kind: 'break', line: 5 }, { kind: 'continue', line: 7 }] },
				props().arms[1],
			],
		})
		const plain = branchLayout(props()).arms[0]
		const placed = branchLayout(withIcons).arms[0]
		expect(placed.target).toEqual(plain.target)
		expect(placed.controlIcons.w).toBe(51)
		expect(placed.controlIcons.x + placed.controlIcons.w).toBeLessThan(placed.target.x)
		expect(placed.title.x + placed.title.w).toBeLessThanOrEqual(placed.controlIcons.x - 6)
	})
})

describe('branch state rules', () => {
	it('case view keeps at most one arm open', () => {
		const three = appendBranchArmProps(props(), { title: 'elif' }).props
		expect(three.arms.filter((arm) => arm.open)).toHaveLength(3)
		const caseView = setBranchViewProps(three, 'case')
		expect(caseView.arms.filter((arm) => arm.open).map((arm) => arm.id)).toEqual(['arm_1'])
		const opened = setBranchArmOpenProps(caseView, 'arm_2', true)
		expect(opened.arms.filter((arm) => arm.open).map((arm) => arm.id)).toEqual(['arm_2'])
		const none = setBranchArmOpenProps(opened, 'arm_2', false)
		expect(none.arms.filter((arm) => arm.open)).toHaveLength(0)
		// A new arm in Case view arrives folded, unless nothing is open.
		expect(appendBranchArmProps(opened).arm.open).toBe(false)
		expect(appendBranchArmProps(none).arm.open).toBe(true)
		expect(appendBranchArmProps(props()).arm.title).toBe('')
	})

	it('expanded view leaves the arms as they are when leaving case view', () => {
		const caseView = setBranchViewProps(props(), 'case')
		const back = setBranchViewProps(caseView, 'expanded')
		expect(back.arms.map((arm) => arm.open)).toEqual([true, false])
	})

	it('holds at most one active arm; the same arm again clears it', () => {
		const active = setBranchActiveArmProps(props(), 'arm_2')
		expect(active.activeArmId).toBe('arm_2')
		expect(setBranchActiveArmProps(active, 'arm_1').activeArmId).toBe('arm_1')
		expect(toggleBranchActiveArmProps(active, 'arm_2').activeArmId).toBeNull()
		expect(setBranchActiveArmProps(active, 'missing')).toBe(active)
		expect(removeBranchArmProps(active, 'arm_2').activeArmId).toBeNull()
	})

	it('reorders arms and keeps the height', () => {
		const moved = moveBranchArmProps(props(), 'arm_2', 0)
		expect(moved.arms.map((arm) => arm.id)).toEqual(['arm_2', 'arm_1'])
		expect(moved.h).toBe(props().h)
	})
})

describe('reconciliation', () => {
	it('follows the arms when a command changed them', () => {
		const before = props()
		const folded = { ...setBranchArmOpenProps(before, 'arm_1', false), h: before.h }
		expect(reconcileBranchProps(before, folded).h).toBe(branchHeightForArms(folded.arms))
	})

	it('recognises a source pass replacing only an arm control-icon list', () => {
		const before = props()
		const next = {
			...before,
			arms: before.arms.map((arm, index) => index === 0
				? { ...arm, controlIcons: [{ kind: 'break' as const, line: 5 }] }
				: arm),
		}
		const reconciled = reconcileBranchProps(before, next)
		expect(reconciled.arms[0].controlIcons).toEqual([{ kind: 'break', line: 5 }])
		expect(reconciled.h).toBe(next.h)
	})

	it('shares a resize over the open arms and never below the floor', () => {
		const before = props()
		const taller = reconcileBranchProps(before, { ...before, h: before.h + 100 })
		expect(taller.arms.map((arm) => arm.h)).toEqual([230, 230])
		expect(taller.h).toBe(before.h + 100)
		const squashed = reconcileBranchProps(before, { ...before, h: 10 })
		expect(squashed.arms.every((arm) => arm.h === BRANCH_MIN_ARM_HEIGHT)).toBe(true)
		expect(squashed.h).toBe(branchHeightForArms(squashed.arms))
	})

	it('holds the height when nothing is open', () => {
		const before = setBranchArmOpenProps(setBranchArmOpenProps(props(), 'arm_1', false), 'arm_2', false)
		const resized = reconcileBranchProps(before, { ...before, h: before.h + 200 })
		expect(resized.h).toBe(before.h)
	})
})

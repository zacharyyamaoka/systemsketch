/**
 * The Branch region: an `if` drawn as a frame-like container, never a Block.
 *
 * The contract Zach settled on 2026-09-02, verbatim where it matters:
 *
 *   - a region other Blocks drop into, with NO ports except control ports on
 *     its band — the values the branch decides on land on the band, never on
 *     an arm, and cables run straight to the Blocks inside;
 *   - an ordered list of arms, each with a free-text title (human readable,
 *     not code), an open/folded state and its own body height;
 *   - three pieces of state: `view` (expanded | case), per-arm `open`, and at
 *     most one `activeArmId` — no active arm means every arm is active;
 *   - Case view is the Expanded layout with at most one arm open per region.
 *
 * Everything geometric derives from `branchLayout`; the shape's `h` is kept in
 * step with the arms by `reconcileBranchProps`, so a fold, an added arm and a
 * tldraw resize all agree about where every row is.
 */
import { T, type TLShape } from 'tldraw'

import { ControlIcon, controlIconRowWidth, type ControlIcon as ControlIconType } from '../controlIconModel'

export const BRANCH_SHAPE_TYPE = 'branch' as const
export const BRANCH_TOOL_ID = 'branch' as const

export const BRANCH_VIEWS = ['expanded', 'case'] as const
export type BranchView = (typeof BRANCH_VIEWS)[number]

/** Band, arm header and paddings, at canvas scale (a Block's header is 48). */
export const BRANCH_BAND_HEIGHT = 40
export const BRANCH_ARM_HEADER_HEIGHT = 32
export const BRANCH_PAD_BOTTOM = 10
export const BRANCH_DEFAULT_ARM_HEIGHT = 180
export const BRANCH_MIN_ARM_HEIGHT = 48
export const BRANCH_MIN_WIDTH = 240
export const BRANCH_CORNER_RADIUS = 6
export const BRANCH_PORT_RADIUS = 6
/** Non-active arms, their Blocks and their cables fade to this. One token. */
export const BRANCH_FADE_OPACITY = 0.18
/** The dashed "+ arm" row shown under the last arm while the region is selected. */
export const BRANCH_ADD_ARM_ROW_HEIGHT = 26

export const BranchArm = T.object({
	id: T.string,
	title: T.string,
	open: T.boolean,
	/** Body height while open; remembered while folded. */
	h: T.number,
	/** Offline Python analysis writes exits here; the canvas only draws them. */
	controlIcons: T.arrayOf(ControlIcon).optional(),
})
export type BranchArm = T.TypeOf<typeof BranchArm>

/** A control port: an input on the band. Authored, never derived from a title. */
export const BranchControlPort = T.object({
	id: T.string,
	name: T.string,
	type: T.string,
})
export type BranchControlPort = T.TypeOf<typeof BranchControlPort>

export const BRANCH_SHAPE_PROPS = {
	w: T.number,
	h: T.number,
	title: T.string,
	view: T.literalEnum(...BRANCH_VIEWS),
	activeArmId: T.string.nullable(),
	controls: T.arrayOf(BranchControlPort),
	arms: T.arrayOf(BranchArm),
} as const

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		[BRANCH_SHAPE_TYPE]: {
			w: number
			h: number
			title: string
			view: BranchView
			activeArmId: string | null
			controls: BranchControlPort[]
			arms: BranchArm[]
		}
	}
}

export type BranchShape = TLShape<typeof BRANCH_SHAPE_TYPE>
export type BranchShapeProps = BranchShape['props']

/** The meta key a child carries once its arm has been derived from geometry. */
export const BRANCH_ARM_META_KEY = 'branchArm'

export function isBranchShape(shape: TLShape | null | undefined): shape is BranchShape {
	return shape?.type === BRANCH_SHAPE_TYPE
}

/* --------------------------------- layout ---------------------------------- */

export interface BranchRect {
	x: number
	y: number
	w: number
	h: number
}

export interface BranchControlLayout {
	port: BranchControlPort
	/** Dot centre, Branch-local: always on the left edge of the band. */
	x: number
	y: number
	label: BranchRect
}

export interface BranchArmLayout {
	arm: BranchArm
	index: number
	rowTop: number
	rowCy: number
	header: BranchRect
	chevron: BranchRect
	title: BranchRect
	/** The fixed right-aligned control-exit column, before the active target. */
	controlIcons: BranchRect
	target: BranchRect
	bodyTop: number
	/** 0 while folded. */
	bodyH: number
	bottom: number
	/** The thick divider above this arm; null for the first. */
	dividerY: number | null
}

export interface BranchLayout {
	w: number
	h: number
	band: BranchRect
	title: BranchRect
	controls: readonly BranchControlLayout[]
	arms: readonly BranchArmLayout[]
	/** Where the "+ arm" affordance sits, under the last arm. */
	addArmRow: BranchRect
	/** Where the "+" bubble for a new control port sits, on the band's left edge. */
	addControl: { x: number; y: number }
}

const CHEVRON_W = 22
const TARGET_W = 28
const HEADER_PAD_X = 10
const HEADER_RIGHT_GAP = 6

export function branchHeightForArms(arms: readonly BranchArm[]): number {
	return BRANCH_BAND_HEIGHT
		+ arms.reduce((sum, arm) => sum + BRANCH_ARM_HEADER_HEIGHT + (arm.open ? arm.h : 0), 0)
		+ BRANCH_PAD_BOTTOM
}

export function branchLayout(props: BranchShapeProps): BranchLayout {
	const w = Math.max(1, props.w)
	const band = { x: 0, y: 0, w, h: BRANCH_BAND_HEIGHT }
	const controlCount = props.controls.length
	const controls: BranchControlLayout[] = props.controls.map((port, index) => {
		const y = (BRANCH_BAND_HEIGHT * (index + 1)) / (controlCount + 1)
		return {
			port,
			x: 0,
			y,
			label: { x: 14, y: y - 9, w: Math.min(140, Math.max(60, w * 0.3)), h: 18 },
		}
	})
	// The title keeps clear of the control labels on the left.
	const titleInset = controlCount > 0 ? Math.min(150, Math.max(70, w * 0.3)) + 8 : 12
	const title = { x: titleInset, y: 6, w: Math.max(40, w - titleInset * 2), h: BRANCH_BAND_HEIGHT - 12 }

	const arms: BranchArmLayout[] = []
	let cursor = BRANCH_BAND_HEIGHT
	props.arms.forEach((arm, index) => {
		const rowTop = cursor
		const bodyTop = rowTop + BRANCH_ARM_HEADER_HEIGHT
		const bodyH = arm.open ? arm.h : 0
		const iconW = controlIconRowWidth(arm.controlIcons)
		const target = { x: w - HEADER_PAD_X - TARGET_W, y: rowTop + 2, w: TARGET_W, h: BRANCH_ARM_HEADER_HEIGHT - 4 }
		const controlIcons = {
			x: target.x - (iconW ? iconW + HEADER_RIGHT_GAP : 0),
			y: rowTop + (BRANCH_ARM_HEADER_HEIGHT - 20) / 2,
			w: iconW,
			h: 20,
		}
		const titleRight = controlIcons.x - HEADER_RIGHT_GAP
		arms.push({
			arm,
			index,
			rowTop,
			rowCy: rowTop + BRANCH_ARM_HEADER_HEIGHT / 2,
			header: { x: 0, y: rowTop, w, h: BRANCH_ARM_HEADER_HEIGHT },
			chevron: { x: HEADER_PAD_X, y: rowTop + 4, w: CHEVRON_W, h: BRANCH_ARM_HEADER_HEIGHT - 8 },
			title: {
				x: HEADER_PAD_X + CHEVRON_W + 4,
				y: rowTop + 4,
				w: Math.max(40, titleRight - (HEADER_PAD_X + CHEVRON_W + 4)),
				h: BRANCH_ARM_HEADER_HEIGHT - 8,
			},
			controlIcons,
			target,
			bodyTop,
			bodyH,
			bottom: bodyTop + bodyH,
			dividerY: index === 0 ? null : rowTop,
		})
		cursor = bodyTop + bodyH
	})

	return {
		w,
		h: cursor + BRANCH_PAD_BOTTOM,
		band,
		title,
		controls,
		arms,
		// Hangs off the bottom edge, as the "+" bubble hangs off the band's left
		// edge: a selected-only affordance never takes room inside the region.
		addArmRow: { x: 8, y: cursor + BRANCH_PAD_BOTTOM + 6, w: Math.max(0, w - 16), h: BRANCH_ADD_ARM_ROW_HEIGHT },
		addControl: { x: 0, y: BRANCH_BAND_HEIGHT / 2 },
	}
}

/** The arm whose row (header plus body) contains a Branch-local y, if any. */
export function branchArmAtLocalY(layout: BranchLayout, y: number): BranchArmLayout | null {
	for (const arm of layout.arms) {
		if (y >= arm.rowTop && y < arm.bottom) return arm
	}
	return null
}

/** Which arm a child whose top edge is at `childY` belongs to, by geometry. */
export function branchArmIdForChildTop(props: BranchShapeProps, childY: number): string | null {
	const layout = branchLayout(props)
	// A child's top edge sits in an arm's BODY; the header row belongs to the
	// arm too, so a Block nudged up against a header still counts as inside.
	const arm = branchArmAtLocalY(layout, childY)
	if (arm && arm.bodyH > 0) return arm.arm.id
	// Below the last row, or in the band: the nearest open arm by distance.
	let best: BranchArmLayout | null = null
	let bestDistance = Number.POSITIVE_INFINITY
	for (const candidate of layout.arms) {
		if (candidate.bodyH <= 0) continue
		const distance = childY < candidate.bodyTop ? candidate.bodyTop - childY : childY - candidate.bottom
		if (distance < bestDistance) {
			bestDistance = distance
			best = candidate
		}
	}
	return best?.arm.id ?? null
}

/* --------------------------------- defaults --------------------------------- */

let armCounter = 0

function nextArmId(arms: readonly BranchArm[]): string {
	const highest = arms.reduce((best, arm) => {
		const match = /^arm_(\d+)$/.exec(arm.id)
		return match ? Math.max(best, Number(match[1])) : best
	}, 0)
	armCounter = Math.max(armCounter, highest) + 1
	return `arm_${armCounter}`
}

function nextControlId(controls: readonly BranchControlPort[]): string {
	const highest = controls.reduce((best, port) => {
		const match = /^ctrl_(\d+)$/.exec(port.id)
		return match ? Math.max(best, Number(match[1])) : best
	}, 0)
	return `ctrl_${highest + 1}`
}

export function getDefaultBranchProps(): BranchShapeProps {
	const arms: BranchArm[] = [
		{ id: 'arm_1', title: 'if', open: true, h: BRANCH_DEFAULT_ARM_HEIGHT },
		{ id: 'arm_2', title: 'else', open: true, h: BRANCH_DEFAULT_ARM_HEIGHT },
	]
	return {
		w: 520,
		h: branchHeightForArms(arms),
		title: 'Branch',
		view: 'expanded',
		activeArmId: null,
		controls: [],
		arms,
	}
}

/* ----------------------------- pure transitions ----------------------------- */

export function appendBranchControlProps(
	props: BranchShapeProps,
	initial: Partial<Pick<BranchControlPort, 'name' | 'type'>> = {},
): { props: BranchShapeProps; port: BranchControlPort } {
	const id = nextControlId(props.controls)
	// An implementation id is not a helpful starting value for a control name.
	// Keep it stable in `id`; the blank label receives the inspector's guidance.
	const port: BranchControlPort = { id, name: initial.name ?? '', type: initial.type ?? '' }
	return { props: { ...props, controls: [...props.controls, port] }, port }
}

export function patchBranchControlProps(
	props: BranchShapeProps,
	portId: string,
	patch: Partial<Pick<BranchControlPort, 'name' | 'type'>>,
): BranchShapeProps {
	const index = props.controls.findIndex((port) => port.id === portId)
	if (index < 0) return props
	const current = props.controls[index]
	const next = { ...current, ...patch }
	if (next.name === current.name && next.type === current.type) return props
	const controls = [...props.controls]
	controls[index] = next
	return { ...props, controls }
}

export function removeBranchControlProps(props: BranchShapeProps, portId: string): BranchShapeProps {
	const controls = props.controls.filter((port) => port.id !== portId)
	return controls.length === props.controls.length ? props : { ...props, controls }
}

export function appendBranchArmProps(
	props: BranchShapeProps,
	initial: Partial<Pick<BranchArm, 'title' | 'h'>> = {},
): { props: BranchShapeProps; arm: BranchArm } {
	const id = nextArmId(props.arms)
	// Case view keeps at most one arm open, so a new arm arrives folded there.
	const open = props.view === 'expanded' || !props.arms.some((arm) => arm.open)
	const arm: BranchArm = {
		id,
		title: initial.title ?? '',
		open,
		h: initial.h ?? BRANCH_DEFAULT_ARM_HEIGHT,
	}
	const arms = [...props.arms, arm]
	return { props: { ...props, arms, h: branchHeightForArms(arms) }, arm }
}

export function patchBranchArmProps(
	props: BranchShapeProps,
	armId: string,
	patch: Partial<Pick<BranchArm, 'title' | 'h'>>,
): BranchShapeProps {
	const index = props.arms.findIndex((arm) => arm.id === armId)
	if (index < 0) return props
	const current = props.arms[index]
	const next = { ...current, ...patch, h: Math.max(BRANCH_MIN_ARM_HEIGHT, patch.h ?? current.h) }
	if (next.title === current.title && next.h === current.h) return props
	const arms = [...props.arms]
	arms[index] = next
	return { ...props, arms, h: branchHeightForArms(arms) }
}

export function removeBranchArmProps(props: BranchShapeProps, armId: string): BranchShapeProps {
	const arms = props.arms.filter((arm) => arm.id !== armId)
	if (arms.length === props.arms.length) return props
	return {
		...props,
		arms,
		h: branchHeightForArms(arms),
		activeArmId: props.activeArmId === armId ? null : props.activeArmId,
	}
}

export function moveBranchArmProps(props: BranchShapeProps, armId: string, toIndex: number): BranchShapeProps {
	const from = props.arms.findIndex((arm) => arm.id === armId)
	if (from < 0) return props
	const target = Math.max(0, Math.min(props.arms.length - 1, toIndex))
	if (target === from) return props
	const arms = [...props.arms]
	const [moved] = arms.splice(from, 1)
	arms.splice(target, 0, moved)
	return { ...props, arms }
}

/**
 * Open or fold one arm.
 *
 * In Case view opening an arm folds every other arm; folding the open arm
 * leaves every arm folded, which is allowed ("at most one open").
 */
export function setBranchArmOpenProps(props: BranchShapeProps, armId: string, open: boolean): BranchShapeProps {
	if (!props.arms.some((arm) => arm.id === armId)) return props
	const arms = props.arms.map((arm) => {
		if (arm.id === armId) return arm.open === open ? arm : { ...arm, open }
		if (open && props.view === 'case' && arm.open) return { ...arm, open: false }
		return arm
	})
	if (arms.every((arm, index) => arm === props.arms[index])) return props
	return { ...props, arms, h: branchHeightForArms(arms) }
}

/** The active arm; the same arm again clears it, and null clears it. */
export function setBranchActiveArmProps(props: BranchShapeProps, armId: string | null): BranchShapeProps {
	if (armId !== null && !props.arms.some((arm) => arm.id === armId)) return props
	if (props.activeArmId === armId) return props
	return { ...props, activeArmId: armId }
}

export function toggleBranchActiveArmProps(props: BranchShapeProps, armId: string): BranchShapeProps {
	return setBranchActiveArmProps(props, props.activeArmId === armId ? null : armId)
}

/**
 * Switch the view. Entering Case view keeps only the first open arm open;
 * leaving it leaves the arms exactly as they are.
 */
export function setBranchViewProps(props: BranchShapeProps, view: BranchView): BranchShapeProps {
	if (props.view === view) return props
	if (view === 'expanded') return { ...props, view }
	let kept = false
	const arms = props.arms.map((arm) => {
		if (!arm.open) return arm
		if (!kept) {
			kept = true
			return arm
		}
		return { ...arm, open: false }
	})
	return { ...props, view, arms, h: branchHeightForArms(arms) }
}

/** Every arm with `armId` open in Case view is one arm; in Expanded it is a toggle. */
export function branchArmIsOpen(props: BranchShapeProps, armId: string): boolean {
	return props.arms.find((arm) => arm.id === armId)?.open ?? false
}

/* ------------------------------- reconciliation ----------------------------- */

function sameArms(a: readonly BranchArm[], b: readonly BranchArm[]): boolean {
	if (a.length !== b.length) return false
	return a.every((arm, index) => {
		const other = b[index]
		return arm.id === other.id
			&& arm.open === other.open
			&& arm.h === other.h
			&& arm.title === other.title
			&& sameControlIcons(arm.controlIcons, other.controlIcons)
	})
}

function sameControlIcons(a: readonly ControlIconType[] | undefined, b: readonly ControlIconType[] | undefined): boolean {
	if (a === b) return true
	if (!a || !b || a.length !== b.length) return false
	return a.every((icon, index) => icon.kind === b[index].kind && icon.line === b[index].line)
}

/**
 * Keep `h` and the arms in step, whichever side wrote.
 *
 * A command that folds, adds or resizes an arm writes the arms and expects
 * `h` to follow. tldraw's resize writes `h` and expects the open arms to share
 * the change. Both go through here, so a Branch can never carry a height its
 * rows do not add up to.
 */
export function reconcileBranchProps(previous: BranchShapeProps, next: BranchShapeProps): BranchShapeProps {
	const expected = branchHeightForArms(next.arms)
	const w = Math.max(BRANCH_MIN_WIDTH, next.w)
	if (!sameArms(previous.arms, next.arms) || next.h === expected) {
		return next.h === expected && next.w === w ? next : { ...next, w, h: expected }
	}
	// A resize: spread the delta over the open arms, weighted by their heights.
	const open = next.arms.filter((arm) => arm.open)
	if (open.length === 0) return { ...next, w, h: expected }
	const delta = next.h - expected
	const total = open.reduce((sum, arm) => sum + arm.h, 0)
	let remaining = delta
	const arms = next.arms.map((arm) => {
		if (!arm.open) return arm
		const isLast = open[open.length - 1] === arm
		const share = isLast ? remaining : Math.round((delta * arm.h) / Math.max(1, total))
		remaining -= share
		const h = Math.max(BRANCH_MIN_ARM_HEIGHT, arm.h + share)
		return h === arm.h ? arm : { ...arm, h }
	})
	return { ...next, w, arms, h: branchHeightForArms(arms) }
}

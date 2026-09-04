/**
 * Pure Block property migrations, in file-version order.
 *
 * A `.systemsketch` file already carries tldraw's schema sequence versions.
 * During load, tldraw selects each Block record and threads its `props` through
 * these functions. Keep this module data-only: no editor, React, DOM, store, or
 * rendering imports. A new stored Block shape change gets exactly one named
 * `VnToVnPlus1` function and one entry in `blockShapeMigrations` below.
 *
 * tldraw accepts either in-place edits or a returned object. We always return
 * a new object when a step changes anything, which makes every transform easy
 * to exercise directly without constructing an editor or opening a board.
 */
import {
	createShapePropsMigrationIds,
	createShapePropsMigrationSequence,
} from 'tldraw'

import {
	BLOCK_SHAPE_TYPE,
	DEFAULT_BLOCK_VIEW_SIZES,
} from './blockModel'

export type BlockMigrationProps = Record<string, unknown>

type StoredViewSize = { w?: number; h?: number }
type StoredViews = Record<string, StoredViewSize>

const LEGACY_VIEW_SIZES = {
	simple: { w: 240, h: 148 },
	port: { w: 360, h: 230 },
	expanded: { w: 640, h: 430 },
} as const

const RESTORED_VIEW_SIZES = {
	simple: { w: 320, h: 206 },
	port: { w: 340, h: 198 },
	expanded: { w: 560, h: 380 },
} as const

const blockVersions = createShapePropsMigrationIds(BLOCK_SHAPE_TYPE, {
	RestorePyblocksUi: 1,
	PortLayoutStyle: 2,
	PortRows: 3,
	ValueView: 4,
	DiffState: 5,
	FieldDiffs: 6,
})

function storedViews(props: BlockMigrationProps): StoredViews | undefined {
	const views = props.views
	return views && typeof views === 'object' && !Array.isArray(views)
		? views as StoredViews
		: undefined
}

/** v0 → v1: update untouched pyblocks-era view boxes to the restored UI sizes. */
export function upgradeBlockPropsV0ToV1(props: BlockMigrationProps): BlockMigrationProps {
	const view = props.view as keyof typeof LEGACY_VIEW_SIZES
	const views = storedViews(props)
	if (!views || !(view in LEGACY_VIEW_SIZES)) return props

	const nextViews = { ...views }
	for (const key of Object.keys(LEGACY_VIEW_SIZES) as (keyof typeof LEGACY_VIEW_SIZES)[]) {
		const box = views[key]
		const legacy = LEGACY_VIEW_SIZES[key]
		if (box?.w === legacy.w && box?.h === legacy.h) {
			nextViews[key] = { ...RESTORED_VIEW_SIZES[key] }
		}
	}

	const activeLegacy = LEGACY_VIEW_SIZES[view]
	return props.w === activeLegacy.w && props.h === activeLegacy.h
		? {
			...props,
			views: nextViews,
			w: nextViews[view]?.w ?? props.w,
			h: nextViews[view]?.h ?? props.h,
		}
		: { ...props, views: nextViews }
}

/** v1 → v0: reverse only boxes that still match the v1 defaults. */
export function downgradeBlockPropsV1ToV0(props: BlockMigrationProps): BlockMigrationProps {
	const view = props.view as keyof typeof RESTORED_VIEW_SIZES
	const views = storedViews(props)
	if (!views || !(view in RESTORED_VIEW_SIZES)) return props

	const nextViews = { ...views }
	for (const key of Object.keys(RESTORED_VIEW_SIZES) as (keyof typeof RESTORED_VIEW_SIZES)[]) {
		const box = views[key]
		const restored = RESTORED_VIEW_SIZES[key]
		if (box?.w === restored.w && box?.h === restored.h) {
			nextViews[key] = { ...LEGACY_VIEW_SIZES[key] }
		}
	}

	const activeRestored = RESTORED_VIEW_SIZES[view]
	return props.w === activeRestored.w && props.h === activeRestored.h
		? {
			...props,
			views: nextViews,
			w: nextViews[view]?.w ?? props.w,
			h: nextViews[view]?.h ?? props.h,
		}
		: { ...props, views: nextViews }
}

/** v1 → v2: make the new StyleProp's ordinary value explicit. */
export function upgradeBlockPropsV1ToV2(props: BlockMigrationProps): BlockMigrationProps {
	return props.portLayout === undefined ? { ...props, portLayout: 'inline' } : props
}

function upgradePortRows(
	ports: readonly unknown[],
	side: 'inputs' | 'outputs',
): BlockMigrationProps[] {
	let row = 1
	let branch = 0
	let inGroup = 0
	return ports.map((value) => {
		const port = value as BlockMigrationProps
		const { groupStart, branchStart, header, ...rest } = port
		if (side === 'inputs' && header === true) return { ...rest, row: 0 }
		if (inGroup > 0 && groupStart === true) {
			row += 1
			branch = 0
			inGroup = 0
		} else if (side === 'outputs' && inGroup > 0 && branchStart === true) {
			branch += 1
		}
		inGroup += 1
		return {
			...rest,
			...(row === 1 ? {} : { row }),
			...(branch === 0 ? {} : { branch }),
		}
	})
}

/** v2 → v3: replace group/branch/header markers with explicit row addresses. */
export function upgradeBlockPropsV2ToV3(props: BlockMigrationProps): BlockMigrationProps {
	let next = props
	for (const side of ['inputs', 'outputs'] as const) {
		const ports = props[side]
		if (Array.isArray(ports)) next = { ...next, [side]: upgradePortRows(ports, side) }
	}
	return next
}

/** v3 → v4: give every Block the remembered box for the new Value view. */
export function upgradeBlockPropsV3ToV4(props: BlockMigrationProps): BlockMigrationProps {
	const views = storedViews(props)
	return views && !views.value
		? { ...props, views: { ...views, value: { ...DEFAULT_BLOCK_VIEW_SIZES.value } } }
		: props
}

/** v4 → v3: remove the Value box and show Value Blocks as honest Simple cards. */
export function downgradeBlockPropsV4ToV3(props: BlockMigrationProps): BlockMigrationProps {
	const views = storedViews(props)
	let nextViews = views
	let changed = false
	if (views?.value) {
		const { value: _value, ...rest } = views
		nextViews = rest
		changed = true
	}

	if (props.view === 'value') {
		const simple = nextViews?.simple
		return {
			...props,
			...(changed ? { views: nextViews } : {}),
			view: 'simple',
			...(simple ? { w: simple.w ?? props.w, h: simple.h ?? props.h } : {}),
		}
	}
	return changed ? { ...props, views: nextViews } : props
}

/** v4 → v5: make the shared diff/linter StyleProp's ordinary value explicit. */
export function upgradeBlockPropsV4ToV5(props: BlockMigrationProps): BlockMigrationProps {
	return props.state === undefined ? { ...props, state: 'normal' } : props
}

function withoutPortState(port: unknown): BlockMigrationProps {
	const {
		state: _state,
		stateBefore: _stateBefore,
		...rest
	} = port as BlockMigrationProps
	return rest
}

/** v5 → v4: remove the diff lens and omit ghost rows that never existed. */
export function downgradeBlockPropsV5ToV4(props: BlockMigrationProps): BlockMigrationProps {
	const { state: _state, ...rest } = props
	let next = rest
	for (const side of ['inputs', 'outputs'] as const) {
		const ports = props[side]
		if (!Array.isArray(ports)) continue
		next = {
			...next,
			[side]: ports
				.filter((port) => (port as BlockMigrationProps).state !== 'removed')
				.map(withoutPortState),
		}
	}
	return next
}

/** v5 → v6: field diffs are optional, so old Blocks need no new stored value. */
export function upgradeBlockPropsV5ToV6(props: BlockMigrationProps): BlockMigrationProps {
	return props
}

function withoutPortFieldDiffs(port: unknown): BlockMigrationProps {
	const { fieldDiffs: _fieldDiffs, ...rest } = port as BlockMigrationProps
	return rest
}

/** v6 → v5: remove before/after field and geometry metadata. */
export function downgradeBlockPropsV6ToV5(props: BlockMigrationProps): BlockMigrationProps {
	const {
		fieldDiffs: _fieldDiffs,
		priorPose: _priorPose,
		...rest
	} = props
	let next = rest
	for (const side of ['inputs', 'outputs'] as const) {
		const ports = props[side]
		if (Array.isArray(ports)) {
			next = { ...next, [side]: ports.map(withoutPortFieldDiffs) }
		}
	}
	return next
}

/**
 * The only adapter from the pure version steps above to tldraw's file loader.
 * tldraw composes the required slice based on the schema version in the file.
 */
export const blockShapeMigrations = createShapePropsMigrationSequence({
	sequence: [{
		id: blockVersions.RestorePyblocksUi,
		up: upgradeBlockPropsV0ToV1,
		down: downgradeBlockPropsV1ToV0,
	}, {
		id: blockVersions.PortLayoutStyle,
		up: upgradeBlockPropsV1ToV2,
		// The v1 validator accepted a present portLayout, so no data is removed.
		down: 'none',
	}, {
		id: blockVersions.PortRows,
		up: upgradeBlockPropsV2ToV3,
		// Explicit rows cannot be represented faithfully as the old marker grammar.
		down: 'none',
	}, {
		id: blockVersions.ValueView,
		up: upgradeBlockPropsV3ToV4,
		down: downgradeBlockPropsV4ToV3,
	}, {
		id: blockVersions.DiffState,
		up: upgradeBlockPropsV4ToV5,
		down: downgradeBlockPropsV5ToV4,
	}, {
		id: blockVersions.FieldDiffs,
		up: upgradeBlockPropsV5ToV6,
		down: downgradeBlockPropsV6ToV5,
	}],
})

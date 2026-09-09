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
	SemanticRolesAndStockConfig: 7,
	// `TypeAttributes` (main) and the Type-primitive branch's own
	// `AttributeSource` migration were the same transform — both strip a
	// stray `attributeSource` on the way down — added independently for the
	// same feature. Keeping main's numbering/name here; the duplicate was
	// dropped rather than renumbered, since it did nothing TypeAttributes
	// doesn't already do.
	TypeAttributes: 8,
	BlockChrome: 9,
	FoldAndAutoResize: 10,
	MemberLayout: 11,
	InsetBackground: 12,
	AssetIcon: 13,
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

/** v9 → v10: compact folding and auto-fit are off until an author opts in. */
export function upgradeBlockPropsV9ToV10(props: BlockMigrationProps): BlockMigrationProps {
	return {
		...props,
		...(props.foldable === undefined ? { foldable: false } : {}),
		...(props.folded === undefined ? { folded: false } : {}),
		...(props.autoResize === undefined ? { autoResize: false } : {}),
	}
}

/** v10 → v9: presentation-only controls did not exist in the older schema. */
export function downgradeBlockPropsV10ToV9(props: BlockMigrationProps): BlockMigrationProps {
	const { foldable: _foldable, folded: _folded, autoResize: _autoResize, ...rest } = props
	return rest
}

/**
 * v6 → v7: reserve one persisted vocabulary seam. Role claims need no default;
 * curated stock config is normalized when legacy experiments supplied one.
 *
 * Earlier experimental records may carry a UI-only `runtimeAdapter` flag or
 * an unusable numeric rate. A board can truthfully preserve source/rate intent
 * but it must not serialize a live adapter capability or paint an invalid rate.
 */
export function upgradeBlockPropsV6ToV7(props: BlockMigrationProps): BlockMigrationProps {
	const raw = props.stockConfig
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
		return props.blockType === 'projection' ? { ...props, blockType: 'unbundle' } : props
	}
	const config = raw as BlockMigrationProps
	const source = config.triggerSource === 'external' || config.triggerSource === 'manual'
		? config.triggerSource
		: 'clock'
	const rate = typeof config.rateHz === 'number' && Number.isFinite(config.rateHz) && config.rateHz > 0
		? config.rateHz
		: 10
	const stockConfig = source === 'clock'
		? { triggerSource: source, rateHz: rate }
		: { triggerSource: source }
	const next = JSON.stringify(stockConfig) === JSON.stringify(raw) ? props : { ...props, stockConfig }
	// WHY: only the shipped Projection preset has an unambiguous new name; other
	// editable words (including Set attributes) are authored vocabulary, not aliases.
	return next.blockType === 'projection' ? { ...next, blockType: 'unbundle' } : next
}

function withoutSemanticRoleClaims(port: unknown): BlockMigrationProps {
	const { semanticRoleDerived: _derived, semanticRoleAuthored: _authored, ...rest } = port as BlockMigrationProps
	return rest
}

/** v7 → v6: older readers cannot interpret either vocabulary addition. */
export function downgradeBlockPropsV7ToV6(props: BlockMigrationProps): BlockMigrationProps {
	const { stockConfig: _stockConfig, ...rest } = props
	let next = _stockConfig === undefined ? props : rest
	for (const side of ['inputs', 'outputs'] as const) {
		const ports = props[side]
		if (Array.isArray(ports)) next = { ...next, [side]: ports.map(withoutSemanticRoleClaims) }
	}
	return next.blockType === 'unbundle' ? { ...next, blockType: 'projection' } : next
}

/** v10 → v11: existing Expanded Blocks keep their separated-card presentation. */
export function upgradeBlockPropsV10ToV11(props: BlockMigrationProps): BlockMigrationProps {
	return props.memberLayout === undefined ? { ...props, memberLayout: 'inset' } : props
}

/** v11 → v10: older readers do not know the direct-child presentation policy. */
export function downgradeBlockPropsV11ToV10(props: BlockMigrationProps): BlockMigrationProps {
	const { memberLayout: _memberLayout, ...rest } = props
	return rest
}

/** v11 → v12: existing inset layouts keep the white production default. */
export function upgradeBlockPropsV11ToV12(props: BlockMigrationProps): BlockMigrationProps {
	return props.insetBackground === undefined ? { ...props, insetBackground: 'white' } : props
}

/** v12 → v11: older readers do not know the optional inset well treatment. */
export function downgradeBlockPropsV12ToV11(props: BlockMigrationProps): BlockMigrationProps {
	const { insetBackground: _insetBackground, ...rest } = props
	return rest
}

/**
 * v12 → v13: strip a stored `assetId: null` down to genuinely absent.
 *
 * `null` was this feature's original, mistaken default (see blockModel.ts's
 * `assetId` prop doc); a real uploaded value is left untouched. Nothing
 * needs adding for a Block that never had the key at all — `assetId` is
 * optional and was never given an up-migration default.
 */
export function upgradeBlockPropsV12ToV13(props: BlockMigrationProps): BlockMigrationProps {
	if (!('assetId' in props) || props.assetId != null) return props
	const { assetId: _assetId, ...rest } = props
	return rest
}

/** v13 → v12: older readers do not know the uploaded-icon asset prop at all. */
export function downgradeBlockPropsV13ToV12(props: BlockMigrationProps): BlockMigrationProps {
	if (!('assetId' in props)) return props
	const { assetId: _assetId, ...rest } = props
	return rest
}

/**
 * v8 → v9: preserve the old painted face when chrome becomes configurable.
 *
 * Older boards always had both marks. Explicit `true` values make that visual
 * contract survive loading, duplication, and later batch-style edits.
 */
export function upgradeBlockPropsV8ToV9(props: BlockMigrationProps): BlockMigrationProps {
	return props.showFooter === undefined || props.showHeaderDivider === undefined
		? {
			...props,
			showFooter: props.showFooter ?? true,
			showHeaderDivider: props.showHeaderDivider ?? true,
		}
		: props
}

/** v9 → v8: remove the presentation fields the old validator does not know. */
export function downgradeBlockPropsV9ToV8(props: BlockMigrationProps): BlockMigrationProps {
	const { showFooter: _showFooter, showHeaderDivider: _showHeaderDivider, ...rest } = props
	return rest
}

/** v7 → v8: the Type body is optional, so ordinary Blocks need no new stored value. */
export function upgradeBlockPropsV7ToV8(props: BlockMigrationProps): BlockMigrationProps {
	return props
}

/** v8 → v7: older validators do not know the Type attribute body. */
export function downgradeBlockPropsV8ToV7(props: BlockMigrationProps): BlockMigrationProps {
	const { attributeSource: _attributeSource, ...rest } = props
	return _attributeSource === undefined ? props : rest
}

/**
 * tldraw's migration sequence invokes each step for its side effect; it does
 * not consume a replacement props object. Keep the exported steps pure for
 * direct testing, then apply their result to the loader-owned record here.
 */
function applyPureMigration(
	props: BlockMigrationProps,
	migration: (props: BlockMigrationProps) => BlockMigrationProps,
): void {
	const next = migration(props)
	if (next === props) return
	for (const key of Object.keys(props)) delete props[key]
	Object.assign(props, next)
}

/**
 * The only adapter from the pure version steps above to tldraw's file loader.
 * tldraw composes the required slice based on the schema version in the file.
 */
export const blockShapeMigrations = createShapePropsMigrationSequence({
	sequence: [{
		id: blockVersions.RestorePyblocksUi,
		up: (props) => applyPureMigration(props, upgradeBlockPropsV0ToV1),
		down: (props) => applyPureMigration(props, downgradeBlockPropsV1ToV0),
	}, {
		id: blockVersions.PortLayoutStyle,
		up: (props) => applyPureMigration(props, upgradeBlockPropsV1ToV2),
		// The v1 validator accepted a present portLayout, so no data is removed.
		down: 'none',
	}, {
		id: blockVersions.PortRows,
		up: (props) => applyPureMigration(props, upgradeBlockPropsV2ToV3),
		// Explicit rows cannot be represented faithfully as the old marker grammar.
		down: 'none',
	}, {
		id: blockVersions.ValueView,
		up: (props) => applyPureMigration(props, upgradeBlockPropsV3ToV4),
		down: (props) => applyPureMigration(props, downgradeBlockPropsV4ToV3),
	}, {
		id: blockVersions.DiffState,
		up: (props) => applyPureMigration(props, upgradeBlockPropsV4ToV5),
		down: (props) => applyPureMigration(props, downgradeBlockPropsV5ToV4),
	}, {
		id: blockVersions.FieldDiffs,
		up: (props) => applyPureMigration(props, upgradeBlockPropsV5ToV6),
		down: (props) => applyPureMigration(props, downgradeBlockPropsV6ToV5),
	}, {
		id: blockVersions.SemanticRolesAndStockConfig,
		up: (props) => applyPureMigration(props, upgradeBlockPropsV6ToV7),
		down: (props) => applyPureMigration(props, downgradeBlockPropsV7ToV6),
	}, {
		id: blockVersions.TypeAttributes,
		up: (props) => applyPureMigration(props, upgradeBlockPropsV7ToV8),
		down: (props) => applyPureMigration(props, downgradeBlockPropsV8ToV7),
	}, {
		id: blockVersions.BlockChrome,
		up: (props) => applyPureMigration(props, upgradeBlockPropsV8ToV9),
		down: (props) => applyPureMigration(props, downgradeBlockPropsV9ToV8),
	}, {
		id: blockVersions.FoldAndAutoResize,
		up: (props) => applyPureMigration(props, upgradeBlockPropsV9ToV10),
		down: (props) => applyPureMigration(props, downgradeBlockPropsV10ToV9),
	}, {
		id: blockVersions.MemberLayout,
		up: (props) => applyPureMigration(props, upgradeBlockPropsV10ToV11),
		down: (props) => applyPureMigration(props, downgradeBlockPropsV11ToV10),
	}, {
		id: blockVersions.InsetBackground,
		up: (props) => applyPureMigration(props, upgradeBlockPropsV11ToV12),
		down: (props) => applyPureMigration(props, downgradeBlockPropsV12ToV11),
	}, {
		id: blockVersions.AssetIcon,
		up: (props) => applyPureMigration(props, upgradeBlockPropsV12ToV13),
		down: (props) => applyPureMigration(props, downgradeBlockPropsV13ToV12),
	}],
})

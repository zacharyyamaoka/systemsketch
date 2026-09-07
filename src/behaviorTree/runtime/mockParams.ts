/**
 * Authored per-skill mock parameters — where they live and how they change.
 *
 * WHY the document's `<TreeNodesModel>` entry, not shape props or app state:
 * a skill exists exactly once per document, independent of every occurrence,
 * and that registry is what the Behaviors panel and the inspector Library are
 * already derived from. Writing the mock profile there gives Zach's ask for
 * free — "when you make new trees using the same nodes, you have a sense of
 * what you can do" — every tree (and subtree) of the document reads one
 * profile per skill, it travels with the board, and editing it is one undoable
 * XML write like every other semantic edit. Runtime status, by contrast, never
 * touches the document (`runStore.ts`).
 *
 * The attributes are underscore-prefixed (`_mock_success`, `_mock_duration_ms`)
 * because `_…` is BT.CPP's own reserved namespace — `isReservedAttribute`
 * already keeps them out of the port lists, and BT.CPP tooling ignores them.
 */
import {
	cloneXmlDocument,
	getAttr,
	parseXml,
	removeAttr,
	serializeXml,
	setAttr,
	type BtDocument,
	type BtNode,
	type XmlElement,
} from '../btcppXml'

export interface BtMockParams {
	/** 0–1 chance a completed attempt reports SUCCESS. */
	successChance: number
	/** Expected wall-clock duration of one attempt, in milliseconds. */
	durationMs: number
}

export const MOCK_SUCCESS_ATTR = '_mock_success'
export const MOCK_DURATION_ATTR = '_mock_duration_ms'

/**
 * A fresh tree must run reasonably with zero configuration: skills lean
 * optimistic-but-fallible, conditions are quick checks that mostly hold.
 */
export const DEFAULT_ACTION_MOCK: BtMockParams = { successChance: 0.9, durationMs: 800 }
export const DEFAULT_CONDITION_MOCK: BtMockParams = { successChance: 0.95, durationMs: 120 }

export function defaultMockParams(kind: BtNode['kind']): BtMockParams {
	return kind === 'condition' ? DEFAULT_CONDITION_MOCK : DEFAULT_ACTION_MOCK
}

export function clampSuccessChance(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_ACTION_MOCK.successChance
	return Math.min(1, Math.max(0, value))
}

export function clampDurationMs(value: number): number {
	if (!Number.isFinite(value)) return DEFAULT_ACTION_MOCK.durationMs
	return Math.min(600_000, Math.max(0, Math.round(value)))
}

/* --------------------------------- reading --------------------------------- */

function modelEntries(document: BtDocument): XmlElement[] {
	const entries: XmlElement[] = []
	for (const models of document.xml.root?.children.filter((child) => child.tag === 'TreeNodesModel') ?? []) {
		entries.push(...models.children)
	}
	return entries
}

/** Every skill's declared mock profile, keyed by registration ID. */
export function readMockParamsById(document: BtDocument): Map<string, Partial<BtMockParams>> {
	const byId = new Map<string, Partial<BtMockParams>>()
	for (const entry of modelEntries(document)) {
		const id = getAttr(entry, 'ID')
		if (!id) continue
		const params: Partial<BtMockParams> = {}
		const success = getAttr(entry, MOCK_SUCCESS_ATTR)
		if (success !== undefined) params.successChance = clampSuccessChance(Number(success))
		const duration = getAttr(entry, MOCK_DURATION_ATTR)
		if (duration !== undefined) params.durationMs = clampDurationMs(Number(duration))
		if (Object.keys(params).length > 0) byId.set(id, params)
	}
	return byId
}

/** The profile the simulator uses for one leaf: declared values over defaults. */
export function resolveMockParams(
	declared: Map<string, Partial<BtMockParams>>,
	node: Pick<BtNode, 'id' | 'kind'>,
): BtMockParams {
	const base = defaultMockParams(node.kind)
	const overlay = declared.get(node.id)
	return {
		successChance: overlay?.successChance ?? base.successChance,
		durationMs: overlay?.durationMs ?? base.durationMs,
	}
}

/* --------------------------------- writing --------------------------------- */

export type MockParamsEditResult = { ok: true; xml: string } | { ok: false; reason: string }

function findOrCreateEntry(root: XmlElement, skillId: string, kind: BtNode['kind']): XmlElement {
	for (const models of root.children.filter((child) => child.tag === 'TreeNodesModel')) {
		for (const entry of models.children) {
			if (getAttr(entry, 'ID') === skillId) return entry
		}
	}
	let models = root.children.find((child) => child.tag === 'TreeNodesModel')
	if (!models) {
		models = { tag: 'TreeNodesModel', attrs: [], children: [], text: '' }
		root.children.push(models)
	}
	// A skill used by the XML but never declared gets a declaration the moment
	// someone authors its mock profile — the same entry a port declaration
	// would create, so the Behaviors panel picks it up too.
	const entry: XmlElement = {
		tag: kind === 'condition' ? 'Condition' : 'Action',
		attrs: [['ID', skillId]],
		children: [],
		text: '',
	}
	models.children.push(entry)
	return entry
}

/**
 * Write one skill's mock profile into the document. `null` for a field clears
 * it back to the default (the attribute is removed, not written as a value).
 */
export function setMockParamsInXml(
	source: string,
	skillId: string,
	kind: BtNode['kind'],
	params: { successChance?: number | null; durationMs?: number | null },
): MockParamsEditResult {
	let xml
	try {
		xml = cloneXmlDocument(parseXml(source))
	} catch (error) {
		return { ok: false, reason: String(error) }
	}
	if (!xml.root) return { ok: false, reason: 'No BT.CPP document' }
	const entry = findOrCreateEntry(xml.root, skillId, kind)
	if (params.successChance !== undefined) {
		if (params.successChance === null) removeAttr(entry, MOCK_SUCCESS_ATTR)
		else setAttr(entry, MOCK_SUCCESS_ATTR, String(clampSuccessChance(params.successChance)))
	}
	if (params.durationMs !== undefined) {
		if (params.durationMs === null) removeAttr(entry, MOCK_DURATION_ATTR)
		else setAttr(entry, MOCK_DURATION_ATTR, String(clampDurationMs(params.durationMs)))
	}
	return { ok: true, xml: serializeXml(xml) }
}

/* --------------------------------- presets --------------------------------- */

export const BT_MOCK_PRESETS = ['nominal', 'flaky', 'chaos'] as const
export type BtMockPreset = (typeof BT_MOCK_PRESETS)[number]

/**
 * WHY presets are bulk WRITERS of the authored values rather than a runtime
 * mode: Zach's model is "each node holds a mock success value … then maybe you
 * can do randomization on top". A preset is a quick way to author many values
 * at once — afterward the per-node values ARE what the preset wrote, visible
 * in the inspector and individually editable, and undo restores the previous
 * profile in one step. Nothing about the run pipeline knows presets exist.
 */
export function presetSuccessChance(preset: BtMockPreset, current: number): number {
	switch (preset) {
		case 'nominal': return 1
		case 'flaky': return Math.max(0.35, Math.round(current * 0.6 * 100) / 100)
		case 'chaos': return 0.6
	}
}

/** The distinct mockable leaves a tree actually uses (declared or not). */
export function mockableLeafIds(document: BtDocument, treeId: string): Array<Pick<BtNode, 'id' | 'kind'>> {
	const tree = document.trees.find((candidate) => candidate.id === (treeId || document.mainTreeId)) ?? null
	const byId = new Map<string, Pick<BtNode, 'id' | 'kind'>>()
	const visit = (nodes: BtNode[], depth: number) => {
		if (depth > 16) return
		for (const node of nodes) {
			if ((node.kind === 'action' || node.kind === 'condition') && !node.model?.builtin) {
				if (!byId.has(node.id)) byId.set(node.id, { id: node.id, kind: node.kind })
			}
			if (node.kind === 'subtree' && node.subtreeId) {
				const subtree = document.trees.find((candidate) => candidate.id === node.subtreeId)
				if (subtree?.root) visit([subtree.root], depth + 1)
			}
			visit(node.children, depth)
		}
	}
	if (tree?.root) visit([tree.root], 0)
	return [...byId.values()]
}

/** Apply a preset to every mockable leaf the tree uses; one XML write. */
export function applyMockPresetToXml(source: string, document: BtDocument, treeId: string, preset: BtMockPreset): MockParamsEditResult {
	const declared = readMockParamsById(document)
	let xml = source
	for (const leaf of mockableLeafIds(document, treeId)) {
		const current = resolveMockParams(declared, leaf)
		const next = presetSuccessChance(preset, current.successChance)
		const result = setMockParamsInXml(xml, leaf.id, leaf.kind, { successChance: next })
		if (!result.ok) return result
		xml = result.xml
	}
	return { ok: true, xml }
}

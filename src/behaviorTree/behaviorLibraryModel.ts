/**
 * What the Behaviors panel lists, derived from the region's own document.
 *
 * Two halves, and the split is the point. **Skills, Conditions and Behavior
 * Trees are facts about THIS document** — a `TreeNodesModel` declaration, or a
 * node the XML actually uses — so they are read off
 * `projectBehaviorTree(props).document` and change as the board changes.
 * **Controls and Decorators are facts about BT.CPP** and come straight from
 * `BT_BUILTIN_MODELS`; a hand-curated list here would silently disagree with
 * the parser the moment either side gained a node, so the catalog is derived
 * and only the ORDER is opinionated.
 *
 * Pure: no React, no tldraw, no DOM, so the panel, a search modal and a test
 * can all ask the same question and get the same answer.
 */
import type { BtIconSubject } from './btNodeIcons'
import {
	BT_BUILTIN_MODELS,
	type BtDocument,
	type BtInsertTemplate,
	type BtNodeModel,
} from './btcppXml'

export const BEHAVIOR_LIBRARY_SECTIONS = [
	'Recents',
	'Skills',
	'Conditions',
	'Behavior Trees',
	'Controls',
	'Decorators',
] as const
export type BehaviorLibrarySection = (typeof BEHAVIOR_LIBRARY_SECTIONS)[number]

export interface BehaviorLibraryItem {
	/**
	 * Stable across documents, and namespaced by where it came from, so a
	 * recents entry survives a board that no longer declares it.
	 */
	id: string
	label: string
	/** The one-line right-hand caption: BT.CPP's own description, or the kind. */
	detail: string
	section: BehaviorLibrarySection
	template: BtInsertTemplate
	/** What `BtNodeIcon` draws for this row. */
	icon: BtIconSubject
	searchTerms: string[]
}

/**
 * The four everyone reaches for first. BT.CPP registers sixteen controls, and
 * an alphabetical list buries `Sequence` under `ManualSelector` and six
 * `Switch`es — this is the only editorial claim in the file.
 */
const CONTROL_RANK: readonly string[] = ['Sequence', 'Fallback', 'Parallel', 'IfThenElse']
/** The same, for decorators: retry and repeat carry most real trees. */
const DECORATOR_RANK: readonly string[] = ['RetryUntilSuccessful', 'Repeat', 'Inverter', 'Timeout']

/** `SubTree` is not a control you pick — it is the Behavior Trees section. */
const EXCLUDED_BUILTIN_IDS = new Set(['SubTree'])

function rankOf(id: string, rank: readonly string[]): number {
	const index = rank.indexOf(id)
	return index === -1 ? rank.length : index
}

function splitCamel(id: string): string {
	return id.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
}

function modelItem(model: BtNodeModel, section: BehaviorLibrarySection, detail: string): BehaviorLibraryItem {
	return {
		id: `model:${model.id}`,
		label: model.id,
		detail,
		section,
		template: { id: model.id, kind: model.kind },
		icon: { id: model.id, kind: model.kind, controlKind: model.controlKind ?? null },
		searchTerms: [splitCamel(model.id), model.description, ...model.ports.map((port) => port.name)].filter(Boolean),
	}
}

/**
 * Built-ins unioned with anything this document declares for the same kind.
 * A board that registers its own `Control` shows it beside BT.CPP's, and a
 * document that redeclares `Sequence` does not produce two rows.
 */
function controlModels(document: BtDocument | null, kind: 'control' | 'decorator'): BtNodeModel[] {
	const byId = new Map<string, BtNodeModel>()
	for (const model of BT_BUILTIN_MODELS) {
		if (model.kind === kind && !EXCLUDED_BUILTIN_IDS.has(model.id)) byId.set(model.id, model)
	}
	for (const model of document?.models ?? []) {
		if (model.kind === kind && !EXCLUDED_BUILTIN_IDS.has(model.id) && !byId.has(model.id)) byId.set(model.id, model)
	}
	const rank = kind === 'control' ? CONTROL_RANK : DECORATOR_RANK
	return [...byId.values()].sort((a, b) => {
		const byRank = rankOf(a.id, rank) - rankOf(b.id, rank)
		return byRank !== 0 ? byRank : a.id.localeCompare(b.id)
	})
}

/**
 * Skills and Conditions are the document's own vocabulary: a declared
 * `TreeNodesModel` entry, or a node the XML uses that BT.CPP does not own.
 * Both arrive from the parser as `builtin: false`, which is exactly the test.
 */
function documentLeafModels(document: BtDocument, kind: 'action' | 'condition'): BtNodeModel[] {
	return document.models
		.filter((model) => !model.builtin && model.kind === kind)
		.sort((a, b) => a.id.localeCompare(b.id))
}

/** The two rows that keep an empty document usable, mirroring the on-canvas menu. */
function draftItems(section: 'Skills' | 'Conditions'): BehaviorLibraryItem[] {
	if (section === 'Skills') {
		return [{
			id: 'new:skill',
			label: 'New skill…',
			detail: 'An action named here',
			section,
			template: { id: 'NewSkill', kind: 'action' },
			icon: { id: 'NewSkill', kind: 'action' },
			searchTerms: ['new', 'action', 'skill'],
		}]
	}
	return [{
		id: 'new:condition',
		label: 'New condition…',
		detail: 'A condition named here',
		section,
		template: { id: 'NewCondition', kind: 'condition' },
		icon: { id: 'NewCondition', kind: 'condition' },
		searchTerms: ['new', 'condition', 'check'],
	}]
}

export interface BehaviorLibraryCatalogOptions {
	/** The tree the region is showing; it is not offered as a SubTree of itself. */
	treeId?: string
}

/**
 * Every row the panel can show, in section order.
 *
 * `document` is nullable on purpose: with no Behavior Tree in play there are
 * still Controls and Decorators to list, because those are BT.CPP's and not
 * the board's. `Recents` is not produced here either — it is a per-person
 * ordering OVER this catalog, resolved at render.
 */
export function behaviorLibraryCatalog(
	document: BtDocument | null,
	options: BehaviorLibraryCatalogOptions = {},
): BehaviorLibraryItem[] {
	const items: BehaviorLibraryItem[] = []
	if (document) {
		for (const model of documentLeafModels(document, 'action')) {
			items.push(modelItem(model, 'Skills', model.description || 'Skill'))
		}
		items.push(...draftItems('Skills'))
		for (const model of documentLeafModels(document, 'condition')) {
			items.push(modelItem(model, 'Conditions', model.description || 'Condition'))
		}
		items.push(...draftItems('Conditions'))

		const current = options.treeId || document.mainTreeId
		for (const tree of document.trees) {
			if (tree.id === current) continue
			const nodeCount = tree.nodes.length
			items.push({
				id: `tree:${tree.id}`,
				label: tree.id,
				detail: `${nodeCount} node${nodeCount === 1 ? '' : 's'}`,
				section: 'Behavior Trees',
				template: { id: tree.id, kind: 'subtree' },
				icon: { id: tree.id, kind: 'subtree' },
				searchTerms: ['subtree', 'tree', tree.id],
			})
		}
	}

	for (const model of controlModels(document, 'control')) {
		items.push(modelItem(model, 'Controls', model.description || 'Control'))
	}
	for (const model of controlModels(document, 'decorator')) {
		items.push(modelItem(model, 'Decorators', model.description || 'Decorator'))
	}
	return items
}

export function filterBehaviorLibraryItems(
	items: readonly BehaviorLibraryItem[],
	query: string,
): BehaviorLibraryItem[] {
	const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
	if (words.length === 0) return [...items]
	return items.filter((item) => {
		const haystack = [item.label, item.section, item.detail, ...item.searchTerms].join(' ').toLocaleLowerCase()
		return words.every((word) => haystack.includes(word))
	})
}

/** The catalog grouped for the panel, empty sections dropped. */
export function behaviorLibrarySections(
	items: readonly BehaviorLibraryItem[],
	recentIds: readonly string[] = [],
): Array<{ name: BehaviorLibrarySection; items: BehaviorLibraryItem[] }> {
	const byId = new Map(items.map((item) => [item.id, item]))
	const sections: Array<{ name: BehaviorLibrarySection; items: BehaviorLibraryItem[] }> = []
	for (const name of BEHAVIOR_LIBRARY_SECTIONS) {
		if (name === 'Recents') {
			// WHY filtered here and not on read: the catalog is document-dependent,
			// so a skill remembered on another board is not garbage — it is simply
			// not offerable right now, and deleting it on read would lose it.
			const resolved = recentIds
				.map((id) => byId.get(id))
				.filter((item): item is BehaviorLibraryItem => Boolean(item))
			if (resolved.length > 0) sections.push({ name, items: resolved })
			continue
		}
		const group = items.filter((item) => item.section === name)
		if (group.length > 0) sections.push({ name, items: group })
	}
	return sections
}

/* --------------------------------- recents --------------------------------- */

export const BEHAVIOR_LIBRARY_RECENTS_KEY = 'systemsketch.behavior-library.recents.v1'
export const BEHAVIOR_LIBRARY_RECENTS_EVENT = 'systemsketch:behavior-library-recents'
export const MAX_BEHAVIOR_LIBRARY_RECENTS = 8

export interface BehaviorLibraryStorage {
	getItem(key: string): string | null
	setItem(key: string, value: string): void
}

function browserStorage(): BehaviorLibraryStorage | undefined {
	try {
		return typeof window === 'undefined' ? undefined : window.localStorage
	} catch {
		return undefined
	}
}

/**
 * Deduplicate and cap, and deliberately DO NOT check the ids against a
 * catalog — unlike the Shapes library, whose catalog is a fixed constant. A
 * behavior catalog belongs to one document, so validating on read would
 * delete every skill that came from a different board the moment this one was
 * opened. `behaviorLibrarySections` drops what cannot be offered instead.
 */
export function normalizeBehaviorLibraryRecentIds(value: unknown): string[] {
	if (!Array.isArray(value)) return []
	const result: string[] = []
	for (const id of value) {
		if (typeof id !== 'string' || id === '' || result.includes(id)) continue
		result.push(id)
		if (result.length === MAX_BEHAVIOR_LIBRARY_RECENTS) break
	}
	return result
}

export function readBehaviorLibraryRecentIds(storage = browserStorage()): string[] {
	if (!storage) return []
	try {
		return normalizeBehaviorLibraryRecentIds(JSON.parse(storage.getItem(BEHAVIOR_LIBRARY_RECENTS_KEY) ?? '[]'))
	} catch {
		return []
	}
}

export function rememberBehaviorLibraryItem(itemId: string, storage = browserStorage()): string[] {
	const next = normalizeBehaviorLibraryRecentIds([itemId, ...readBehaviorLibraryRecentIds(storage)])
	if (storage) {
		try {
			storage.setItem(BEHAVIOR_LIBRARY_RECENTS_KEY, JSON.stringify(next))
		} catch {
			// A blocked storage preference must not block an insertion.
		}
	}
	if (typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent<string[]>(BEHAVIOR_LIBRARY_RECENTS_EVENT, { detail: next }))
	}
	return next
}

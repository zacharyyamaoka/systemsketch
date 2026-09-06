import { describe, expect, it } from 'vitest'

import {
	BEHAVIOR_LIBRARY_RECENTS_KEY,
	MAX_BEHAVIOR_LIBRARY_RECENTS,
	behaviorLibraryCatalog,
	behaviorLibrarySections,
	filterBehaviorLibraryItems,
	normalizeBehaviorLibraryRecentIds,
	planBehaviorInsert,
	readBehaviorLibraryRecentIds,
	rememberBehaviorLibraryItem,
	type BehaviorLibraryStorage,
} from './behaviorLibraryModel'
import { SAMPLE_BEHAVIOR_TREE_XML, parseBehaviorTreeXml } from './btcppXml'

const sample = parseBehaviorTreeXml(SAMPLE_BEHAVIOR_TREE_XML)

function ids(section: string, document = sample) {
	return behaviorLibraryCatalog(document).filter((item) => item.section === section).map((item) => item.id)
}

function fakeStorage(initial: Record<string, string> = {}): BehaviorLibraryStorage & { data: Record<string, string> } {
	const data = { ...initial }
	return {
		data,
		getItem: (key) => data[key] ?? null,
		setItem: (key, value) => { data[key] = value },
	}
}

describe('behaviorLibraryCatalog', () => {
	it('lists BT.CPP controls and decorators without a document at all', () => {
		const items = behaviorLibraryCatalog(null)
		const controls = items.filter((item) => item.section === 'Controls')
		const decorators = items.filter((item) => item.section === 'Decorators')
		expect(controls.length).toBeGreaterThan(8)
		expect(decorators.length).toBeGreaterThan(8)
		// Nothing document-shaped can be offered without a document.
		expect(items.some((item) => item.section === 'Skills')).toBe(false)
		expect(items.some((item) => item.section === 'Behavior Trees')).toBe(false)
	})

	it('ranks the four everyone reaches for ahead of the alphabet', () => {
		const controls = ids('Controls')
		expect(controls.slice(0, 4)).toEqual([
			'model:Sequence',
			'model:Fallback',
			'model:Parallel',
			'model:IfThenElse',
		])
		// The rest are alphabetical, so ManualSelector cannot outrank Sequence.
		expect(controls.indexOf('model:ManualSelector')).toBeGreaterThan(3)
		expect(ids('Decorators').slice(0, 2)).toEqual(['model:RetryUntilSuccessful', 'model:Repeat'])
	})

	it('never offers SubTree as a control — the trees section is the SubTree picker', () => {
		expect(behaviorLibraryCatalog(sample).some((item) => item.id === 'model:SubTree')).toBe(false)
	})

	it('derives Skills and Conditions from the document rather than a curated list', () => {
		const skills = ids('Skills')
		const conditions = ids('Conditions')
		// The sample declares/uses its own action and condition nodes; every one
		// of them reaches the panel because the parser marks it non-builtin.
		expect(skills.length).toBeGreaterThan(1)
		expect(skills).toContain('new:skill')
		expect(conditions).toContain('new:condition')
		for (const model of sample.models) {
			if (model.builtin) continue
			if (model.kind === 'action') expect(skills).toContain(`model:${model.id}`)
			if (model.kind === 'condition') expect(conditions).toContain(`model:${model.id}`)
		}
	})

	it('offers every tree except the one being shown', () => {
		const other = sample.trees.find((tree) => tree.id !== sample.mainTreeId)
		expect(ids('Behavior Trees')).not.toContain(`tree:${sample.mainTreeId}`)
		if (other) {
			expect(ids('Behavior Trees')).toContain(`tree:${other.id}`)
			// Showing that other tree removes it and restores the main one.
			const swapped = behaviorLibraryCatalog(sample, { treeId: other.id })
				.filter((item) => item.section === 'Behavior Trees')
				.map((item) => item.id)
			expect(swapped).not.toContain(`tree:${other.id}`)
			expect(swapped).toContain(`tree:${sample.mainTreeId}`)
		}
	})

	it('gives controls a stroked glyph subject and leaves a Block icon subject', () => {
		const items = behaviorLibraryCatalog(sample)
		const sequence = items.find((item) => item.id === 'model:Sequence')
		expect(sequence?.icon).toMatchObject({ id: 'Sequence', kind: 'control', controlKind: 'sequence' })
		const skill = items.find((item) => item.section === 'Skills' && item.id.startsWith('model:'))
		expect(skill?.icon.kind).toBe('action')
	})
})

describe('filterBehaviorLibraryItems', () => {
	const items = behaviorLibraryCatalog(sample)

	it('matches label, section and description across every word', () => {
		const retry = filterBehaviorLibraryItems(items, 'retry').map((item) => item.id)
		expect(retry).toContain('model:RetryUntilSuccessful')
		expect(retry).not.toContain('model:Sequence')
	})

	it('splits CamelCase so "keep running" finds KeepRunningUntilFailure', () => {
		expect(filterBehaviorLibraryItems(items, 'keep running').map((item) => item.id))
			.toContain('model:KeepRunningUntilFailure')
	})

	it('returns everything for an empty query', () => {
		expect(filterBehaviorLibraryItems(items, '   ')).toHaveLength(items.length)
	})
})

describe('behaviorLibrarySections', () => {
	const items = behaviorLibraryCatalog(sample)

	it('drops empty sections and keeps the declared order', () => {
		const names = behaviorLibrarySections(items).map((section) => section.name)
		expect(names).not.toContain('Recents')
		expect(names.indexOf('Skills')).toBeLessThan(names.indexOf('Controls'))
		expect(names.indexOf('Controls')).toBeLessThan(names.indexOf('Decorators'))
	})

	it('resolves recents against the catalog at RENDER, not on read', () => {
		const sections = behaviorLibrarySections(items, ['model:Sequence', 'model:NotOnThisBoard'])
		const recents = sections.find((section) => section.name === 'Recents')
		expect(recents?.items.map((item) => item.id)).toEqual(['model:Sequence'])
		// The unresolvable id was filtered from the VIEW, never from storage.
		const storage = fakeStorage({
			[BEHAVIOR_LIBRARY_RECENTS_KEY]: JSON.stringify(['model:NotOnThisBoard']),
		})
		expect(readBehaviorLibraryRecentIds(storage)).toEqual(['model:NotOnThisBoard'])
	})

	it('omits Recents entirely when nothing resolves', () => {
		expect(behaviorLibrarySections(items, ['model:Gone']).some((section) => section.name === 'Recents')).toBe(false)
	})
})

describe('behavior library recents', () => {
	it('keeps ids a fixed catalog would have thrown away', () => {
		// The deliberate difference from the Shapes library: its catalog is a
		// constant, so it can validate on read; a behavior catalog belongs to
		// one document, and validating would delete another board's skills.
		expect(normalizeBehaviorLibraryRecentIds(['model:FromAnotherBoard'])).toEqual(['model:FromAnotherBoard'])
	})

	it('deduplicates, caps at eight, and rejects non-strings', () => {
		const many = Array.from({ length: 20 }, (_, index) => `model:N${index}`)
		expect(normalizeBehaviorLibraryRecentIds(many)).toHaveLength(MAX_BEHAVIOR_LIBRARY_RECENTS)
		expect(normalizeBehaviorLibraryRecentIds(['a', 'a', 'b'])).toEqual(['a', 'b'])
		expect(normalizeBehaviorLibraryRecentIds([1, null, '', 'a'])).toEqual(['a'])
		expect(normalizeBehaviorLibraryRecentIds('nope')).toEqual([])
	})

	it('moves a re-used id back to the front', () => {
		const storage = fakeStorage()
		rememberBehaviorLibraryItem('model:A', storage)
		rememberBehaviorLibraryItem('model:B', storage)
		expect(rememberBehaviorLibraryItem('model:A', storage)).toEqual(['model:A', 'model:B'])
		expect(JSON.parse(storage.data[BEHAVIOR_LIBRARY_RECENTS_KEY])).toEqual(['model:A', 'model:B'])
	})

	it('survives unreadable and unwritable storage', () => {
		expect(readBehaviorLibraryRecentIds(fakeStorage({ [BEHAVIOR_LIBRARY_RECENTS_KEY]: '{not json' }))).toEqual([])
		const hostile: BehaviorLibraryStorage = {
			getItem: () => null,
			setItem: () => { throw new Error('blocked') },
		}
		expect(() => rememberBehaviorLibraryItem('model:A', hostile)).not.toThrow()
	})
})

describe('planBehaviorInsert', () => {
	const tree = sample.trees.find((candidate) => candidate.id === sample.mainTreeId)!
	const at = (path: string) => tree.nodes.find((node) => node.path === path)!

	it('only creates a root when there is genuinely no tree', () => {
		expect(planBehaviorInsert(null, null)).toMatchObject({ kind: 'root', parentPath: null, index: 0 })
		expect(planBehaviorInsert({ root: null }, null).describe).toBe('Adds the root node.')
	})

	it('appends under the ROOT when a non-empty tree has no node selected', () => {
		// The bug this replaces: the panel said "Adds the root node." and passed
		// parentPath: null, which insertBehaviorTreeNode refuses outright on a
		// tree that already has a root — so every click was a silent no-op.
		const plan = planBehaviorInsert(tree, null)
		expect(plan.kind).toBe('child')
		if (plan.kind !== 'child') throw new Error('expected a child plan')
		expect(plan.parentPath).toBe(tree.root!.path)
		expect(plan.index).toBe(tree.root!.children.length)
		expect(plan.describe).toBe(`Adds under ${tree.root!.label}.`)
	})

	it('adds under a selected control, at the end of its children', () => {
		const control = tree.nodes.find((node) => node.kind === 'control')!
		const plan = planBehaviorInsert(tree, control)
		expect(plan).toMatchObject({ kind: 'child', parentPath: control.path, index: control.children.length })
	})

	it('adds beside a selected leaf', () => {
		const leaf = tree.nodes.find((node) => node.kind === 'action' && node.children.length === 0)!
		expect(planBehaviorInsert(tree, leaf)).toMatchObject({ kind: 'sibling', path: leaf.path, after: true })
	})

	it('adds beside a decorator that already holds its one child', () => {
		const full = { ...at('0'), kind: 'decorator' as const, children: [at('0')], path: '0.9', label: 'Retry' }
		expect(planBehaviorInsert(tree, full)).toMatchObject({ kind: 'sibling', path: '0.9' })
		const empty = { ...full, children: [] }
		expect(planBehaviorInsert(tree, empty)).toMatchObject({ kind: 'child', parentPath: '0.9', index: 0 })
	})

	it('never plans a root insert for a tree whose root is a lone leaf', () => {
		const leafRoot = { root: { ...at('0'), kind: 'action' as const, children: [], path: '0', label: 'OnlyStep' } }
		const plan = planBehaviorInsert(leafRoot, null)
		expect(plan.kind).toBe('sibling')
		expect(plan.describe).toBe('Adds after OnlyStep.')
	})

	it('says exactly what it will do, for every case', () => {
		for (const selected of [null, ...tree.nodes]) {
			const plan = planBehaviorInsert(tree, selected)
			expect(plan.describe).toMatch(/^Adds (under|after) .+\.$|^Adds the root node\.$/)
			// A non-empty tree must never be told to create a root.
			expect(plan.kind).not.toBe('root')
		}
	})
})

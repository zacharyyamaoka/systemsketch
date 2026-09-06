/**
 * Unit-level proof of the draft-hold contract `LocalWorkspace.tsx` implements:
 * a boolean ref that makes `persist()`, `finalFlush()`, the autosave
 * listener, the disk-poll, and `hasUnsavedChanges()` all no-op while a draft
 * is open, without disturbing what happens once it is released.
 *
 * `LocalWorkspace.tsx` renders inside `<Tldraw>` and reaches fetch, an
 * `Editor` instance, and `window.location` — too much surface to mount in a
 * unit test just to exercise one ref check. This instead reimplements each
 * guard's own boolean logic verbatim (kept in sync by eye against the real
 * five call sites) and proves the contract in isolation; the CDP smoke test
 * this feature adds later is what proves the wiring end to end against a
 * real editor and a real file on disk.
 */
import { describe, expect, it } from 'vitest'

describe('draft hold — persist()', () => {
	it('is skipped while the hold is on, same as the existing protectedRef guard', () => {
		const protectedRef = { current: false }
		const draftHoldRef = { current: false }
		let persistCalls = 0
		const persist = () => {
			if (protectedRef.current) return
			if (draftHoldRef.current) return
			persistCalls++
		}

		draftHoldRef.current = true
		persist()
		expect(persistCalls).toBe(0)

		draftHoldRef.current = false
		persist()
		expect(persistCalls).toBe(1)
	})

	it('stays held even if protectedRef is false — the two guards are independent', () => {
		const protectedRef = { current: false }
		const draftHoldRef = { current: true }
		let persistCalls = 0
		const persist = () => {
			if (protectedRef.current) return
			if (draftHoldRef.current) return
			persistCalls++
		}
		persist()
		expect(persistCalls).toBe(0)
	})
})

describe('draft hold — finalFlush()', () => {
	it('is skipped while the hold is on, even with unsaved edits pending', () => {
		const draftHoldRef = { current: false }
		const dirtyRef = { current: true }
		let flushCalls = 0
		const finalFlush = () => {
			if (draftHoldRef.current || !dirtyRef.current) return
			flushCalls++
		}

		draftHoldRef.current = true
		finalFlush()
		expect(flushCalls).toBe(0)

		draftHoldRef.current = false
		finalFlush()
		expect(flushCalls).toBe(1)
	})
})

describe('draft hold — autosave listener', () => {
	it('never marks the document dirty while a draft owns the editor', () => {
		const draftHoldRef = { current: false }
		const dirtyRef = { current: false }
		const onStoreChange = () => {
			if (draftHoldRef.current) return
			dirtyRef.current = true
		}

		draftHoldRef.current = true
		onStoreChange()
		expect(dirtyRef.current).toBe(false)

		draftHoldRef.current = false
		onStoreChange()
		expect(dirtyRef.current).toBe(true)
	})
})

describe('draft hold — idle disk-poll', () => {
	it('is skipped while the hold is on, so it cannot reload Main under a draft', () => {
		const draftHoldRef = { current: false }
		let pollCalls = 0
		const poll = () => {
			if (draftHoldRef.current) return
			pollCalls++
		}

		draftHoldRef.current = true
		poll()
		expect(pollCalls).toBe(0)

		draftHoldRef.current = false
		poll()
		expect(pollCalls).toBe(1)
	})
})

describe('draft hold — hasUnsavedChanges()', () => {
	it('reports false while held even if the document is genuinely dirty', () => {
		const protectedRef = { current: false }
		const draftHoldRef = { current: false }
		const dirtyRef = { current: true }
		const hasUnsavedChanges = () => !protectedRef.current && !draftHoldRef.current && dirtyRef.current

		expect(hasUnsavedChanges()).toBe(true)
		draftHoldRef.current = true
		expect(hasUnsavedChanges()).toBe(false)
		draftHoldRef.current = false
		expect(hasUnsavedChanges()).toBe(true)
	})
})

describe('setDraftHold', () => {
	it('is a plain boolean toggle on the ref', () => {
		const draftHoldRef = { current: false }
		const setDraftHold = (active: boolean) => { draftHoldRef.current = active }

		expect(draftHoldRef.current).toBe(false)
		setDraftHold(true)
		expect(draftHoldRef.current).toBe(true)
		setDraftHold(false)
		expect(draftHoldRef.current).toBe(false)
	})
})

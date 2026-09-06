import type { Editor } from 'tldraw'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSystemSketchStore } from '../store/createSystemSketchStore'
import { readFreshMainSnapshot, snapshotFromDraftSource } from './draftSnapshot'

function fakeEditor(): Editor {
	const store = createSystemSketchStore()
	return { store } as unknown as Editor
}

function validSource(): string {
	const store = createSystemSketchStore()
	const snapshot = store.getStoreSnapshot()
	return JSON.stringify({
		tldrawFileFormatVersion: 1,
		schema: snapshot.schema,
		records: Object.values(snapshot.store),
	})
}

describe('snapshotFromDraftSource', () => {
	it('parses a valid stored source into a loadable snapshot', () => {
		const snapshot = snapshotFromDraftSource(validSource(), fakeEditor())
		expect(snapshot).not.toBeNull()
		expect(snapshot?.store).toBeDefined()
	})

	it('returns null, not a throw, for garbage input', () => {
		expect(snapshotFromDraftSource('{not json', fakeEditor())).toBeNull()
	})

	it('returns null for a well-formed document tldraw refuses to parse', () => {
		const quarantined = JSON.stringify({ tldrawFileFormatVersion: 1, schema: {}, records: [] })
		expect(snapshotFromDraftSource(quarantined, fakeEditor())).toBeNull()
	})

	it('accepts a document wrapped in the .systemsketch envelope, same as a bare tldraw file', () => {
		const wrapped = JSON.stringify({
			systemSketch: { formatVersion: 1, application: 'SystemSketch' },
			...JSON.parse(validSource()),
		})
		expect(snapshotFromDraftSource(wrapped, fakeEditor())).not.toBeNull()
	})
})

describe('readFreshMainSnapshot', () => {
	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it('reads the path fresh over the network and parses the result', async () => {
		const source = validSource()
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			path: '/boards/plan.systemsketch',
			source,
		}), { status: 200 }))
		vi.stubGlobal('fetch', fetchMock)

		const snapshot = await readFreshMainSnapshot('/boards/plan.systemsketch', fakeEditor())
		expect(snapshot).not.toBeNull()
		expect(fetchMock).toHaveBeenCalledWith(
			'/api/workspace/file?path=%2Fboards%2Fplan.systemsketch',
			expect.anything(),
		)
	})

	it('never re-reads a cached slot — every call hits the network again', async () => {
		const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			path: '/boards/plan.systemsketch',
			source: validSource(),
		}), { status: 200 }))
		vi.stubGlobal('fetch', fetchMock)

		await readFreshMainSnapshot('/boards/plan.systemsketch', fakeEditor())
		await readFreshMainSnapshot('/boards/plan.systemsketch', fakeEditor())
		expect(fetchMock).toHaveBeenCalledTimes(2)
	})

	it('resolves to null, not a rejection, when the file has no content yet', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
			path: '/boards/plan.systemsketch',
			source: null,
		}), { status: 200 })))
		expect(await readFreshMainSnapshot('/boards/plan.systemsketch', fakeEditor())).toBeNull()
	})

	it('resolves to null, not a rejection, on a network/transport failure', async () => {
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')))
		expect(await readFreshMainSnapshot('/boards/plan.systemsketch', fakeEditor())).toBeNull()
	})

	it('resolves to null, not a rejection, when the server 404s the path', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
			error: 'not found',
		}), { status: 404 })))
		expect(await readFreshMainSnapshot('/boards/missing.systemsketch', fakeEditor())).toBeNull()
	})
})

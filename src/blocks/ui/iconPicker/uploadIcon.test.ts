import { describe, expect, it } from 'vitest'

import type { Editor } from 'tldraw'

import {
	ICON_MAX_EDGE_PX,
	ICON_MAX_SVG_BYTES,
	createIconAsset,
	fetchIconFromUrl,
	prepareIconImage,
	scaledIconDimensions,
	type PreparedIconImage,
} from './uploadIcon'

// WHY these tests stop at the SVG path and the pure downscale ratio: the
// raster path also needs `createImageBitmap` and a `<canvas>` 2d context,
// neither of which exist in this project's vitest environment (plain Node —
// see vite.config.ts, no jsdom/happy-dom is configured). That path is
// exercised for real by the CDP journey against the running app instead.
describe('prepareIconImage', () => {
	it('passes an SVG through untouched, reading its declared size', async () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="48" height="32"><rect/></svg>'
		const file = new File([svg], 'mark.svg', { type: 'image/svg+xml' })
		const prepared = await prepareIconImage(file)
		expect(prepared.kind).toBe('svg')
		expect(prepared.file).toBe(file)
		expect(prepared.width).toBe(48)
		expect(prepared.height).toBe(32)
		expect(prepared.originalBytes).toBe(file.size)
		expect(prepared.storedBytes).toBe(file.size)
	})

	it('falls back to viewBox when an SVG has no explicit width/height', async () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 18"><rect/></svg>'
		const file = new File([svg], 'mark.svg', { type: 'image/svg+xml' })
		const prepared = await prepareIconImage(file)
		expect(prepared).toMatchObject({ width: 24, height: 18 })
	})

	it('recognises a bare .svg extension without the image/svg+xml MIME type', async () => {
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect/></svg>'
		const file = new File([svg], 'mark.svg', { type: '' })
		const prepared = await prepareIconImage(file)
		expect(prepared.kind).toBe('svg')
	})

	// RISK: an SVG has no downscale step to shrink it the way a raster does
	// (it passes through byte-for-byte), so without a cap here a pathological
	// vector sailed past every other guard and only surfaced as a stall in
	// `editor.getAssetForExternalContent` — see `saveUpload`'s try/catch in
	// `BlockIconPicker.tsx`.
	it('rejects an SVG over the size cap before ever reading its markup', async () => {
		const oversized = `<svg xmlns="http://www.w3.org/2000/svg">${'<!-- padding -->'.repeat(
			Math.ceil((ICON_MAX_SVG_BYTES + 1024) / '<!-- padding -->'.length),
		)}</svg>`
		expect(oversized.length).toBeGreaterThan(ICON_MAX_SVG_BYTES)
		const file = new File([oversized], 'huge.svg', { type: 'image/svg+xml' })
		await expect(prepareIconImage(file)).rejects.toThrow(/^this SVG is [\d,]+ KB; the limit is 1,024 KB$/)
	})

	it('accepts an SVG right at the size cap', async () => {
		const wrapper = (padding: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><!--${padding}--></svg>`
		const padding = 'x'.repeat(ICON_MAX_SVG_BYTES - wrapper('').length)
		const svg = wrapper(padding)
		expect(svg.length).toBe(ICON_MAX_SVG_BYTES)
		const file = new File([svg], 'exact.svg', { type: 'image/svg+xml' })
		await expect(prepareIconImage(file)).resolves.toMatchObject({ kind: 'svg' })
	})
})

// RISK: `saveUpload` in `BlockIconPicker.tsx` used to call
// `editor.getAssetForExternalContent` with no try/catch, so a rejection
// (an SVG tldraw's sanitiser reduces to nothing, a file over tldraw's own
// upload cap, an unaccepted MIME) left the Save button reading "Saving…"
// forever. This proves the promise `createIconAsset` hands back really does
// reject rather than resolving to `undefined` — the shape `saveUpload`'s
// try/catch has to actually handle, not just a type it declares.
describe('createIconAsset', () => {
	const prepared: PreparedIconImage = {
		file: new File(['x'], 'icon.png', { type: 'image/png' }),
		width: 16,
		height: 16,
		originalWidth: 16,
		originalHeight: 16,
		originalBytes: 1,
		storedBytes: 1,
		kind: 'png',
	}

	it('propagates a rejection from getAssetForExternalContent instead of swallowing it', async () => {
		const fakeEditor = {
			getAssetForExternalContent: async () => {
				throw new Error('sanitiser reduced this SVG to nothing')
			},
			createAssets: () => {
				throw new Error('should not be reached when getAssetForExternalContent rejects')
			},
		} as unknown as Editor
		await expect(createIconAsset(fakeEditor, prepared)).rejects.toThrow('sanitiser reduced this SVG to nothing')
	})

	it('returns null, not a rejection, when the handler declines the file', async () => {
		const fakeEditor = {
			getAssetForExternalContent: async () => undefined,
			createAssets: () => {
				throw new Error('should not be reached when the handler declines the file')
			},
		} as unknown as Editor
		await expect(createIconAsset(fakeEditor, prepared)).resolves.toBeNull()
	})
})

describe('scaledIconDimensions', () => {
	it('leaves an image already within the ceiling unscaled', () => {
		expect(scaledIconDimensions(120, 80)).toEqual({ width: 120, height: 80 })
	})

	it('downscales so the longest edge lands exactly on the ceiling', () => {
		const result = scaledIconDimensions(1000, 634)
		expect(Math.max(result.width, result.height)).toBe(ICON_MAX_EDGE_PX)
		expect(result).toEqual({ width: 256, height: 162 })
	})

	it('scales a portrait image by its tall edge', () => {
		expect(scaledIconDimensions(300, 1200)).toEqual({ width: 64, height: 256 })
	})

	it('never rounds a dimension down to zero', () => {
		expect(scaledIconDimensions(1, 10000)).toEqual({ width: 1, height: 256 })
	})
})

describe('fetchIconFromUrl', () => {
	it('names the file from the URL and preserves the response content type', async () => {
		const bytes = new Uint8Array([1, 2, 3, 4])
		const originalFetch = globalThis.fetch
		globalThis.fetch = (async () =>
			new Response(bytes, { status: 200, headers: { 'Content-Type': 'image/png' } })) as typeof fetch
		try {
			const file = await fetchIconFromUrl('https://example.com/logos/mark.png?x=1')
			expect(file.name).toBe('mark.png')
			expect(file.type).toBe('image/png')
			expect(file.size).toBe(bytes.length)
		} finally {
			globalThis.fetch = originalFetch
		}
	})

	it('surfaces the host error message on a failed fetch', async () => {
		const originalFetch = globalThis.fetch
		globalThis.fetch = (async () =>
			new Response(JSON.stringify({ error: 'not an image' }), {
				status: 400,
				headers: { 'Content-Type': 'application/json' },
			})) as typeof fetch
		try {
			await expect(fetchIconFromUrl('https://example.com/not-an-image')).rejects.toThrow('not an image')
		} finally {
			globalThis.fetch = originalFetch
		}
	})
})

/**
 * The Upload tab's pipeline: turn whatever a person hands the picker (a file
 * input, a drop, a paste, or a pasted URL) into a small, self-contained
 * tldraw image asset a Block can carry as its icon.
 *
 * WHY downscale before tldraw ever sees the file: `Editor.getAssetForExternalContent`
 * stores whatever bytes it is given, and the store's asset records are base64
 * inline in the `.systemsketch` file (see `iconRef.ts`'s file-stays-self-contained
 * note). A phone screenshot dropped in here would otherwise sit at full
 * resolution forever for a glyph rendered at 16-40px.
 */
import type { Editor, TLAsset, TLAssetId } from 'tldraw'

/** The longest edge a raster icon is allowed to keep. SVGs pass through unscaled. */
export const ICON_MAX_EDGE_PX = 256

// WHY a size cap on SVGs when rasters are already bounded by ICON_MAX_EDGE_PX:
// an SVG passes through byte-for-byte (see prepareIconImage below), so there
// is no downscale step to shrink a pathological file the way there is for a
// raster. Without a ceiling here, a multi-megabyte vector (embedded raster
// data, thousands of paths) sails past every other guard and only surfaces
// as a stall in `editor.getAssetForExternalContent` — see the SPEC-BREAKING
// finding on saveUpload's missing try/catch.
export const ICON_MAX_SVG_BYTES = 1024 * 1024

export interface PreparedIconImage {
	file: File
	/** The stored (post-downscale) size — an SVG's is its own declared size. */
	width: number
	height: number
	/** The source raster's size before downscaling; equal to `width`/`height` for an SVG. */
	originalWidth: number
	originalHeight: number
	originalBytes: number
	storedBytes: number
	kind: 'svg' | 'png'
}

/**
 * The downscale math on its own, with no `createImageBitmap`/canvas
 * dependency — jsdom (and plain Node) has neither, so this is the seam a
 * vitest exercises directly rather than skipping the ratio math entirely.
 */
export function scaledIconDimensions(width: number, height: number): { width: number; height: number } {
	const scale = Math.min(1, ICON_MAX_EDGE_PX / Math.max(width, height))
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	}
}

/**
 * Shared with `BlockIconPicker`'s preview meta line and this module's own
 * error messages, so a size only ever gets formatted one way.
 *
 * WHY a "N B" rung below 1 KB: `Math.max(1, Math.round(bytes / 1024))` used
 * to floor everything under 1 KB to "1 KB" — true for nothing, since an SVG
 * that small genuinely is a handful of bytes, and the old line also claimed
 * that count as the *stored* size for an SVG tldraw hadn't sanitised yet.
 * See `describeUpload`'s own WHY for the second half of that fix.
 */
export function formatIconBytes(bytes: number): string {
	if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
	if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
	return `${Math.max(0, Math.round(bytes))} B`
}

function isSvg(file: File): boolean {
	return file.type === 'image/svg+xml' || /\.svg$/i.test(file.name)
}

/** An SVG's own `width`/`height` (or `viewBox`), when it declares one; else a 1:1 guess. */
function svgDimensions(source: string): { width: number; height: number } {
	const width = Number(/width="([\d.]+)"/.exec(source)?.[1])
	const height = Number(/height="([\d.]+)"/.exec(source)?.[1])
	if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
		return { width, height }
	}
	const viewBox = /viewBox="[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/.exec(source)
	if (viewBox) {
		const vbWidth = Number(viewBox[1])
		const vbHeight = Number(viewBox[2])
		if (vbWidth > 0 && vbHeight > 0) return { width: vbWidth, height: vbHeight }
	}
	return { width: ICON_MAX_EDGE_PX, height: ICON_MAX_EDGE_PX }
}

/**
 * SVG passes through untouched — it is already vector and already small.
 * Any raster is decoded, downscaled so its longest edge is at most
 * `ICON_MAX_EDGE_PX`, and re-encoded to PNG so a picked JPEG/WEBP/HEIC all
 * land on the one format `BlockIconRefGlyph`'s `<img>` has to trust.
 */
export async function prepareIconImage(file: File): Promise<PreparedIconImage> {
	const originalBytes = file.size
	if (isSvg(file)) {
		if (originalBytes > ICON_MAX_SVG_BYTES) {
			// WHY exact KB here and not formatIconBytes' MB rounding: MB at
			// one decimal collapses anything from ~1,000 KB to ~1,098 KB down
			// to "1.0 MB" — a 1,075 KB file reads back as "this SVG is 1.0 MB
			// — the largest an icon can be is 1.0 MB", which looks like the
			// check is broken. KB is fine-grained enough that the file's
			// size and the limit are never printed the same when they
			// differ.
			const fileKb = Math.round(originalBytes / 1024).toLocaleString()
			const limitKb = Math.round(ICON_MAX_SVG_BYTES / 1024).toLocaleString()
			throw new Error(`this SVG is ${fileKb} KB; the limit is ${limitKb} KB`)
		}
		const text = await file.text()
		const { width, height } = svgDimensions(text)
		return {
			file,
			width,
			height,
			originalWidth: width,
			originalHeight: height,
			originalBytes,
			storedBytes: originalBytes,
			kind: 'svg',
		}
	}

	const bitmap = await createImageBitmap(file)
	try {
		const { width, height } = scaledIconDimensions(bitmap.width, bitmap.height)
		const canvas = document.createElement('canvas')
		canvas.width = width
		canvas.height = height
		const context = canvas.getContext('2d')
		if (!context) throw new Error('could not get a 2d canvas context to downscale the image')
		context.drawImage(bitmap, 0, 0, width, height)
		const blob: Blob = await new Promise((resolve, reject) => {
			canvas.toBlob((result) => {
				if (result) resolve(result)
				else reject(new Error('canvas.toBlob produced no image'))
			}, 'image/png')
		})
		const scaledFile = new File([blob], renamedToPng(file.name), { type: 'image/png' })
		return {
			file: scaledFile,
			width,
			height,
			originalWidth: bitmap.width,
			originalHeight: bitmap.height,
			originalBytes,
			storedBytes: blob.size,
			kind: 'png',
		}
	} finally {
		bitmap.close()
	}
}

function renamedToPng(name: string): string {
	const base = name.replace(/\.[^./\\]+$/, '')
	return `${base || 'icon'}.png`
}

/**
 * Builds the tldraw image asset through the editor's own external-content
 * path (`getAssetForExternalContent` + `createAssets`) rather than hand-
 * assembling a `TLImageAsset` record, so an icon asset gets whatever bounds
 * and metadata handling tldraw's own image pipeline gives any other pasted
 * image. Returns null when the handler declines the file (e.g. an
 * unrecognised type) — the caller shows that as an upload failure.
 */
export async function createIconAsset(editor: Editor, prepared: PreparedIconImage): Promise<TLAssetId | null> {
	const asset: TLAsset | undefined = await editor.getAssetForExternalContent({
		type: 'file',
		file: prepared.file,
	})
	if (!asset) return null
	editor.createAssets([asset])
	return asset.id
}

export class IconFetchError extends Error {
	readonly status: number

	constructor(message: string, status: number) {
		super(message)
		this.name = 'IconFetchError'
		this.status = status
	}
}

/**
 * Fetches a pasted/typed image URL through the local Python host
 * (`POST /api/icon/fetch` in `scripts/server.py`) instead of `fetch(url)`
 * directly from the browser: a cross-origin image loaded straight into an
 * `<img>`/canvas taints the canvas, so `prepareIconImage`'s `toBlob` step
 * would silently fail on exactly the images people paste links to.
 */
export async function fetchIconFromUrl(url: string): Promise<File> {
	const response = await fetch('/api/icon/fetch', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ url }),
	})
	if (!response.ok) {
		let message = `request failed (${response.status})`
		try {
			const payload = (await response.json()) as { error?: string }
			if (typeof payload.error === 'string') message = payload.error
		} catch {
			// non-JSON error body; keep the generic message
		}
		throw new IconFetchError(message, response.status)
	}
	const contentType = response.headers.get('Content-Type') ?? 'application/octet-stream'
	const bytes = await response.arrayBuffer()
	const name = nameFromUrl(url, contentType)
	return new File([bytes], name, { type: contentType })
}

function nameFromUrl(url: string, contentType: string): string {
	try {
		const pathname = new URL(url).pathname
		const last = pathname.split('/').filter(Boolean).pop()
		if (last) return last
	} catch {
		// fall through to a synthesized name
	}
	const extension = contentType === 'image/svg+xml' ? 'svg' : contentType.split('/')[1] || 'png'
	return `icon.${extension}`
}

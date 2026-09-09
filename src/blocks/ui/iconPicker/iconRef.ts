import type { TLAssetId } from 'tldraw'

/**
 * What a Block's icon IS, decoded from the two props that store it.
 *
 * `icon` is the historical string prop ('' or a curated lucide-react export
 * name such as 'SquareFunction'); it now also carries `emoji:<glyph>` and the
 * marker `asset`. `assetId` is a separate prop, and it is named exactly
 * `assetId` on purpose.
 *
 * WHY `assetId` and not `iconAssetId`: tldraw's copy / export scan
 * (`Editor.getContentFromCurrentPage`) only carries an asset record along with
 * a shape when the prop is literally called `assetId`. A prettier name would
 * paste a Block whose image silently never arrives.
 *
 * WHY the `asset` marker in `icon` as well: an older build reads only `icon`,
 * and unknown names render as no decoration, so a board with uploaded icons
 * stays loadable there instead of drawing a stale Lucide glyph.
 */
export type BlockIconRef =
	| { kind: 'none' }
	| { kind: 'lucide'; name: string }
	| { kind: 'emoji'; char: string }
	| { kind: 'asset'; assetId: TLAssetId }

export const EMOJI_ICON_PREFIX = 'emoji:'
export const ASSET_ICON_MARKER = 'asset'

export function decodeBlockIcon(
	icon: string | undefined,
	assetId: TLAssetId | null | undefined,
): BlockIconRef {
	if (assetId) return { kind: 'asset', assetId }
	const value = icon ?? ''
	if (value === '' || value === ASSET_ICON_MARKER) return { kind: 'none' }
	if (value.startsWith(EMOJI_ICON_PREFIX)) {
		const char = value.slice(EMOJI_ICON_PREFIX.length)
		return char ? { kind: 'emoji', char } : { kind: 'none' }
	}
	return { kind: 'lucide', name: value }
}

export function encodeBlockIcon(ref: BlockIconRef): { icon: string; assetId: TLAssetId | null } {
	switch (ref.kind) {
		case 'none':
			return { icon: '', assetId: null }
		case 'lucide':
			return { icon: ref.name, assetId: null }
		case 'emoji':
			return { icon: EMOJI_ICON_PREFIX + ref.char, assetId: null }
		case 'asset':
			return { icon: ASSET_ICON_MARKER, assetId: ref.assetId }
	}
}

export function sameBlockIcon(a: BlockIconRef, b: BlockIconRef): boolean {
	if (a.kind !== b.kind) return false
	switch (a.kind) {
		case 'none':
			return true
		case 'lucide':
			return a.name === (b as typeof a).name
		case 'emoji':
			return a.char === (b as typeof a).char
		case 'asset':
			return a.assetId === (b as typeof a).assetId
	}
}

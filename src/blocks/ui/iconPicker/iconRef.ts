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
 * WHY the `asset` marker in `icon` as well: an older build's validator
 * throws `Unexpected property` on any record carrying an `assetId` key at
 * all, so a board with an uploaded icon is never loadable there regardless
 * of what `icon` says — that incompatibility is inherent, not something a
 * migration can bridge, since the previous build has no such prop to
 * receive it. `assetId` is written only for an actual upload, and never in
 * defaults, so every OTHER board stays loadable on the previous build same
 * as always. The `asset` marker just keeps a name-only reader (one still
 * running with no `assetId` prop declared) from drawing a stale Lucide
 * glyph once the upload it names is gone.
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

/**
 * `assetId: undefined`, not `null`, for every non-upload kind — see the
 * class doc above. A caller that spreads this straight into a props patch
 * (as `BlockInspector.tsx` and `BlockInlineEditor.tsx` do) still produces an
 * object with an own `assetId` key set to `undefined`; `patchBlockDetailsProps`
 * in `commands/blockCommands.ts` is the seam that deletes it, since that is
 * the only place already merging a full props object before it reaches the
 * store.
 */
export function encodeBlockIcon(ref: BlockIconRef): { icon: string; assetId: TLAssetId | undefined } {
	switch (ref.kind) {
		case 'none':
			return { icon: '', assetId: undefined }
		case 'lucide':
			return { icon: ref.name, assetId: undefined }
		case 'emoji':
			return { icon: EMOJI_ICON_PREFIX + ref.char, assetId: undefined }
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

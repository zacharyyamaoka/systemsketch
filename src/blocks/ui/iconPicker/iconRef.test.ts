import { describe, expect, it } from 'vitest'
import type { TLAssetId } from 'tldraw'

import {
	ASSET_ICON_MARKER,
	EMOJI_ICON_PREFIX,
	decodeBlockIcon,
	encodeBlockIcon,
	sameBlockIcon,
	type BlockIconRef,
} from './iconRef'

const ASSET_ID = 'asset:test1' as TLAssetId

describe('BlockIconRef encoding', () => {
	it('round-trips every kind through encode then decode', () => {
		const refs: BlockIconRef[] = [
			{ kind: 'none' },
			{ kind: 'lucide', name: 'SquareFunction' },
			{ kind: 'emoji', char: '🔥' },
			{ kind: 'asset', assetId: ASSET_ID },
		]
		for (const ref of refs) {
			const encoded = encodeBlockIcon(ref)
			const decoded = decodeBlockIcon(encoded.icon, encoded.assetId)
			expect(sameBlockIcon(decoded, ref)).toBe(true)
		}
	})

	it('lets a live assetId win over the icon string, even a stale Lucide name', () => {
		expect(decodeBlockIcon('SquareFunction', ASSET_ID)).toEqual({ kind: 'asset', assetId: ASSET_ID })
	})

	it('treats an empty-glyph emoji encoding as none', () => {
		expect(decodeBlockIcon(EMOJI_ICON_PREFIX, undefined)).toEqual({ kind: 'none' })
	})

	it('treats a legacy bare curated name as a lucide ref', () => {
		expect(decodeBlockIcon('SquareFunction', undefined)).toEqual({ kind: 'lucide', name: 'SquareFunction' })
	})

	it('treats the asset marker with no assetId as none, not an unresolved asset', () => {
		expect(decodeBlockIcon(ASSET_ICON_MARKER, undefined)).toEqual({ kind: 'none' })
		expect(decodeBlockIcon(ASSET_ICON_MARKER, null)).toEqual({ kind: 'none' })
	})

	it('treats an undefined icon prop with no assetId as none', () => {
		expect(decodeBlockIcon(undefined, undefined)).toEqual({ kind: 'none' })
	})

	it('encodes an asset ref with the marker string alongside the real assetId', () => {
		expect(encodeBlockIcon({ kind: 'asset', assetId: ASSET_ID })).toEqual({
			icon: ASSET_ICON_MARKER,
			assetId: ASSET_ID,
		})
	})

	it('encodes every non-upload kind with assetId undefined, never null', () => {
		// SPEC-BREAKING finding 1: an older build's validator rejects any
		// record carrying an `assetId` key at all. `undefined` is what lets
		// a caller that merges this straight into a props patch delete the
		// key (see patchBlockDetailsProps in commands/blockCommands.ts)
		// instead of persisting a `null` the old validator still chokes on.
		expect(encodeBlockIcon({ kind: 'none' }).assetId).toBeUndefined()
		expect(encodeBlockIcon({ kind: 'lucide', name: 'Box' }).assetId).toBeUndefined()
		expect(encodeBlockIcon({ kind: 'emoji', char: '🔥' }).assetId).toBeUndefined()
	})

	it('treats a stored null the same as undefined, for records written before this fix', () => {
		expect(decodeBlockIcon('SquareFunction', null)).toEqual({ kind: 'lucide', name: 'SquareFunction' })
		expect(decodeBlockIcon('SquareFunction', undefined)).toEqual({ kind: 'lucide', name: 'SquareFunction' })
	})
})

describe('sameBlockIcon', () => {
	it('is false across kinds and true only for matching payloads within a kind', () => {
		expect(sameBlockIcon({ kind: 'none' }, { kind: 'lucide', name: 'Box' })).toBe(false)
		expect(sameBlockIcon({ kind: 'lucide', name: 'Box' }, { kind: 'lucide', name: 'Boxes' })).toBe(false)
		expect(sameBlockIcon({ kind: 'lucide', name: 'Box' }, { kind: 'lucide', name: 'Box' })).toBe(true)
		expect(sameBlockIcon({ kind: 'emoji', char: '🔥' }, { kind: 'emoji', char: '🔥' })).toBe(true)
		expect(sameBlockIcon({ kind: 'asset', assetId: ASSET_ID }, { kind: 'asset', assetId: ASSET_ID })).toBe(true)
	})
})

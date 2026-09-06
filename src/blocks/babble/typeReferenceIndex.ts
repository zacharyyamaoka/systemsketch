/**
 * One reactive, board-wide index shared by BOTH babbles: every Type Block's
 * title, and every Type Mapping alias's name, each pointing at the real
 * shape that defines it. Both `typeBabbleShared.ts` (attribute grammar) and
 * `typeMappingShared.ts` (mapping grammar) offer their own plain, non-
 * reactive board scans — calling either directly from a render body reads
 * the board once and never again, so an edit on a sibling Block (a new
 * default value, a renamed alias) stayed invisible until this component
 * happened to re-render for an unrelated reason. Measured live: stuck
 * stale for 10+ seconds, not merely slow. `useValue` fixes that by
 * subscribing to exactly the fields read inside it.
 */
import { useValue, type Editor } from 'tldraw'

import type { BlockShape } from '../blockModel'
import { allBlocks } from '../definitions/definitionLinking'
import { isTypeBlock } from '../typeAttributes'
import { isTypeMappingBlock, parseTypeMappingSource, type TypeAlias } from './typeMappingShared'

export type ResolvedTypeRef =
	| { kind: 'type'; block: BlockShape }
	| { kind: 'mapping'; block: BlockShape; alias: TypeAlias }

export function useTypeReferenceIndex(editor: Editor): ReadonlyMap<string, ResolvedTypeRef> {
	return useValue('type reference index (attributes + mappings)', () => {
		const map = new Map<string, ResolvedTypeRef>()
		for (const block of allBlocks(editor)) {
			// A Type Mapping block IS a Type block underneath (same `blockType`,
			// tagged additionally via meta) — mapping identity has to be tested
			// first, or every mapping would be mistaken for a plain Type record
			// and its aliases would never enter the index.
			// Indirected through a local so TS's `shape is BlockShape` predicate
			// (needed elsewhere for null/undefined narrowing) doesn't narrow
			// `block` to `never` below — it's already a BlockShape here.
			const isMapping: boolean = isTypeMappingBlock(block)
			if (isMapping) {
				const source = block.props.attributeSource ?? ''
				for (const alias of parseTypeMappingSource(source)) {
					if (alias.name && !map.has(alias.name)) map.set(alias.name, { kind: 'mapping', block, alias })
				}
				continue
			}
			if (isTypeBlock(block.props)) {
				// Reading attributeSource here — even though only `block` itself
				// is stored — is what makes this signal recompute when a Type's
				// OWN fields change; the map would otherwise keep pointing at a
				// stale snapshot forever, since only the title read is used to
				// key it.
				void block.props.attributeSource
				const title = block.props.title.trim()
				if (title && !map.has(title)) map.set(title, { kind: 'type', block })
			}
		}
		return map
	}, [editor])
}

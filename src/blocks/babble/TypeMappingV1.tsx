import { useEditor } from 'tldraw'

import type { BlockShape } from '../blockModel'
import { caretOffsetFromPoint, lineStartOffset } from './caretGeometry'
import { SourceCodeEditor } from './SourceCodeEditor'
import { aliasLineSpans } from './sourceHighlight'
import { AliasSpans } from './TypeMappingParts'
import { regionStyle } from './TypeBabbleParts'
import { findExpressionTypeSlot } from './typeNameAutocompleteLogic'
import { findKnownTypeSource, parseTypeMappingSource, resolveTypeToken, type TokenResolution } from './typeMappingShared'
import { useSourceToggleEditor } from './useSourceToggleEditor'

/**
 * V1 — Code Cell. Zach's pick, now built on the SAME shell as the sibling
 * attribute babble's chosen V1 rather than its own bespoke editing state —
 * one `[UI | Source]` toggle mechanic, one `SourceCodeEditor`, one reactive
 * board-scan discipline, shared between "a Type's fields" and "a Type
 * Mapping's aliases." What differs is only what a grammar's own read view
 * looks like: an attribute row can expand in place; a mapping's read view
 * stays the code cell itself, and a recognised token jumps the camera to
 * its real definition instead (there is no natural "field list" to expand
 * into for an alias). A click on an already-selected row drops into Source
 * mode with the cursor at the click, exactly the sibling babble's gesture —
 * NOT a double-click, which this used originally: a native dblclick fights
 * with `caretRangeFromPoint` (Chrome's own word-selection races the caret
 * lookup), which is exactly why the sibling babble moved to select-then-
 * click in the first place. Matching it here fixes the same class of bug
 * rather than leaving two grammars with two different feels.
 */
export function TypeMappingV1({ shape, top, bottom, selected }: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	const editor = useEditor()
	const { source, mode, setMode, draft, setDraft, commit, cancel, enterSourceAt, sourceEditorRef, sourceCaret } =
		useSourceToggleEditor(shape, 'edit type mapping (V1)')
	const aliases = parseTypeMappingSource(source)
	const draftAliases = parseTypeMappingSource(draft)

	const resolve = (typeName: string): TokenResolution => resolveTypeToken(editor, typeName, shape.id)

	const jumpToDefinition = (typeName: string) => {
		const found = findKnownTypeSource(editor, typeName, shape.id)
		if (!found) return
		editor.select(found.block.id)
		editor.zoomToSelection({ animation: { duration: 260 } })
	}

	return (
		<section className="TypeMapping" data-testid="type-mapping-v1" data-selected={selected || undefined} style={regionStyle(top, bottom)}
			onPointerDown={(event) => { if (selected) event.stopPropagation() }}>
			<div className="TypeMapping-heading">
				<span>type aliases</span>
				<div className="TypeMapping-toggle" onPointerDown={(event) => event.stopPropagation()}>
					<button type="button" data-active={mode === 'ui' || undefined} onClick={() => setMode('ui')}>UI</button>
					<button type="button" data-active={mode === 'source' || undefined} onClick={() => setMode('source')}>Source</button>
				</div>
			</div>
			{mode === 'source' ? (
				<SourceCodeEditor
					value={draft}
					highlightLine={(raw, line) => {
						const alias = draftAliases.find((candidate) => candidate.line === line)
						return alias ? aliasLineSpans(alias, resolve) : null
					}}
					onChange={setDraft}
					onBlur={commit}
					onCancel={cancel}
					autoFocus
					testId="type-mapping-v1-source"
					handleRef={sourceEditorRef}
					initialCaret={sourceCaret}
					className="TypeMapping"
					// No `excludeBlockId`: a batched Type Mapping block can
					// legitimately chain its own earlier aliases
					// (`Pairs = Iterable[Pair]`), matching `findKnownTypeSource`'s
					// own documented self-inclusion for this grammar.
					completion={{ editor, findSlot: findExpressionTypeSlot }}
				/>
			) : aliases.length > 0 ? (
				<div
					className="TypeMappingV1-body"
					data-testid="type-mapping-v1-body"
					// Parity with the attribute babble's body: a click that bubbles past
					// every row (blank space below the last alias) lands at the end of
					// the source, the same "no more specific position to honour" fallback.
					onClick={(event) => { if (selected && event.target === event.currentTarget) enterSourceAt(source.length) }}
				>
					{aliases.map((alias) => (
						<div
							key={alias.id}
							className="TypeMappingV1-row"
							onClick={(event) => {
								if (!selected) return
								const withinRow = caretOffsetFromPoint(event.currentTarget, event.clientX, event.clientY)
								const column = Math.min(withinRow, alias.raw.length)
								enterSourceAt(lineStartOffset(source, alias.line) + column)
							}}
						>
							<AliasSpans alias={alias} resolve={resolve} onTokenActivate={jumpToDefinition} />
						</div>
					))}
				</div>
			) : (
				<button type="button" className="TypeMapping-empty" onClick={() => enterSourceAt(0)}>Click to add type aliases</button>
			)}
		</section>
	)
}

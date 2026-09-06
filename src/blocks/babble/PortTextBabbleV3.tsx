import { blockPortLayout, blockPortSections, isEffectPort, type BlockShape } from '../blockModel'
import { attributeLineSpans } from './sourceHighlight'
import { KNOWN_PRIMITIVES } from './typeBabbleShared'
import { useTypeReferenceIndex } from './typeReferenceIndex'
import { keywordsGrammar } from './portTextGrammarKeywords'
import { findTypeSlot } from './typeNameAutocompleteLogic'
import { SourceCodeEditor } from './SourceCodeEditor'
import { usePortTextToggleEditor } from './usePortTextToggleEditor'
import { DiagnosticsBanner, PortTextRow, regionStyle, SectionHeading, SectionRule } from './PortTextBabbleParts'

/**
 * V3 — Section Keywords (`inputs:` / `outputs:`), toggle UI/Source, strict.
 *
 * Leans into the literal reading of Zach's own sketch: `data_in:` is a
 * keyword line, not a port named "data_in" with an empty type. The lane
 * toggles as many times as the author writes the keyword, sharing ONE row
 * counter throughout (see `portTextGrammarKeywords.ts`) — the most flexible
 * of the three grammars, and the strict one: a branch label on the input
 * lane and an out-of-subset default both get a real inline flag instead of
 * silent tolerance.
 *
 * The bullet answers "what's meaningful to encode there" with VISIBLE — the
 * third honest answer, matching the port's own `visible` flag rather than a
 * derived fact like V1's connection or V2's direction.
 *
 * The read view is the one variant whose grouping visibly follows the real
 * `portLayout` style prop: two columns when it is `inline` (the donor's own
 * "Aligned" choice), stacked when it is `offset`.
 */
export function PortTextBabbleV3({ shape, top, bottom, selected }: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	const { editor, mode, setMode, draft, setDraft, commit, cancel, sourceEditorRef, sourceCaret } =
		usePortTextToggleEditor(shape, 'edit ports (text V3)', keywordsGrammar)
	const typeIndex = useTypeReferenceIndex(editor)
	const resolve = (typeName: string) => {
		const name = typeName.trim()
		if (KNOWN_PRIMITIVES.has(name)) return 'primitive' as const
		return typeIndex.has(name) ? ('known' as const) : ('unknown' as const)
	}
	const parsedDraft = keywordsGrammar.parse(draft)
	const layout = blockPortLayout(shape.props)
	// The strict posture's diagnostics banner surfaces BOTH failure kinds: a
	// line the grammar could not place at all, and a line it placed fine but
	// whose default sits outside the restricted literal/call subset — the
	// underline in the editor flags the second kind in place, but the banner
	// is what makes it show up without hunting for the squiggle.
	const diagnostics = [
		...parsedDraft.invalid,
		...parsedDraft.lines
			.filter((line) => line.invalidDefault)
			.map((line) => ({ raw: line.raw, line: line.line, reason: `"${line.value}" is not a restricted literal or keyword call` })),
	].sort((a, b) => a.line - b.line)

	const sections = blockPortSections({ inputs: shape.props.inputs, outputs: shape.props.outputs.filter((p) => !isEffectPort(p)) })

	const inputsColumn = (
		<div className="PortTextBabbleV3-column">
			<SectionHeading>inputs</SectionHeading>
			{sections.header.map((port) => <PortTextRow key={port.id} port={port} bulletFilled={port.visible} bulletTitle={port.visible ? 'visible' : 'hidden'} />)}
			{sections.rows.map((rowSection) => (
				rowSection.inputs.length === 0 ? null : (
					<div key={`in-row-${rowSection.row}`}>
						<SectionRule />
						{rowSection.inputs.map((port) => <PortTextRow key={port.id} port={port} bulletFilled={port.visible} bulletTitle={port.visible ? 'visible' : 'hidden'} />)}
					</div>
				)
			))}
		</div>
	)
	const outputsColumn = (
		<div className="PortTextBabbleV3-column">
			<SectionHeading>outputs</SectionHeading>
			{sections.rows.map((rowSection) => {
				const nonEmpty = rowSection.branches.filter((arm) => arm.outputs.length > 0)
				if (nonEmpty.length === 0) return null
				return (
					<div key={`out-row-${rowSection.row}`}>
						<SectionRule />
						{nonEmpty.map((arm) => (
							<div key={`arm-${arm.branch}`}>
								{arm.branch > 0 ? <div className="PortTextBabble-armBadge">arm {arm.branch}</div> : null}
								{arm.outputs.map((port) => <PortTextRow key={port.id} port={port} bulletFilled={port.visible} bulletTitle={port.visible ? 'visible' : 'hidden'} />)}
							</div>
						))}
					</div>
				)
			})}
		</div>
	)

	return (
		<section className="PortTextBabble" data-testid="port-text-babble-v3" data-selected={selected || undefined} style={regionStyle(top, bottom)}
			onPointerDown={(event) => { if (selected) event.stopPropagation() }}>
			<div className="PortTextBabble-heading">
				<span>ports</span>
				<div className="PortTextBabbleV1-toggle" onPointerDown={(event) => event.stopPropagation()}>
					<button type="button" data-active={mode === 'ui' || undefined} onClick={() => setMode('ui')}>UI</button>
					<button type="button" data-active={mode === 'source' || undefined} onClick={() => setMode('source')}>Source</button>
				</div>
			</div>
			{mode === 'source' ? (
				<>
					<SourceCodeEditor
						value={draft}
						highlightLine={(raw, line) => {
							const parsed = parsedDraft.lines.find((candidate) => candidate.line === line)
							if (!parsed) return null
							const spans = attributeLineSpans(parsed, resolve)
							// Flag the VALUE span in place, rather than appending a second,
							// whole-line range: `RangeSetBuilder` requires ranges added in
							// ascending order, and this one already sits where it needs to.
							if (parsed.invalidDefault) {
								const valueSpan = spans.find((span) => span.className.includes('TypeBabble-value'))
								if (valueSpan) valueSpan.className += ' PortTextBabble-invalidValue'
							}
							return spans
						}}
						onChange={setDraft}
						onBlur={commit}
						onCancel={cancel}
						autoFocus
						testId="port-text-babble-v3-source"
						handleRef={sourceEditorRef}
						initialCaret={sourceCaret}
						className="TypeBabble"
						completion={{ editor, findSlot: findTypeSlot }}
					/>
					<DiagnosticsBanner invalid={diagnostics} />
				</>
			) : (
				<div className={`PortTextBabble-body PortTextBabbleV3-body PortTextBabbleV3-body--${layout}`}>
					{inputsColumn}
					{outputsColumn}
				</div>
			)}
		</section>
	)
}

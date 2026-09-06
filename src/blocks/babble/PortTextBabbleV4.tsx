import { blockPortSections, portBranch, portRow, type BlockPort, type BlockShape } from '../blockModel'
import { attributeLineSpans } from './sourceHighlight'
import { KNOWN_PRIMITIVES } from './typeBabbleShared'
import { useTypeReferenceIndex } from './typeReferenceIndex'
import { twoLaneGrammar } from './portTextGrammarTwoLane'
import { findTypeSlot } from './typeNameAutocompleteLogic'
import { SourceCodeEditor } from './SourceCodeEditor'
import { usePortTextAlwaysLiveEditor } from './usePortTextToggleEditor'
import { applyParsedPortText, type ParsedPortLine } from './portTextShared'
import { DiagnosticsBanner, PortTextRow, regionStyle, SectionRule } from './PortTextBabbleParts'

/**
 * V4 — Always-Live Hybrid. Same two-lane grammar as V1 — this variant's axis
 * is INTERACTION MODEL, not grammar: there is no [UI | Source] toggle at
 * all. The pretty preview and the raw text sit stacked in one pane, always
 * both visible, and the preview re-renders on every keystroke straight from
 * the unsaved DRAFT (not from committed props) — closer to how a live
 * Markdown split-pane editor behaves than to a click-to-reveal source mode.
 * Commit still happens on blur/click-away, same mechanism as the toggle
 * variants, so undo history is not spammed per keystroke.
 */
export function PortTextBabbleV4({ shape, top, bottom, selected }: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	const { editor, draft, setDraft, commit, cancel, sourceEditorRef } =
		usePortTextAlwaysLiveEditor(shape, 'edit ports (text V4)', twoLaneGrammar)
	const typeIndex = useTypeReferenceIndex(editor)
	const resolve = (typeName: string) => {
		const name = typeName.trim()
		if (KNOWN_PRIMITIVES.has(name)) return 'primitive' as const
		return typeIndex.has(name) ? ('known' as const) : ('unknown' as const)
	}
	const parsedDraft = twoLaneGrammar.parse(draft)
	// The preview reflects whatever is in the box RIGHT NOW, reconciled
	// against the last-committed ports purely to keep ids/extra fields
	// stable for the live badges — never written to the shape.
	const livePreviewProps = applyParsedPortText(shape.props, parsedDraft)
	const sections = blockPortSections(livePreviewProps)

	interface UnifiedRow { key: string; port: BlockPort; side: 'inputs' | 'outputs' }
	const unified: UnifiedRow[] = []
	sections.header.forEach((port) => unified.push({ key: port.id, port, side: 'inputs' }))
	sections.rows.forEach((rowSection) => {
		rowSection.inputs.forEach((port) => unified.push({ key: port.id, port, side: 'inputs' }))
		rowSection.branches.forEach((arm) => arm.outputs.forEach((port) => unified.push({ key: port.id, port, side: 'outputs' })))
	})

	return (
		<section className="PortTextBabble PortTextBabbleV4" data-testid="port-text-babble-v4" data-selected={selected || undefined} style={regionStyle(top, bottom)}
			onPointerDown={(event) => { if (selected) event.stopPropagation() }}>
			<div className="PortTextBabble-heading">
				<span>ports</span>
				<span className="PortTextBabbleV4-hint">always live — no toggle</span>
			</div>
			<div className="PortTextBabbleV4-preview" data-testid="port-text-babble-v4-preview">
				{unified.length === 0 ? <div className="PortTextBabble-empty">no ports yet</div> : unified.map((entry, index) => {
					const previous = unified[index - 1]
					const boundary = previous
						&& (portRow(previous.port) !== portRow(entry.port)
							|| (entry.side === 'outputs' && portBranch(previous.port) !== portBranch(entry.port)))
					return (
						<div key={entry.key}>
							{boundary ? <SectionRule /> : null}
							<PortTextRow port={entry.port} bulletFilled={entry.side === 'outputs'} bulletTitle={entry.side === 'outputs' ? 'output' : 'input'} />
						</div>
					)
				})}
			</div>
			<SourceCodeEditor
				value={draft}
				highlightLine={(raw, line) => {
					const parsed = parsedDraft.lines.find((candidate: ParsedPortLine) => candidate.line === line)
					return parsed ? attributeLineSpans(parsed, resolve) : null
				}}
				onChange={setDraft}
				onBlur={commit}
				onCancel={cancel}
				testId="port-text-babble-v4-source"
				handleRef={sourceEditorRef}
				className="TypeBabble"
				completion={{ editor, findSlot: findTypeSlot }}
			/>
			<DiagnosticsBanner invalid={parsedDraft.invalid} />
		</section>
	)
}

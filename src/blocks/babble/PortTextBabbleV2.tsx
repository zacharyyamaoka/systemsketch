import { blockPortSections, isEffectPort, portBranch, portRow, type BlockPort, type BlockShape } from '../blockModel'
import { attributeLineSpans } from './sourceHighlight'
import { KNOWN_PRIMITIVES } from './typeBabbleShared'
import { useTypeReferenceIndex } from './typeReferenceIndex'
import { findSigilTypeSlot, sigilGrammar } from './portTextGrammarSigil'
import { SourceCodeEditor } from './SourceCodeEditor'
import { usePortTextToggleEditor } from './usePortTextToggleEditor'
import { DiagnosticsBanner, PortTextRow, regionStyle, SectionRule } from './PortTextBabbleParts'

interface UnifiedRow {
	key: string
	port: BlockPort
	side: 'inputs' | 'outputs'
}

/**
 * V2 — Single List, inline `>`/`<` sigil, toggle UI/Source.
 *
 * Closest to Zach's own sketch: ONE flat list, not two, at the cost of one
 * glyph per line. Because side lives on the SAME shared divider stream, this
 * is the one variant where an input and output written next to each other
 * really do land in the same row without the author keeping two counts in
 * step (see `portTextGrammarSigil.ts`).
 *
 * The bullet answers "what's meaningful to encode there" with DIRECTION —
 * filled for an output, hollow for an input, matching the sigil right next
 * to it — a second honest answer to the same open question V1 resolves as
 * "connected".
 */
export function PortTextBabbleV2({ shape, top, bottom, selected }: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	const { editor, mode, setMode, draft, setDraft, commit, cancel, sourceEditorRef, sourceCaret } =
		usePortTextToggleEditor(shape, 'edit ports (text V2)', sigilGrammar)
	const typeIndex = useTypeReferenceIndex(editor)
	const resolve = (typeName: string) => {
		const name = typeName.trim()
		if (KNOWN_PRIMITIVES.has(name)) return 'primitive' as const
		return typeIndex.has(name) ? ('known' as const) : ('unknown' as const)
	}
	const parsedDraft = sigilGrammar.parse(draft)

	const sections = blockPortSections({ inputs: shape.props.inputs, outputs: shape.props.outputs.filter((p) => !isEffectPort(p)) })
	const unified: UnifiedRow[] = []
	sections.header.forEach((port) => unified.push({ key: port.id, port, side: 'inputs' }))
	sections.rows.forEach((rowSection) => {
		rowSection.inputs.forEach((port) => unified.push({ key: port.id, port, side: 'inputs' }))
		rowSection.branches.forEach((arm) => arm.outputs.forEach((port) => unified.push({ key: port.id, port, side: 'outputs' })))
	})

	return (
		<section className="PortTextBabble" data-testid="port-text-babble-v2" data-selected={selected || undefined} style={regionStyle(top, bottom)}
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
							return parsed ? attributeLineSpans(parsed, resolve) : null
						}}
						onChange={setDraft}
						onBlur={commit}
						onCancel={cancel}
						autoFocus
						testId="port-text-babble-v2-source"
						handleRef={sourceEditorRef}
						initialCaret={sourceCaret}
						className="TypeBabble"
						completion={{ editor, findSlot: findSigilTypeSlot }}
					/>
					<DiagnosticsBanner invalid={parsedDraft.invalid} />
				</>
			) : (
				<div className="PortTextBabble-body">
					{unified.map((entry, index) => {
						const previous = unified[index - 1]
						const boundary = previous
							&& (portRow(previous.port) !== portRow(entry.port)
								|| (entry.side === 'outputs' && portBranch(previous.port) !== portBranch(entry.port)))
						return (
							<div key={entry.key}>
								{boundary ? <SectionRule /> : null}
								{entry.side === 'outputs' && portBranch(entry.port) > 0 && (!previous || portBranch(previous.port) !== portBranch(entry.port)) ? (
									<div className="PortTextBabble-armBadge">arm {portBranch(entry.port)}</div>
								) : null}
								<PortTextRow
									port={entry.port}
									bulletFilled={entry.side === 'outputs'}
									bulletTitle={entry.side === 'outputs' ? 'output' : 'input'}
								/>
							</div>
						)
					})}
				</div>
			)}
		</section>
	)
}

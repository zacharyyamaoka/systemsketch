import { useValue } from 'tldraw'

import { blockPortIsConnected } from '../connections/blockPorts'
import { blockPortSections, isEffectPort, portBranch, type BlockShape } from '../blockModel'
import { attributeLineSpans } from './sourceHighlight'
import { KNOWN_PRIMITIVES } from './typeBabbleShared'
import { useTypeReferenceIndex } from './typeReferenceIndex'
import { twoLaneGrammar } from './portTextGrammarTwoLane'
import { findTypeSlot } from './typeNameAutocompleteLogic'
import { SourceCodeEditor } from './SourceCodeEditor'
import { usePortTextToggleEditor } from './usePortTextToggleEditor'
import { DiagnosticsBanner, PortTextRow, regionStyle, SectionHeading, SectionRule } from './PortTextBabbleParts'

/**
 * V1 — Two Lanes, toggle UI/Source.
 *
 * The safest, most literal reading: side is which half of the document you
 * are in, mirroring `BlockInspector`'s own separate Inputs/Outputs sections
 * exactly. The bullet answers "what's meaningful to encode there" with
 * CONNECTED — filled when a real cable is attached, the same fact Port view
 * itself cares about most — so this variant's read view doubles as a
 * connection-at-a-glance summary, not just a pretty label list.
 */
export function PortTextBabbleV1({ shape, top, bottom, selected }: { shape: BlockShape; top: number; bottom: number; selected: boolean }) {
	const { editor, mode, setMode, draft, setDraft, commit, cancel, sourceEditorRef, sourceCaret } =
		usePortTextToggleEditor(shape, 'edit ports (text V1)', twoLaneGrammar)
	const typeIndex = useTypeReferenceIndex(editor)
	const resolve = (typeName: string) => {
		const name = typeName.trim()
		if (KNOWN_PRIMITIVES.has(name)) return 'primitive' as const
		return typeIndex.has(name) ? ('known' as const) : ('unknown' as const)
	}
	const parsedDraft = twoLaneGrammar.parse(draft)
	const connected = useValue('port-text-v1-connections', () => {
		const ids = new Set<string>()
		for (const port of [...shape.props.inputs, ...shape.props.outputs]) {
			if (blockPortIsConnected(editor, shape, port.id)) ids.add(port.id)
		}
		return ids
	}, [editor, shape])

	const sections = blockPortSections({ inputs: shape.props.inputs, outputs: shape.props.outputs.filter((p) => !isEffectPort(p)) })

	return (
		<section className="PortTextBabble" data-testid="port-text-babble-v1" data-selected={selected || undefined} style={regionStyle(top, bottom)}
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
						testId="port-text-babble-v1-source"
						handleRef={sourceEditorRef}
						initialCaret={sourceCaret}
						className="TypeBabble"
						completion={{ editor, findSlot: findTypeSlot }}
					/>
					<DiagnosticsBanner invalid={parsedDraft.invalid} />
				</>
			) : (
				<div className="PortTextBabble-body">
					<SectionHeading>inputs</SectionHeading>
					{sections.header.map((port) => (
						<PortTextRow key={port.id} port={port} bulletFilled={connected.has(port.id)} bulletTitle={connected.has(port.id) ? 'connected' : 'not connected'} />
					))}
					{sections.rows.map((rowSection, index) => (
						rowSection.inputs.length === 0 ? null : (
							<div key={`in-row-${rowSection.row}`}>
								{index > 0 || sections.header.length > 0 ? <SectionRule /> : null}
								{rowSection.inputs.map((port) => (
									<PortTextRow key={port.id} port={port} bulletFilled={connected.has(port.id)} bulletTitle={connected.has(port.id) ? 'connected' : 'not connected'} />
								))}
							</div>
						)
					))}
					<SectionHeading>outputs</SectionHeading>
					{sections.rows.map((rowSection) => {
						const nonEmpty = rowSection.branches.filter((arm) => arm.outputs.length > 0)
						if (nonEmpty.length === 0) return null
						return (
							<div key={`out-row-${rowSection.row}`}>
								<SectionRule />
								{nonEmpty.map((arm) => (
									<div key={`arm-${arm.branch}`} className={portBranch(arm.outputs[0]) > 0 ? 'PortTextBabble-arm' : undefined}>
										{arm.branch > 0 ? <div className="PortTextBabble-armBadge">arm {arm.branch}</div> : null}
										{arm.outputs.map((port) => (
											<PortTextRow key={port.id} port={port} bulletFilled={connected.has(port.id)} bulletTitle={connected.has(port.id) ? 'connected' : 'not connected'} />
										))}
									</div>
								))}
							</div>
						)
					})}
				</div>
			)}
		</section>
	)
}

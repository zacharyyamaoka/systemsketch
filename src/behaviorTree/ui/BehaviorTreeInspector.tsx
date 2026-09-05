/**
 * The Behavior Tree inspector, in the Block / Branch / Loop idiom.
 *
 * Four sections, each one an honest editor of the XML or of presentation:
 *
 *   View     — projection, direction, faces, wires, lens, Blackboard placement
 *   Node     — the selected occurrence: ID, name, ports, structure actions
 *   Library  — the registered nodes, added under or beside the selection
 *   Source   — the XML itself, applied explicitly, with its diagnostics
 */
import { useEffect, useMemo, useState } from 'react'
import { type Editor, useValue } from 'tldraw'

import { LiveTextInput } from '../../fields'
import {
	addBehaviorTreeFailureRecovery,
	applyBehaviorTreeXml,
	deleteBehaviorTreeOccurrence,
	getSelectedBehaviorTree,
	insertBehaviorTreeChild,
	insertBehaviorTreeSiblingOf,
	nudgeBehaviorTreeOccurrence,
	setBehaviorTreeNodeName,
	setBehaviorTreePortValue,
	setBehaviorTreeView,
	tidyBehaviorTree,
	unwrapBehaviorTreeOccurrence,
	wrapBehaviorTreeOccurrence,
	type BtCommandResult,
	type BtSelection,
} from '../behaviorTreeCommands'
import {
	BT_BLACKBOARD_LAYOUTS,
	isBtControlNode,
	type BehaviorTreeShapeProps,
	type BtBlackboardLayout,
} from '../behaviorTreeModel'
import { projectBehaviorTree } from '../behaviorTreeProjection'
import { type BtDocument, type BtInsertTemplate, type BtNode } from '../btcppXml'
import '../../blocks/ui/block-inspector.css'
import './behavior-tree-inspector.css'

function XIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
	)
}

function Segmented<T extends string>({ label, value, options, onChange, testId }: {
	label: string
	value: T
	options: ReadonlyArray<{ value: T; label: string; title?: string; disabled?: boolean }>
	onChange(value: T): void
	testId: string
}) {
	return (
		<div className="bt-inspector__row">
			<span className="bt-inspector__rowLabel">{label}</span>
			<div className="bt-inspector__segmented" role="group" aria-label={label} data-testid={testId}>
				{options.map((option) => (
					<button
						type="button"
						key={option.value}
						aria-pressed={value === option.value}
						title={option.title}
						disabled={option.disabled}
						data-testid={`${testId}-${option.value}`}
						onClick={() => onChange(option.value)}
					>
						{option.label}
					</button>
				))}
			</div>
		</div>
	)
}

function ViewSection({ props, set, onTidy }: {
	props: BehaviorTreeShapeProps
	set(patch: Partial<BehaviorTreeShapeProps>): void
	onTidy(): void
}) {
	const dataflow = props.dataLens === 'dataflow'
	return (
		<section className="block-inspector__section" data-inspector-section="View">
			<div className="block-inspector__section-title">View</div>
			<Segmented label="Projection" value={props.projection} testId="bt-view-projection" onChange={(projection) => set({ projection })}
				options={[{ value: 'tree', label: 'Tree' }, { value: 'process', label: 'Process' }]} />
			<Segmented label="Direction" value={dataflow ? 'right' : props.orientation} testId="bt-view-orientation" onChange={(orientation) => set({ orientation })}
				options={[{ value: 'down', label: 'Top → bottom', disabled: dataflow, title: dataflow ? 'Dataflow reads left to right' : undefined }, { value: 'right', label: 'Left → right' }]} />
			<Segmented label="Nodes" value={dataflow ? 'port' : props.nodeFace} testId="bt-view-face" onChange={(nodeFace) => set({ nodeFace })}
				options={[{ value: 'simple', label: 'Simple', disabled: dataflow }, { value: 'port', label: 'Ports' }]} />
			{props.projection === 'tree' ? (
				<>
					<Segmented label="Controls" value={props.controlFace} testId="bt-view-controls" onChange={(controlFace) => set({ controlFace })}
						options={[{ value: 'expanded', label: 'Icon + text' }, { value: 'compact', label: 'Icon only' }]} />
					<Segmented label="Wires" value={props.edgeStyle} testId="bt-view-edges" onChange={(edgeStyle) => set({ edgeStyle })}
						options={[{ value: 'straight', label: 'Straight' }, { value: 'elbow', label: 'Elbow' }]} />
				</>
			) : null}
			<Segmented label="Data" value={props.dataLens} testId="bt-view-lens" onChange={(dataLens) => set({ dataLens })}
				options={[{ value: 'none', label: 'None' }, { value: 'blackboard', label: 'Blackboard' }, { value: 'dataflow', label: 'Dataflow' }]} />
			{props.dataLens === 'blackboard' ? (
				<Segmented<BtBlackboardLayout> label="Keys" value={props.blackboardLayout} testId="bt-view-blackboard" onChange={(blackboardLayout) => set({ blackboardLayout })}
					options={BT_BLACKBOARD_LAYOUTS.map((value) => ({ value, label: value === 'pytrees' ? 'py_trees' : value[0].toUpperCase() + value.slice(1) }))} />
			) : null}
			{props.dataLens !== 'none' ? (
				<label className="bt-inspector__row">
					<span className="bt-inspector__rowLabel">Control wires</span>
					<input
						type="range"
						min={0}
						max={1}
						step={0.05}
						value={props.controlWireOpacity}
						aria-label="Control wire opacity"
						data-testid="bt-view-wire-opacity"
						onChange={(event) => set({ controlWireOpacity: Number(event.target.value) })}
					/>
				</label>
			) : null}
			<div className="bt-inspector__actions">
				<button type="button" className="bt-inspector__action" data-testid="bt-action-tidy" disabled={Object.keys(props.offsets).length === 0} onClick={onTidy}>
					Tidy
				</button>
			</div>
		</section>
	)
}

function NodeSection({ editor, selection, node }: { editor: Editor; selection: BtSelection; node: BtNode }) {
	const regionId = selection.region.id
	const [notice, setNotice] = useState<string | null>(null)
	useEffect(() => setNotice(null), [node.path, selection.region.props.xml])
	const report = (result: BtCommandResult) => {
		if (!result.ok) setNotice(result.reason)
	}
	const isControl = isBtControlNode(node)
	const isRoot = node.parentPath === null
	const siblings = node.parentPath ? Number.parseInt(node.path.split('.').pop() ?? '0', 10) : 0
	return (
		<section className="block-inspector__section" data-inspector-section="Node">
			<div className="block-inspector__section-title">Node</div>
			<div className="bt-inspector__identity" data-testid="bt-node-identity">
				<span className="bt-inspector__kind">{node.kind === 'subtree' ? 'Sub Tree' : node.kind}</span>
				<span className="bt-inspector__id">{node.subtreeId ?? node.id}</span>
				<span className="bt-inspector__path">{node.path}</span>
			</div>
			<label className="block-inspector__field">
				<span>Name</span>
				<LiveTextInput
					value={node.name}
					placeholder={node.id}
					ariaLabel="Node name"
					beginEdit={() => editor.markHistoryStoppingPoint('rename node')}
					onWrite={(name) => report(setBehaviorTreeNodeName(editor, regionId, node.path, name))}
				/>
			</label>
			{node.ports.length > 0 ? (
				<>
					<div className="bt-inspector__subtitle">Ports</div>
					<ul className="block-inspector__ports bt-inspector__ports" data-testid="bt-node-ports">
						{node.ports.map((binding) => (
							<li key={binding.name} className="block-inspector__port-row bt-inspector__port-row" data-direction={binding.direction}>
								<span className="bt-inspector__portDirection" title={binding.direction}>
									{binding.direction === 'input' ? 'in' : binding.direction === 'output' ? 'out' : binding.direction === 'inout' ? 'inout' : '?'}
								</span>
								<span className="block-inspector__port-name">{binding.name}</span>
								<LiveTextInput
									className="bt-inspector__portValue"
									value={binding.value}
									ariaLabel={`${binding.name} value`}
									placeholder="{key} or literal"
									beginEdit={() => editor.markHistoryStoppingPoint('edit port')}
									onWrite={(value) => report(setBehaviorTreePortValue(editor, regionId, node.path, binding.name, value))}
								/>
							</li>
						))}
					</ul>
				</>
			) : null}
			<div className="bt-inspector__subtitle">Structure</div>
			<div className="bt-inspector__actions" data-testid="bt-node-actions">
				{isControl && !(node.kind === 'decorator' && node.children.length >= 1) ? (
					<button type="button" className="bt-inspector__action" data-testid="bt-action-add-child" onClick={() => report(insertBehaviorTreeChild(editor, regionId, node.path, node.children.length, { id: 'NewSkill', kind: 'action' }))}>
						Add child
					</button>
				) : null}
				<button type="button" className="bt-inspector__action" data-testid="bt-action-add-after" onClick={() => report(insertBehaviorTreeSiblingOf(editor, regionId, node.path, true, { id: 'NewSkill', kind: 'action' }))}>
					Add after
				</button>
				<button type="button" className="bt-inspector__action" data-testid="bt-action-recovery" onClick={() => report(addBehaviorTreeFailureRecovery(editor, regionId, node.path))}>
					Add failure recovery
				</button>
				<button type="button" className="bt-inspector__action" data-testid="bt-action-wrap-sequence" onClick={() => report(wrapBehaviorTreeOccurrence(editor, regionId, node.path, { id: 'Sequence', kind: 'control' }))}>
					Wrap in Sequence
				</button>
				<button type="button" className="bt-inspector__action" data-testid="bt-action-wrap-retry" onClick={() => report(wrapBehaviorTreeOccurrence(editor, regionId, node.path, { id: 'RetryUntilSuccessful', kind: 'decorator', attrs: { num_attempts: '3' } }))}>
					Wrap in Retry
				</button>
				{node.children.length === 1 ? (
					<button type="button" className="bt-inspector__action" data-testid="bt-action-unwrap" onClick={() => report(unwrapBehaviorTreeOccurrence(editor, regionId, node.path))}>
						Unwrap
					</button>
				) : null}
				<button type="button" className="bt-inspector__action" data-testid="bt-action-earlier" disabled={isRoot || siblings === 0} onClick={() => report(nudgeBehaviorTreeOccurrence(editor, regionId, node.path, -1))}>
					Move earlier
				</button>
				<button type="button" className="bt-inspector__action" data-testid="bt-action-later" disabled={isRoot} onClick={() => report(nudgeBehaviorTreeOccurrence(editor, regionId, node.path, 1))}>
					Move later
				</button>
				<button type="button" className="bt-inspector__action bt-inspector__action--danger" data-testid="bt-action-delete" onClick={() => report(deleteBehaviorTreeOccurrence(editor, regionId, node.path))}>
					Delete
				</button>
			</div>
			{notice ? <p className="bt-inspector__notice" role="status" data-testid="bt-node-notice">{notice}</p> : null}
		</section>
	)
}

function LibrarySection({ editor, selection, node, document }: { editor: Editor; selection: BtSelection; node: BtNode | null; document: BtDocument }) {
	const [query, setQuery] = useState('')
	const rows = useMemo(() => {
		const needle = query.trim().toLowerCase()
		const entries: Array<{ id: string; label: string; detail: string; template: BtInsertTemplate }> = []
		for (const model of document.models) {
			if (model.builtin && model.kind !== 'control' && model.kind !== 'decorator') continue
			if (model.id === 'SubTree') continue
			entries.push({ id: model.id, label: model.id, detail: model.builtin ? model.kind : model.kind === 'condition' ? 'Condition' : 'Skill', template: { id: model.id, kind: model.kind } })
		}
		for (const tree of document.trees) {
			if (tree.id === (selection.region.props.treeId || document.mainTreeId)) continue
			entries.push({ id: `tree:${tree.id}`, label: tree.id, detail: 'Sub Tree', template: { id: tree.id, kind: 'subtree' } })
		}
		return entries.filter((entry) => needle === '' || entry.label.toLowerCase().includes(needle)).sort((a, b) => (a.detail === b.detail ? a.label.localeCompare(b.label) : a.detail.localeCompare(b.detail)))
	}, [document, query, selection.region.props.treeId])
	const [notice, setNotice] = useState<string | null>(null)
	const add = (template: BtInsertTemplate) => {
		const regionId = selection.region.id
		let result: BtCommandResult
		if (!node) result = insertBehaviorTreeChild(editor, regionId, null, 0, template)
		else if (isBtControlNode(node) && !(node.kind === 'decorator' && node.children.length >= 1)) result = insertBehaviorTreeChild(editor, regionId, node.path, node.children.length, template)
		else result = insertBehaviorTreeSiblingOf(editor, regionId, node.path, true, template)
		setNotice(result.ok ? null : result.reason)
	}
	return (
		<section className="block-inspector__section" data-inspector-section="Library">
			<div className="block-inspector__section-title">Library</div>
			<input className="bt-inspector__search" placeholder="Search nodes" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search library" data-testid="bt-library-search" />
			<ul className="bt-inspector__library" data-testid="bt-library">
				{rows.map((row) => (
					<li key={row.id}>
						<button type="button" className="bt-inspector__libraryRow" data-testid={`bt-library-${row.id}`} onClick={() => add(row.template)} title={`Add ${row.label}`}>
							<span className="bt-inspector__libraryLabel">{row.label}</span>
							<span className="bt-inspector__libraryDetail">{row.detail}</span>
						</button>
					</li>
				))}
			</ul>
			<p className="block-inspector__hint">
				{node ? (isBtControlNode(node) ? `Adds under ${node.label}.` : `Adds after ${node.label}.`) : 'Adds the root node.'}
			</p>
			{notice ? <p className="bt-inspector__notice" role="status">{notice}</p> : null}
		</section>
	)
}

function SourceSection({ editor, selection, document }: { editor: Editor; selection: BtSelection; document: BtDocument }) {
	const stored = selection.region.props.xml
	const [draft, setDraft] = useState(stored)
	const [error, setError] = useState<string | null>(null)
	useEffect(() => {
		setDraft(stored)
		setError(null)
	}, [stored])
	const dirty = draft !== stored
	return (
		<section className="block-inspector__section" data-inspector-section="Source">
			<div className="block-inspector__section-title">Source</div>
			<textarea
				className="bt-inspector__xml"
				value={draft}
				spellCheck={false}
				aria-label="BehaviorTree.CPP XML"
				data-testid="bt-source-xml"
				onChange={(event) => setDraft(event.target.value)}
			/>
			<div className="bt-inspector__actions">
				<button type="button" className="bt-inspector__action bt-inspector__action--primary" data-testid="bt-source-apply" disabled={!dirty} onClick={() => {
					const result = applyBehaviorTreeXml(editor, selection.region.id, draft)
					setError(result.error)
				}}>
					Apply
				</button>
				<button type="button" className="bt-inspector__action" data-testid="bt-source-revert" disabled={!dirty} onClick={() => setDraft(stored)}>
					Revert
				</button>
			</div>
			{error ? <p className="bt-inspector__notice" role="alert" data-testid="bt-source-error">{error}</p> : null}
			{document.diagnostics.length > 0 ? (
				<ul className="bt-inspector__diagnostics" data-testid="bt-diagnostics">
					{document.diagnostics.map((entry, index) => (
						<li key={index} data-severity={entry.severity}>{entry.message}</li>
					))}
				</ul>
			) : null}
		</section>
	)
}

export function BehaviorTreeInspectorContent({ editor, selection }: { editor: Editor; selection: BtSelection }) {
	const projection = useMemo(() => projectBehaviorTree(selection.region.props), [selection.region.props])
	const node = selection.path !== null ? projection.tree?.nodes.find((candidate) => candidate.path === selection.path) ?? null : null
	const set = (patch: Partial<BehaviorTreeShapeProps>) => void setBehaviorTreeView(editor, selection.region.id, patch)
	return (
		<div className="block-inspector__body" role="tabpanel" aria-label="Behavior Tree details">
			{node ? <NodeSection editor={editor} selection={selection} node={node} /> : null}
			<ViewSection props={selection.region.props} set={set} onTidy={() => void tidyBehaviorTree(editor, selection.region.id)} />
			<LibrarySection editor={editor} selection={selection} node={node} document={projection.document} />
			<SourceSection editor={editor} selection={selection} document={projection.document} />
		</div>
	)
}

/** Reactive adapter from the selection to the Behavior Tree inspector body. */
export function EditorBehaviorTreeInspector({ editor, onRequestClose }: {
	editor: Editor
	onRequestClose?: () => void
}) {
	const selection = useValue(
		'SystemSketch Behavior Tree inspector subject',
		(previous?: unknown) => {
			const next = getSelectedBehaviorTree(editor)
			// The first derive receives tldraw's UNINITIALIZED sentinel, not a selection.
			const before = typeof previous === 'object' && previous !== null && 'region' in previous ? previous as BtSelection : null
			if (before && next && before.region.id === next.region.id && before.region.props === next.region.props && before.path === next.path) return before
			return next
		},
		[editor],
	)
	if (!selection) return null
	return (
		<section className="block-inspector bt-inspector" aria-label="Behavior Tree inspector" data-status="selected" data-testid="bt-inspector">
			<nav className="block-inspector__tabs" role="tablist" aria-label="Behavior Tree inspector">
				<button type="button" role="tab" className="is-active" aria-selected="true">Behavior Tree</button>
				{onRequestClose ? (
					<button type="button" className="block-inspector__dock-close" aria-label="Close Behavior Tree inspector" onClick={onRequestClose}>
						<XIcon />
					</button>
				) : null}
			</nav>
			<BehaviorTreeInspectorContent editor={editor} selection={selection} />
		</section>
	)
}

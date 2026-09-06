/**
 * BehaviorTree.CPP v4 XML: the one canonical definition of a Behavior Tree.
 *
 * Everything the canvas draws — Tree, Process, Blackboard, Dataflow — is a
 * projection of the document parsed here, and every structural gesture on the
 * canvas compiles back into an edit of this XML. There is deliberately no
 * second graph model: the region stores the XML text, and this module is the
 * only thing that reads or rewrites it.
 *
 * The parser is a small hand-written XML reader rather than `DOMParser`:
 * BT.CPP XML never needs a DTD, an entity, or a namespace, the reader has to
 * run identically in the browser, in vitest and in the Python host's tests,
 * and refusing DOCTYPE/entity input outright is the safest way to keep an
 * untrusted file from expanding into anything.
 */

/* ------------------------------ generic XML ------------------------------ */

export interface XmlElement {
	tag: string
	/** Source order matters: a port's position is part of how a person reads a node. */
	attrs: Array<[string, string]>
	children: XmlElement[]
	/** Leading text content, kept only so a `<Script code="…"/>` sibling comment survives. */
	text: string
}

export interface XmlDocument {
	root: XmlElement | null
	/** The XML declaration, kept verbatim when the file is rewritten. */
	declaration: string
}

const NAME_START = /[A-Za-z_:]/
const NAME_CHAR = /[A-Za-z0-9_:.\-]/

export class BtXmlError extends Error {
	constructor(message: string, readonly offset: number) {
		super(message)
		this.name = 'BtXmlError'
	}
}

function decodeEntities(text: string): string {
	return text.replace(/&(lt|gt|amp|quot|apos|#x[0-9a-fA-F]+|#[0-9]+);/g, (whole, entity: string) => {
		switch (entity) {
			case 'lt': return '<'
			case 'gt': return '>'
			case 'amp': return '&'
			case 'quot': return '"'
			case 'apos': return "'"
			default: {
				const code = entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
				return Number.isFinite(code) ? String.fromCodePoint(code) : whole
			}
		}
	})
}

export function encodeXmlText(text: string): string {
	return text.replace(/[&<>"]/g, (char) => (
		char === '&' ? '&amp;' : char === '<' ? '&lt;' : char === '>' ? '&gt;' : '&quot;'
	))
}

/** Parse XML with elements, attributes, comments and text only. */
export function parseXml(source: string): XmlDocument {
	let position = 0
	const length = source.length
	let declaration = ''

	const fail = (message: string): never => {
		throw new BtXmlError(message, position)
	}
	const skipWhitespace = () => {
		while (position < length && /\s/.test(source[position])) position += 1
	}
	const readName = (): string => {
		const start = position
		if (position >= length || !NAME_START.test(source[position])) fail('expected a name')
		while (position < length && NAME_CHAR.test(source[position])) position += 1
		return source.slice(start, position)
	}
	const skipMisc = () => {
		for (;;) {
			skipWhitespace()
			if (source.startsWith('<!--', position)) {
				const end = source.indexOf('-->', position + 4)
				if (end === -1) fail('unterminated comment')
				position = end + 3
				continue
			}
			if (source.startsWith('<?', position)) {
				const end = source.indexOf('?>', position + 2)
				if (end === -1) fail('unterminated processing instruction')
				const text = source.slice(position, end + 2)
				if (text.startsWith('<?xml')) declaration = text
				position = end + 2
				continue
			}
			if (source.startsWith('<!', position)) {
				fail('DOCTYPE and other declarations are not accepted in a Behavior Tree file')
			}
			return
		}
	}
	const readElement = (depth: number): XmlElement => {
		if (depth > BT_XML_MAX_DEPTH) fail(`nesting deeper than ${BT_XML_MAX_DEPTH}`)
		if (source[position] !== '<') fail('expected "<"')
		position += 1
		const tag = readName()
		const attrs: Array<[string, string]> = []
		for (;;) {
			skipWhitespace()
			if (position >= length) fail(`unterminated <${tag}>`)
			if (source[position] === '/' || source[position] === '>') break
			const name = readName()
			skipWhitespace()
			if (source[position] !== '=') fail(`attribute ${name} of <${tag}> needs a value`)
			position += 1
			skipWhitespace()
			const quote = source[position]
			if (quote !== '"' && quote !== "'") fail(`attribute ${name} of <${tag}> must be quoted`)
			const end = source.indexOf(quote, position + 1)
			if (end === -1) fail(`unterminated attribute ${name} of <${tag}>`)
			attrs.push([name, decodeEntities(source.slice(position + 1, end))])
			position = end + 1
		}
		if (source[position] === '/') {
			position += 1
			if (source[position] !== '>') fail(`expected "/>" to close <${tag}>`)
			position += 1
			return { tag, attrs, children: [], text: '' }
		}
		position += 1 // '>'
		const children: XmlElement[] = []
		let text = ''
		for (;;) {
			const textStart = position
			while (position < length && source[position] !== '<') position += 1
			if (position >= length) fail(`unterminated <${tag}>`)
			const chunk = source.slice(textStart, position).trim()
			if (chunk) text += (text ? ' ' : '') + decodeEntities(chunk)
			if (source.startsWith('</', position)) {
				position += 2
				const closing = readName()
				if (closing !== tag) fail(`</${closing}> does not close <${tag}>`)
				skipWhitespace()
				if (source[position] !== '>') fail(`expected ">" after </${tag}`)
				position += 1
				return { tag, attrs, children, text }
			}
			if (source.startsWith('<!--', position)) {
				const end = source.indexOf('-->', position + 4)
				if (end === -1) fail('unterminated comment')
				position = end + 3
				continue
			}
			if (source.startsWith('<![CDATA[', position)) {
				const end = source.indexOf(']]>', position + 9)
				if (end === -1) fail('unterminated CDATA')
				text += (text ? ' ' : '') + source.slice(position + 9, end)
				position = end + 3
				continue
			}
			if (source.startsWith('<?', position)) {
				const end = source.indexOf('?>', position + 2)
				if (end === -1) fail('unterminated processing instruction')
				position = end + 2
				continue
			}
			if (source.startsWith('<!', position)) fail('declarations are not accepted inside an element')
			children.push(readElement(depth + 1))
		}
	}

	if (source.length > BT_XML_MAX_BYTES) fail(`source larger than ${BT_XML_MAX_BYTES} characters`)
	skipMisc()
	if (position >= length) return { root: null, declaration }
	const root = readElement(0)
	skipMisc()
	if (position < length) fail('content after the root element')
	return { root, declaration }
}

export const BT_XML_MAX_DEPTH = 256
export const BT_XML_MAX_BYTES = 2 * 1024 * 1024

/** Serialize with BT.CPP's own conventions: four-space indentation, self-closing leaves. */
export function serializeXml(document: XmlDocument): string {
	const lines: string[] = []
	if (document.declaration) lines.push(document.declaration)
	const write = (element: XmlElement, depth: number) => {
		const indent = '    '.repeat(depth)
		const attrs = element.attrs.map(([name, value]) => ` ${name}="${encodeXmlText(value)}"`).join('')
		if (element.children.length === 0 && element.text === '') {
			lines.push(`${indent}<${element.tag}${attrs}/>`)
			return
		}
		if (element.children.length === 0) {
			lines.push(`${indent}<${element.tag}${attrs}>${encodeXmlText(element.text)}</${element.tag}>`)
			return
		}
		lines.push(`${indent}<${element.tag}${attrs}>`)
		if (element.text) lines.push(`${indent}    ${encodeXmlText(element.text)}`)
		for (const child of element.children) write(child, depth + 1)
		lines.push(`${indent}</${element.tag}>`)
	}
	if (document.root) write(document.root, 0)
	return lines.join('\n') + '\n'
}

export function getAttr(element: XmlElement, name: string): string | undefined {
	const found = element.attrs.find(([key]) => key === name)
	return found ? found[1] : undefined
}

export function setAttr(element: XmlElement, name: string, value: string): void {
	const found = element.attrs.find(([key]) => key === name)
	if (found) {
		found[1] = value
		return
	}
	// BT.CPP's own files lead with the identity: `<Node ID="…" name="…" port="…">`.
	if (name === 'ID') element.attrs.unshift([name, value])
	else if (name === 'name') element.attrs.splice(element.attrs[0]?.[0] === 'ID' ? 1 : 0, 0, [name, value])
	else element.attrs.push([name, value])
}

export function removeAttr(element: XmlElement, name: string): void {
	element.attrs = element.attrs.filter(([key]) => key !== name)
}

function cloneElement(element: XmlElement): XmlElement {
	return {
		tag: element.tag,
		attrs: element.attrs.map(([name, value]) => [name, value] as [string, string]),
		children: element.children.map(cloneElement),
		text: element.text,
	}
}

export function cloneXmlDocument(document: XmlDocument): XmlDocument {
	return { root: document.root ? cloneElement(document.root) : null, declaration: document.declaration }
}

/* ------------------------------ node models ------------------------------ */

export type BtNodeKind = 'control' | 'decorator' | 'action' | 'condition' | 'subtree' | 'unknown'
export type BtPortDirection = 'input' | 'output' | 'inout'
/**
 * How a control node treats its ordered children; what the Process view
 * draws. `recoveryLoop` is `RecoveryNode` alone — kept distinct from
 * `fallback`/`branch` on purpose, because unlike every other kind here its
 * second child's success loops back to re-run the first, rather than the
 * flow converging forward past it (see `BtEdgeKind`'s own `retryLoop` vs
 * `recovery` split, and `recoveryLoopItem` in `processLayout.ts`).
 */
export type BtControlKind = 'sequence' | 'fallback' | 'parallel' | 'branch' | 'switch' | 'recoveryLoop' | 'other'

export interface BtPortModel {
	name: string
	direction: BtPortDirection
	type: string
	defaultValue: string
	description: string
}

export interface BtNodeModel {
	id: string
	kind: BtNodeKind
	controlKind?: BtControlKind
	ports: BtPortModel[]
	description: string
	/** True for BT.CPP's own nodes; false for a TreeNodesModel declaration or an inferred one. */
	builtin: boolean
}

function port(name: string, direction: BtPortDirection, type = '', defaultValue = '', description = ''): BtPortModel {
	return { name, direction, type, defaultValue, description }
}

function model(id: string, kind: BtNodeKind, ports: BtPortModel[] = [], extra: Partial<BtNodeModel> = {}): BtNodeModel {
	return { id, kind, ports, description: '', builtin: true, ...extra }
}

/**
 * BT.CPP v4's built-in nodes. Directions come from the library's own port
 * declarations, which is what makes the Blackboard lens honest about which
 * side of a `{key}` a node stands on.
 */
export const BT_BUILTIN_MODELS: readonly BtNodeModel[] = [
	model('Sequence', 'control', [], { controlKind: 'sequence', description: 'Run children in order; fail on the first failure.' }),
	model('SequenceWithMemory', 'control', [], { controlKind: 'sequence', description: 'Sequence that resumes from the running child.' }),
	model('ReactiveSequence', 'control', [], { controlKind: 'sequence', description: 'Sequence that re-ticks every child from the first.' }),
	model('SequenceStar', 'control', [], { controlKind: 'sequence', description: 'BT.CPP v3 name for SequenceWithMemory.' }),
	model('Fallback', 'control', [], { controlKind: 'fallback', description: 'Try children in order until one succeeds.' }),
	model('ReactiveFallback', 'control', [], { controlKind: 'fallback', description: 'Fallback that re-ticks from the first child.' }),
	model('Parallel', 'control', [port('success_count', 'input', 'int', '-1'), port('failure_count', 'input', 'int', '1')], { controlKind: 'parallel', description: 'Tick every child; succeed on a threshold.' }),
	model('ParallelAll', 'control', [port('max_failures', 'input', 'int', '1')], { controlKind: 'parallel', description: 'Tick every child to completion.' }),
	model('IfThenElse', 'control', [], { controlKind: 'branch', description: 'Condition, then-branch, optional else-branch.' }),
	model('WhileDoElse', 'control', [], { controlKind: 'branch', description: 'Reactive condition, do-branch, optional else-branch.' }),
	model('Switch2', 'control', [port('variable', 'input'), port('case_1', 'input'), port('case_2', 'input')], { controlKind: 'switch' }),
	model('Switch3', 'control', [port('variable', 'input'), port('case_1', 'input'), port('case_2', 'input'), port('case_3', 'input')], { controlKind: 'switch' }),
	model('Switch4', 'control', [port('variable', 'input'), port('case_1', 'input'), port('case_2', 'input'), port('case_3', 'input'), port('case_4', 'input')], { controlKind: 'switch' }),
	model('Switch5', 'control', [port('variable', 'input'), port('case_1', 'input'), port('case_2', 'input'), port('case_3', 'input'), port('case_4', 'input'), port('case_5', 'input')], { controlKind: 'switch' }),
	model('Switch6', 'control', [port('variable', 'input'), port('case_1', 'input'), port('case_2', 'input'), port('case_3', 'input'), port('case_4', 'input'), port('case_5', 'input'), port('case_6', 'input')], { controlKind: 'switch' }),
	model('ManualSelector', 'control', [port('repeat_last_selection', 'input', 'bool', 'false')], { controlKind: 'other' }),
	// WHY: RecoveryNode is Nav2's own extension (nav2_behavior_tree/plugins/
	// control/recovery_node.cpp), not core BT.CPP like everything else in this
	// array — included anyway because it is the only named pattern with a
	// genuine loop-back: on child 0 (primary) FAILURE it ticks child 1
	// (recovery); recovery SUCCESS re-ticks the primary from the top (and only
	// then counts against number_of_retries); recovery FAILURE, or the primary
	// failing again with the budget spent, ends the node in FAILURE. It never
	// succeeds via the recovery child — only the primary's own SUCCESS does.
	// Confirmed 2026-09-06 straight from that source file (`main` branch) and
	// Nav2's shipped `navigate_to_pose_w_replanning_and_recovery.xml`, which
	// nests it three ways (`number_of_retries="6"` wrapping the whole
	// pipeline, `="1"` wrapping just ComputePathToPose, `="1"` wrapping
	// FollowPath) — real trees use it at multiple granularities, which is why
	// this app needs to render it recognizably rather than fall back to a
	// generic "control with children" box the way it did before this model
	// existed. The decision record is
	// docs/peps/0008-recoverynode-first-class-control.md.
	model('RecoveryNode', 'control', [port('number_of_retries', 'input', 'int', '1', 'Successful recoveries allowed before giving up')], {
		controlKind: 'recoveryLoop',
		description: 'Primary step; on failure, a one-step recovery, then retry the primary.',
	}),

	model('Inverter', 'decorator', [], { description: 'Swap SUCCESS and FAILURE.' }),
	model('ForceSuccess', 'decorator', [], { description: 'Always report SUCCESS once the child finishes.' }),
	model('ForceFailure', 'decorator', [], { description: 'Always report FAILURE once the child finishes.' }),
	model('Repeat', 'decorator', [port('num_cycles', 'input', 'int', '1')], { description: 'Repeat the child while it succeeds.' }),
	model('RetryUntilSuccessful', 'decorator', [port('num_attempts', 'input', 'int', '1')], { description: 'Retry the child while it fails.' }),
	model('KeepRunningUntilFailure', 'decorator', [], { description: 'Keep ticking the child until it fails.' }),
	model('Delay', 'decorator', [port('delay_msec', 'input', 'unsigned', '0')], { description: 'Wait before ticking the child.' }),
	model('RunOnce', 'decorator', [port('then_skip', 'input', 'bool', 'true')], { description: 'Tick the child once, then remember its result.' }),
	model('Timeout', 'decorator', [port('msec', 'input', 'unsigned', '0')], { description: 'Halt the child after a deadline.' }),
	model('Precondition', 'decorator', [port('if', 'input'), port('else', 'input', 'NodeStatus', 'FAILURE')], { description: 'Tick the child only when a script holds.' }),
	model('LoopDouble', 'decorator', [port('queue', 'inout'), port('if_empty', 'input', 'NodeStatus', 'SUCCESS'), port('value', 'output', 'double')]),
	model('LoopString', 'decorator', [port('queue', 'inout'), port('if_empty', 'input', 'NodeStatus', 'SUCCESS'), port('value', 'output', 'string')]),
	model('LoopInt', 'decorator', [port('queue', 'inout'), port('if_empty', 'input', 'NodeStatus', 'SUCCESS'), port('value', 'output', 'int')]),
	model('LoopBool', 'decorator', [port('queue', 'inout'), port('if_empty', 'input', 'NodeStatus', 'SUCCESS'), port('value', 'output', 'bool')]),
	model('EntryUpdatedDecorator', 'decorator', [port('entry', 'input')]),

	model('AlwaysSuccess', 'action', [], { description: 'Return SUCCESS.' }),
	model('AlwaysFailure', 'action', [], { description: 'Return FAILURE.' }),
	model('SetBlackboard', 'action', [port('value', 'input'), port('output_key', 'output')], { description: 'Write a value to the Blackboard.' }),
	model('UnsetBlackboard', 'action', [port('key', 'input', 'string')], { description: 'Remove a Blackboard entry.' }),
	model('Script', 'action', [port('code', 'input', 'string')], { description: 'Run a scripting expression.' }),
	model('Sleep', 'action', [port('msec', 'input', 'unsigned', '0')], { description: 'Sleep for a duration.' }),
	model('TestNode', 'action', [port('return_status', 'input', 'NodeStatus', 'SUCCESS')]),
	model('PopFromQueue', 'action', [port('queue', 'inout'), port('popped_item', 'output')]),
	model('QueueSize', 'action', [port('queue', 'inout'), port('size', 'output', 'int')]),

	model('ScriptCondition', 'condition', [port('code', 'input', 'string')], { description: 'Evaluate a scripting expression.' }),
	model('WasEntryUpdated', 'condition', [port('entry', 'input')]),
	model('EntryUpdatedAction', 'action', [port('entry', 'input')]),

	model('SubTree', 'subtree', [port('_autoremap', 'input', 'bool', 'false')], { description: 'Tick another tree of this file.' }),
]

const BUILTIN_BY_ID = new Map(BT_BUILTIN_MODELS.map((entry) => [entry.id, entry]))
/** The explicit tags: `<Action ID="Foo">` rather than `<Foo>`. */
const EXPLICIT_TAGS: Record<string, BtNodeKind> = {
	Action: 'action',
	Condition: 'condition',
	Control: 'control',
	Decorator: 'decorator',
	SubTree: 'subtree',
}
/** Attributes that are never ports. `_` is reserved by BT.CPP for pre/post conditions. */
export function isReservedAttribute(name: string): boolean {
	return name === 'name' || name === 'ID' || name.startsWith('_')
}

/* ------------------------------ occurrences ------------------------------ */

export interface BtPortBinding {
	name: string
	value: string
	direction: BtPortDirection | 'unknown'
	/** The Blackboard key this port is remapped to, or null for a literal. */
	key: string | null
	/** True when the key is spelled `{@key}`: the root scope, not this tree's. */
	global: boolean
	type: string
}

export interface BtNode {
	/** `0` is the root; `0.2.1` is the second child of the third child of the root. */
	path: string
	parentPath: string | null
	index: number
	depth: number
	tag: string
	/** Registration ID — the tag in compact form, the `ID` attribute in explicit form. */
	id: string
	kind: BtNodeKind
	controlKind: BtControlKind | null
	/** The `name` attribute: a person's label for this occurrence, or ''. */
	name: string
	/** What the canvas writes on the card: the name, else the ID. */
	label: string
	attrs: Array<[string, string]>
	ports: BtPortBinding[]
	/** Reserved `_…` attributes: pre/post-conditions, description, autoremap. */
	reserved: Array<[string, string]>
	children: BtNode[]
	/** The tree a SubTree occurrence ticks. */
	subtreeId: string | null
	explicit: boolean
	model: BtNodeModel | null
}

export interface BtTree {
	id: string
	root: BtNode | null
	/** Every node in preorder — the order the XML lists them. */
	nodes: BtNode[]
}

export interface BtDiagnostic {
	severity: 'error' | 'warning'
	message: string
	path?: string
	treeId?: string
}

export interface BtDocument {
	xml: XmlDocument
	formatVersion: string
	mainTreeId: string
	trees: BtTree[]
	/** TreeNodesModel declarations plus BT.CPP's built-ins. */
	models: BtNodeModel[]
	diagnostics: BtDiagnostic[]
	/** Set when the source could not be read at all. */
	parseError: string | null
}

export function blackboardKeyOf(value: string): { key: string; global: boolean } | null {
	const trimmed = value.trim()
	if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null
	const inner = trimmed.slice(1, -1).trim()
	if (inner === '' || inner === '=') return null
	if (inner.startsWith('@')) return { key: inner.slice(1), global: true }
	return { key: inner, global: false }
}

function parseModels(root: XmlElement): { models: BtNodeModel[]; diagnostics: BtDiagnostic[] } {
	const diagnostics: BtDiagnostic[] = []
	const declared: BtNodeModel[] = []
	for (const modelsElement of root.children.filter((child) => child.tag === 'TreeNodesModel')) {
		for (const element of modelsElement.children) {
			const kind = EXPLICIT_TAGS[element.tag]
			const id = getAttr(element, 'ID')
			if (!kind || !id) {
				diagnostics.push({ severity: 'warning', message: `TreeNodesModel entry <${element.tag}> needs a kind tag and an ID` })
				continue
			}
			const ports: BtPortModel[] = []
			for (const child of element.children) {
				const direction = child.tag === 'input_port' ? 'input' : child.tag === 'output_port' ? 'output' : child.tag === 'inout_port' ? 'inout' : null
				if (!direction) continue
				ports.push(port(
					getAttr(child, 'name') ?? '',
					direction,
					getAttr(child, 'type') ?? '',
					getAttr(child, 'default') ?? '',
					child.text || (getAttr(child, 'description') ?? ''),
				))
			}
			const description = element.children.find((child) => child.tag === 'description')?.text ?? ''
			declared.push({ id, kind, ports, description, builtin: false, controlKind: kind === 'control' ? 'other' : undefined })
		}
	}
	const byId = new Map<string, BtNodeModel>()
	for (const entry of BT_BUILTIN_MODELS) byId.set(entry.id, entry)
	for (const entry of declared) byId.set(entry.id, entry)
	return { models: [...byId.values()], diagnostics }
}

function nodeKindFromShape(element: XmlElement): BtNodeKind {
	return EXPLICIT_TAGS[element.tag] ?? 'unknown'
}

function interpretNode(
	element: XmlElement,
	path: string,
	parentPath: string | null,
	index: number,
	depth: number,
	models: Map<string, BtNodeModel>,
	diagnostics: BtDiagnostic[],
	treeId: string,
	out: BtNode[],
): BtNode {
	const explicit = element.tag in EXPLICIT_TAGS && element.tag !== 'SubTree'
	const id = (explicit ? getAttr(element, 'ID') : element.tag === 'SubTree' ? 'SubTree' : element.tag) ?? ''
	const nodeModel = models.get(id) ?? null
	let kind: BtNodeKind = nodeModel?.kind ?? nodeKindFromShape(element)
	if (element.tag === 'SubTree') kind = 'subtree'
	if (explicit && !getAttr(element, 'ID')) {
		diagnostics.push({ severity: 'error', message: `<${element.tag}> needs an ID`, path, treeId })
	}
	if (kind === 'unknown') {
		diagnostics.push({
			severity: 'warning',
			message: element.children.length > 0
				? `${id} is not declared; drawn as a control node because it has children`
				: `${id} is not declared in TreeNodesModel; port directions are unknown`,
			path,
			treeId,
		})
	}
	const controlKind: BtControlKind | null = kind === 'control'
		? nodeModel?.controlKind ?? 'other'
		: kind === 'unknown' && element.children.length > 0 ? 'other' : null
	const name = getAttr(element, 'name') ?? ''
	const subtreeId = element.tag === 'SubTree' ? (getAttr(element, 'ID') ?? null) : null
	const ports: BtPortBinding[] = []
	const reserved: Array<[string, string]> = []
	for (const [attrName, value] of element.attrs) {
		if (attrName === 'name' || attrName === 'ID') continue
		if (attrName.startsWith('_')) {
			reserved.push([attrName, value])
			continue
		}
		const declared = nodeModel?.ports.find((candidate) => candidate.name === attrName)
		const key = blackboardKeyOf(value)
		ports.push({
			name: attrName,
			value,
			direction: declared?.direction ?? (element.tag === 'SubTree' ? 'inout' : 'unknown'),
			key: key?.key ?? null,
			global: key?.global ?? false,
			type: declared?.type ?? '',
		})
	}
	const node: BtNode = {
		path,
		parentPath,
		index,
		depth,
		tag: element.tag,
		id,
		kind,
		controlKind,
		name,
		label: name || subtreeId || id,
		attrs: element.attrs.map(([key, value]) => [key, value] as [string, string]),
		ports,
		reserved,
		children: [],
		subtreeId,
		explicit,
		model: nodeModel,
	}
	out.push(node)
	node.children = element.children.map((child, childIndex) => interpretNode(
		child,
		`${path}.${childIndex}`,
		path,
		childIndex,
		depth + 1,
		models,
		diagnostics,
		treeId,
		out,
	))
	if (kind === 'decorator' && node.children.length !== 1) {
		diagnostics.push({ severity: 'error', message: `${node.label} is a decorator and needs exactly one child`, path, treeId })
	}
	// RecoveryNode throws at runtime (BT::BehaviorTreeException) unless it has
	// exactly 2 children — a harder requirement than any other control node
	// here, so it gets its own check rather than a generic "control" rule.
	if (id === 'RecoveryNode' && node.children.length !== 2) {
		diagnostics.push({ severity: 'error', message: `${node.label} needs exactly 2 children: a primary step, then a recovery step`, path, treeId })
	}
	if ((kind === 'action' || kind === 'condition' || kind === 'subtree') && node.children.length > 0) {
		diagnostics.push({ severity: 'error', message: `${node.label} is a leaf and cannot have children`, path, treeId })
	}
	if (kind === 'control' && node.children.length === 0) {
		diagnostics.push({ severity: 'warning', message: `${node.label} has no children yet`, path, treeId })
	}
	return node
}

export function parseBehaviorTreeXml(source: string): BtDocument {
	let xml: XmlDocument
	try {
		xml = parseXml(source)
	} catch (error) {
		const message = error instanceof BtXmlError ? `${error.message} (at character ${error.offset})` : String(error)
		return {
			xml: { root: null, declaration: '' },
			formatVersion: '',
			mainTreeId: '',
			trees: [],
			models: [...BT_BUILTIN_MODELS],
			diagnostics: [{ severity: 'error', message }],
			parseError: message,
		}
	}
	const diagnostics: BtDiagnostic[] = []
	if (!xml.root) {
		return { xml, formatVersion: '', mainTreeId: '', trees: [], models: [...BT_BUILTIN_MODELS], diagnostics: [{ severity: 'error', message: 'The file has no <root> element' }], parseError: null }
	}
	if (xml.root.tag !== 'root') {
		diagnostics.push({ severity: 'error', message: `Expected <root>, found <${xml.root.tag}>` })
	}
	const formatVersion = getAttr(xml.root, 'BTCPP_format') ?? ''
	if (formatVersion !== '4') {
		diagnostics.push({ severity: 'warning', message: formatVersion ? `BTCPP_format ${formatVersion} is read as format 4` : 'BTCPP_format is missing; assuming 4' })
	}
	const modelsParsed = parseModels(xml.root)
	diagnostics.push(...modelsParsed.diagnostics)
	const models = new Map(modelsParsed.models.map((entry) => [entry.id, entry]))

	const trees: BtTree[] = []
	for (const treeElement of xml.root.children.filter((child) => child.tag === 'BehaviorTree')) {
		const id = getAttr(treeElement, 'ID') ?? ''
		if (!id) diagnostics.push({ severity: 'error', message: '<BehaviorTree> needs an ID' })
		if (treeElement.children.length > 1) {
			diagnostics.push({ severity: 'error', message: `BehaviorTree ${id} has ${treeElement.children.length} root nodes; only the first is drawn`, treeId: id })
		}
		const nodes: BtNode[] = []
		const root = treeElement.children.length > 0
			? interpretNode(treeElement.children[0], '0', null, 0, 0, models, diagnostics, id, nodes)
			: null
		trees.push({ id, root, nodes })
	}
	for (const tree of trees) {
		for (const node of tree.nodes) {
			if (node.subtreeId && !trees.some((candidate) => candidate.id === node.subtreeId)) {
				diagnostics.push({ severity: 'warning', message: `SubTree ${node.subtreeId} is not defined in this file`, path: node.path, treeId: tree.id })
			}
		}
	}
	const requestedMain = getAttr(xml.root, 'main_tree_to_execute') ?? ''
	const mainTreeId = trees.some((tree) => tree.id === requestedMain) ? requestedMain : trees[0]?.id ?? ''
	if (requestedMain && requestedMain !== mainTreeId) {
		diagnostics.push({ severity: 'warning', message: `main_tree_to_execute names ${requestedMain}, which does not exist` })
	}
	if (trees.length === 0) diagnostics.push({ severity: 'warning', message: 'No <BehaviorTree> in this file' })
	return { xml, formatVersion, mainTreeId, trees, models: modelsParsed.models, diagnostics, parseError: null }
}

export function selectTree(document: BtDocument, treeId: string): BtTree | null {
	return document.trees.find((tree) => tree.id === treeId) ?? document.trees.find((tree) => tree.id === document.mainTreeId) ?? document.trees[0] ?? null
}

export function findNode(tree: BtTree | null, path: string): BtNode | null {
	return tree?.nodes.find((node) => node.path === path) ?? null
}

export function isAncestorPath(ancestor: string, path: string): boolean {
	return path === ancestor || path.startsWith(`${ancestor}.`)
}

/* ---------------------------- structural edits ---------------------------- */

export interface BtInsertTemplate {
	/** Registration ID, e.g. `Sequence`, `MoveTo`, or a tree ID for a SubTree. */
	id: string
	kind: BtNodeKind
	name?: string
	attrs?: Record<string, string>
}

export type BtEditResult =
	| { ok: true; xml: string; path: string; remap: Record<string, string> }
	| { ok: false; reason: string }

interface TreeLocation {
	document: XmlDocument
	treeElement: XmlElement
	/** Declared kinds, so an edit refuses a child under a declared leaf. */
	declared: Map<string, BtNodeKind>
}

function locateTree(source: string, treeId: string): TreeLocation | string {
	let document: XmlDocument
	try {
		document = cloneXmlDocument(parseXml(source))
	} catch (error) {
		return error instanceof Error ? error.message : String(error)
	}
	if (!document.root) return 'The file has no <root> element'
	const trees = document.root.children.filter((child) => child.tag === 'BehaviorTree')
	const treeElement = trees.find((candidate) => getAttr(candidate, 'ID') === treeId) ?? trees[0]
	if (!treeElement) return 'The file has no <BehaviorTree>'
	const declared = new Map<string, BtNodeKind>()
	for (const entry of parseModels(document.root).models) declared.set(entry.id, entry.kind)
	return { document, treeElement, declared }
}

function elementAtPath(treeElement: XmlElement, path: string): { element: XmlElement; parent: XmlElement; index: number } | null {
	const indices = path.split('.').map((part) => Number.parseInt(part, 10))
	if (indices.length === 0 || indices.some((value) => !Number.isInteger(value) || value < 0)) return null
	let parent = treeElement
	for (let hop = 0; hop < indices.length; hop += 1) {
		const index = indices[hop]
		const next = parent.children[index]
		if (!next) return null
		if (hop === indices.length - 1) return { element: next, parent, index }
		parent = next
	}
	return null
}

export function templateElement(template: BtInsertTemplate): XmlElement {
	const attrs: Array<[string, string]> = []
	const compactAllowed = template.kind !== 'subtree' && /^[A-Za-z_][A-Za-z0-9_]*$/.test(template.id)
	let tag: string
	if (template.kind === 'subtree') {
		tag = 'SubTree'
		attrs.push(['ID', template.id])
	} else if (BUILTIN_BY_ID.has(template.id) || compactAllowed) {
		tag = template.id
	} else {
		tag = template.kind === 'action' ? 'Action' : template.kind === 'condition' ? 'Condition' : template.kind === 'decorator' ? 'Decorator' : 'Control'
		attrs.push(['ID', template.id])
	}
	if (template.name) attrs.push(['name', template.name])
	for (const [key, value] of Object.entries(template.attrs ?? {})) attrs.push([key, value])
	return { tag, attrs, children: [], text: '' }
}

/** Every path under `from` becomes the same path under `to`. */
function shiftPaths(remap: Record<string, string>, tree: XmlElement, prefixFrom: string, prefixTo: string, element: XmlElement) {
	remap[prefixFrom] = prefixTo
	element.children.forEach((child, index) => shiftPaths(remap, tree, `${prefixFrom}.${index}`, `${prefixTo}.${index}`, child))
}

function identityRemap(treeElement: XmlElement): Record<string, string> {
	const remap: Record<string, string> = {}
	treeElement.children.forEach((child, index) => shiftPaths(remap, treeElement, `${index}`, `${index}`, child))
	return remap
}

function finish(location: TreeLocation, path: string, remap: Record<string, string>): BtEditResult {
	return { ok: true, xml: serializeXml(location.document), path, remap }
}

/**
 * Insert a new node as child `index` of `parentPath`. An empty tree accepts a
 * root; a leaf root is first wrapped in a Sequence so the tree stays valid.
 */
export function insertBehaviorTreeNode(
	source: string,
	treeId: string,
	parentPath: string | null,
	index: number,
	template: BtInsertTemplate,
): BtEditResult {
	const location = locateTree(source, treeId)
	if (typeof location === 'string') return { ok: false, reason: location }
	const { treeElement } = location
	const fresh = templateElement(template)
	if (parentPath === null || treeElement.children.length === 0) {
		if (treeElement.children.length > 0) return { ok: false, reason: 'The tree already has a root; insert under it' }
		treeElement.children.push(fresh)
		return finish(location, '0', identityRemap(treeElement))
	}
	const located = elementAtPath(treeElement, parentPath)
	if (!located) return { ok: false, reason: `No node at ${parentPath}` }
	const parent = located.element
	const parentKind = kindOfElement(parent, location.declared)
	if (parentKind === 'decorator' && parent.children.length >= 1) {
		return { ok: false, reason: 'A decorator holds exactly one child; wrap or replace it instead' }
	}
	if (parentKind === 'control' && controlKindOfElement(parent) === 'recoveryLoop' && parent.children.length >= 2) {
		return { ok: false, reason: 'RecoveryNode holds exactly two children — a primary step and a recovery step' }
	}
	if (parentKind === 'action' || parentKind === 'condition' || parentKind === 'subtree') {
		return { ok: false, reason: `${labelOfElement(parent)} is a leaf; add the node beside it instead` }
	}
	const remap: Record<string, string> = {}
	const clamped = Math.max(0, Math.min(index, parent.children.length))
	parent.children.splice(clamped, 0, fresh)
	// Siblings after the insertion point shift by one.
	parent.children.forEach((child, childIndex) => {
		if (child === fresh) return
		const before = childIndex < clamped ? childIndex : childIndex - 1
		shiftPaths(remap, treeElement, `${parentPath}.${before}`, `${parentPath}.${childIndex}`, child)
	})
	return finish(location, `${parentPath}.${clamped}`, { ...identityRemapExcept(treeElement, parentPath), ...remap })
}

/** Insert beside a node: `after` false means before it. */
export function insertBehaviorTreeSibling(
	source: string,
	treeId: string,
	path: string,
	after: boolean,
	template: BtInsertTemplate,
): BtEditResult {
	const location = locateTree(source, treeId)
	if (typeof location === 'string') return { ok: false, reason: location }
	const located = elementAtPath(location.treeElement, path)
	if (!located) return { ok: false, reason: `No node at ${path}` }
	const atRoot = located.parent === location.treeElement
	// WHY: a plain "add another child here" only means "next step" under a
	// sequence-like parent. Under a Fallback/Parallel/IfThenElse — whose
	// children are alternatives or lanes, not steps — "insert a sibling
	// after X" wraps X in a Sequence first, the same way a sibling of the
	// root does, so a bare recovery-arm leaf (e.g. `CorrectGrip` under
	// `Fallback(GraspValid, CorrectGrip)`) becomes stackable instead of
	// silently turning into a third alternative arm. Zach's ruling
	// 2026-09-05: a Fallback's failure branch "just becomes another
	// sequential branch that you can begin to stack skills … on."
	const needsWrap = atRoot || !isSequenceLikeControlKind(controlKindOfElement(located.parent))
	if (needsWrap) {
		const wrapped = wrapBehaviorTreeNode(source, treeId, path, { id: 'Sequence', kind: 'control' })
		if (!wrapped.ok) return wrapped
		const result = insertBehaviorTreeNode(wrapped.xml, treeId, wrapped.path, after ? 1 : 0, template)
		if (!result.ok) return result
		return { ...result, remap: composeRemaps(wrapped.remap, result.remap) }
	}
	const parentPath = path.split('.').slice(0, -1).join('.')
	return insertBehaviorTreeNode(source, treeId, parentPath, located.index + (after ? 1 : 0), template)
}

function composeRemaps(first: Record<string, string>, second: Record<string, string>): Record<string, string> {
	const composed: Record<string, string> = {}
	for (const [from, mid] of Object.entries(first)) {
		const to = second[mid]
		if (to !== undefined) composed[from] = to
	}
	return composed
}

function identityRemapExcept(treeElement: XmlElement, parentPath: string): Record<string, string> {
	const remap = identityRemap(treeElement)
	for (const key of Object.keys(remap)) {
		if (key.startsWith(`${parentPath}.`)) delete remap[key]
	}
	return remap
}

export function deleteBehaviorTreeNode(source: string, treeId: string, path: string): BtEditResult {
	const location = locateTree(source, treeId)
	if (typeof location === 'string') return { ok: false, reason: location }
	const located = elementAtPath(location.treeElement, path)
	if (!located) return { ok: false, reason: `No node at ${path}` }
	const remap = identityRemap(location.treeElement)
	for (const key of Object.keys(remap)) {
		if (isAncestorPath(path, key)) delete remap[key]
	}
	located.parent.children.splice(located.index, 1)
	const parentPath = path.split('.').slice(0, -1).join('.')
	located.parent.children.forEach((child, childIndex) => {
		if (childIndex < located.index) return
		shiftPaths(remap, location.treeElement, `${parentPath}.${childIndex + 1}`, `${parentPath}.${childIndex}`, child)
	})
	return finish(location, parentPath, remap)
}

/** Put a new control or decorator around the node at `path`. */
export function wrapBehaviorTreeNode(source: string, treeId: string, path: string, template: BtInsertTemplate): BtEditResult {
	const location = locateTree(source, treeId)
	if (typeof location === 'string') return { ok: false, reason: location }
	if (template.kind !== 'control' && template.kind !== 'decorator') return { ok: false, reason: 'Only a control or decorator can wrap a node' }
	const located = elementAtPath(location.treeElement, path)
	if (!located) return { ok: false, reason: `No node at ${path}` }
	const wrapper = templateElement(template)
	wrapper.children.push(located.element)
	located.parent.children[located.index] = wrapper
	const remap = identityRemap(location.treeElement)
	for (const key of Object.keys(remap)) {
		if (isAncestorPath(path, key)) delete remap[key]
	}
	shiftPaths(remap, location.treeElement, path, `${path}.0`, located.element)
	return finish(location, path, remap)
}

/** Replace a decorator or control with its single child (the inverse of wrap). */
export function unwrapBehaviorTreeNode(source: string, treeId: string, path: string): BtEditResult {
	const location = locateTree(source, treeId)
	if (typeof location === 'string') return { ok: false, reason: location }
	const located = elementAtPath(location.treeElement, path)
	if (!located) return { ok: false, reason: `No node at ${path}` }
	if (located.element.children.length !== 1) return { ok: false, reason: 'Only a node with exactly one child can be unwrapped' }
	const child = located.element.children[0]
	located.parent.children[located.index] = child
	const remap = identityRemap(location.treeElement)
	for (const key of Object.keys(remap)) {
		if (isAncestorPath(path, key)) delete remap[key]
	}
	shiftPaths(remap, location.treeElement, `${path}.0`, path, child)
	return finish(location, path, remap)
}

/** Move a node to become child `index` of `targetParentPath`, keeping its subtree. */
export function moveBehaviorTreeNode(
	source: string,
	treeId: string,
	path: string,
	targetParentPath: string,
	index: number,
): BtEditResult {
	if (isAncestorPath(path, targetParentPath)) return { ok: false, reason: 'A node cannot move into itself' }
	const location = locateTree(source, treeId)
	if (typeof location === 'string') return { ok: false, reason: location }
	const located = elementAtPath(location.treeElement, path)
	if (!located) return { ok: false, reason: `No node at ${path}` }
	const target = elementAtPath(location.treeElement, targetParentPath)
	if (!target) return { ok: false, reason: `No node at ${targetParentPath}` }
	const targetKind = kindOfElement(target.element, location.declared)
	if (targetKind === 'action' || targetKind === 'condition' || targetKind === 'subtree') {
		return { ok: false, reason: `${labelOfElement(target.element)} is a leaf and cannot hold children` }
	}
	if (targetKind === 'decorator' && target.element.children.length >= 1 && target.element !== located.parent) {
		return { ok: false, reason: 'A decorator holds exactly one child' }
	}
	if (targetKind === 'control' && controlKindOfElement(target.element) === 'recoveryLoop' && target.element.children.length >= 2 && target.element !== located.parent) {
		return { ok: false, reason: 'RecoveryNode holds exactly two children — a primary step and a recovery step' }
	}
	// Identity, not arithmetic: record every element's path before the move,
	// mutate, record again, and the remap is the pairing.
	const pathsOf = (): Map<XmlElement, string> => {
		const paths = new Map<XmlElement, string>()
		const walk = (element: XmlElement, elementPath: string) => {
			paths.set(element, elementPath)
			element.children.forEach((child, childIndex) => walk(child, `${elementPath}.${childIndex}`))
		}
		location.treeElement.children.forEach((child, childIndex) => walk(child, `${childIndex}`))
		return paths
	}
	const before = pathsOf()
	const moving = located.element
	located.parent.children.splice(located.index, 1)
	// `index` is expressed as if the removal had not happened yet (that is what
	// lets a caller ask for "the position right after sibling K" using K's own
	// pre-move index, and what `nudgeBehaviorTreeOccurrence`'s `index + 2` for
	// "move later" relies on) — a same-parent forward move then shifts back by
	// one to land in the now-one-shorter array. WHY the clamp ceiling adds that
	// same +1 back for exactly this case: `target.element.children.length` is
	// already post-removal, so clamping a forward move against it first and
	// THEN subtracting one double-counts the removal and makes the true last
	// slot (splice at the post-removal length) unreachable by any `index` —
	// discovered by Tree view's drag-to-reorder wanting to drop a node after
	// the current last sibling of its own parent (see dragListReorder.test.ts).
	const sameParentForwardMove = located.parent === target.element && located.index < index
	const clampCeiling = target.element.children.length + (sameParentForwardMove ? 1 : 0)
	let insertAt = Math.max(0, Math.min(index, clampCeiling))
	if (sameParentForwardMove) insertAt = Math.max(0, insertAt - 1)
	target.element.children.splice(insertAt, 0, moving)
	const after = pathsOf()
	const remap: Record<string, string> = {}
	for (const [element, fromPath] of before) {
		const toPath = after.get(element)
		if (toPath !== undefined) remap[fromPath] = toPath
	}
	return finish(location, after.get(moving) ?? path, remap)
}

export function setBehaviorTreeNodeAttribute(source: string, treeId: string, path: string, name: string, value: string | null): BtEditResult {
	const location = locateTree(source, treeId)
	if (typeof location === 'string') return { ok: false, reason: location }
	const located = elementAtPath(location.treeElement, path)
	if (!located) return { ok: false, reason: `No node at ${path}` }
	if (value === null || (name === 'name' && value === '')) removeAttr(located.element, name)
	else setAttr(located.element, name, value)
	return finish(location, path, identityRemap(location.treeElement))
}

/** Rename a Blackboard key everywhere it is remapped in one tree. */
export function renameBehaviorTreeKey(source: string, treeId: string, from: string, to: string): BtEditResult {
	const location = locateTree(source, treeId)
	if (typeof location === 'string') return { ok: false, reason: location }
	if (!/^[A-Za-z_][A-Za-z0-9_./:-]*$/.test(to)) return { ok: false, reason: `${to} is not a valid key name` }
	const visit = (element: XmlElement) => {
		element.attrs = element.attrs.map(([name, value]) => {
			const key = blackboardKeyOf(value)
			if (key && key.key === from) return [name, key.global ? `{@${to}}` : `{${to}}`] as [string, string]
			return [name, value] as [string, string]
		})
		element.children.forEach(visit)
	}
	location.treeElement.children.forEach(visit)
	return finish(location, '0', identityRemap(location.treeElement))
}

function kindOfElement(element: XmlElement, declared: Map<string, BtNodeKind>): BtNodeKind {
	const explicit = EXPLICIT_TAGS[element.tag]
	if (explicit) return explicit
	const known = declared.get(element.tag) ?? BUILTIN_BY_ID.get(element.tag)?.kind
	if (known) return known
	return element.children.length > 0 ? 'control' : 'unknown'
}

/** Same lookup `interpretNode` uses to stamp a `BtNode.controlKind`, off a raw element. */
function controlKindOfElement(element: XmlElement): BtControlKind {
	const explicit = element.tag in EXPLICIT_TAGS && element.tag !== 'SubTree'
	const id = (explicit ? getAttr(element, 'ID') : element.tag) ?? element.tag
	return BUILTIN_BY_ID.get(id)?.controlKind ?? 'other'
}

/** Mirrors `processLayout.ts`'s `isSequenceLike`: children run as one chain, not as alternatives/lanes. */
function isSequenceLikeControlKind(kind: BtControlKind): boolean {
	return kind === 'sequence' || kind === 'other' || kind === 'switch'
}

function labelOfElement(element: XmlElement): string {
	return getAttr(element, 'name') ?? getAttr(element, 'ID') ?? element.tag
}

/* --------------------------------- seeds --------------------------------- */

/** The empty document a fresh region starts from. */
export function emptyBehaviorTreeXml(treeId = 'MainTree'): string {
	return `<root BTCPP_format="4" main_tree_to_execute="${treeId}">\n    <BehaviorTree ID="${treeId}"/>\n</root>\n`
}

/** The pick-and-place Zach drew on the wireframe board, as BT.CPP XML. */
export const SAMPLE_BEHAVIOR_TREE_XML = `<root BTCPP_format="4" main_tree_to_execute="PickAndPlace">
    <BehaviorTree ID="PickAndPlace">
        <Sequence name="Pick and place">
            <SubTree ID="MoveToObj" target="{object_pose}"/>
            <Fallback name="Grasp or correct">
                <GraspValid pose="{object_pose}" quality="{quality}"/>
                <CorrectGrip pose="{object_pose}" corrected="{object_pose}"/>
            </Fallback>
            <CloseGrip force="{grip_force}" state="{grip_state}"/>
            <MoveHome home="{home_pose}"/>
            <Parallel success_count="2">
                <CloseGrip force="{grip_force}" state="{grip_state}"/>
                <Sequence>
                    <CloseGrip force="{grip_force}" state="{grip_state}"/>
                    <MoveHome home="{home_pose}"/>
                </Sequence>
                <MoveHome home="{home_pose}"/>
            </Parallel>
        </Sequence>
    </BehaviorTree>
    <BehaviorTree ID="MoveToObj">
        <Sequence>
            <PlanPath target="{target}" path="{path}"/>
            <FollowPath path="{path}"/>
        </Sequence>
    </BehaviorTree>
    <TreeNodesModel>
        <Condition ID="GraspValid">
            <input_port name="pose" type="Pose"/>
            <output_port name="quality" type="double"/>
        </Condition>
        <Action ID="CorrectGrip">
            <input_port name="pose" type="Pose"/>
            <output_port name="corrected" type="Pose"/>
        </Action>
        <Action ID="CloseGrip">
            <input_port name="force" type="double" default="20"/>
            <output_port name="state" type="GripState"/>
        </Action>
        <Action ID="MoveHome">
            <input_port name="home" type="Pose"/>
        </Action>
        <Action ID="PlanPath">
            <input_port name="target" type="Pose"/>
            <output_port name="path" type="Path"/>
        </Action>
        <Action ID="FollowPath">
            <input_port name="path" type="Path"/>
        </Action>
        <SubTree ID="MoveToObj">
            <input_port name="target" type="Pose"/>
        </SubTree>
    </TreeNodesModel>
</root>
`

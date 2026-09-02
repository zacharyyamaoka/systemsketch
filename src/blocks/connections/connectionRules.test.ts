import { createShapeId, type Editor, type TLParentId, type TLShape, type TLShapeId } from 'tldraw'
import { describe, expect, it } from 'vitest'

import {
	getDefaultBlockProps,
	setBlockViewProps,
	type BlockShape,
	type BlockView,
} from '../blockModel'
import { portPolarity } from './connectionModel'
import { firstOuterPortForPolarity, judgeConnection, type ConnectionVerdict } from './connectionRules'
import { anchorFaceForScope, blockScopeId, pairBlockFaces } from './connectionScope'

/* ------------------------------ a tiny tree -------------------------------- */

function block(
	name: string,
	view: BlockView,
	parentId: TLParentId,
	ports: { inputs?: string[]; outputs?: string[] } = {},
): BlockShape {
	return {
		id: createShapeId(name),
		typeName: 'shape',
		type: 'block',
		x: 0,
		y: 0,
		rotation: 0,
		index: 'a1' as BlockShape['index'],
		parentId,
		isLocked: false,
		opacity: 1,
		meta: {},
		props: {
			...setBlockViewProps(getDefaultBlockProps(), view),
			title: name,
			inputs: (ports.inputs ?? ['in_1']).map((id) => ({ id, name: id, type: '', visible: true })),
			outputs: (ports.outputs ?? ['out_1']).map((id) => ({ id, name: id, type: '', visible: true })),
		},
	}
}

const PAGE = 'page:page' as TLParentId

/** The scope reader the rules need, over a list of shapes. No store, no DOM. */
function reader(shapes: TLShape[]): Editor {
	const byId = new Map(shapes.map((shape) => [shape.id, shape]))
	const resolve = (shape: TLShape | TLShapeId) => (typeof shape === 'string' ? byId.get(shape) : shape)
	return {
		getShape: (id: TLShapeId) => byId.get(id),
		getShapeParent: (shape: TLShape | TLShapeId) => {
			const resolved = resolve(shape)
			return resolved ? byId.get(resolved.parentId as TLShapeId) : undefined
		},
		getAncestorPageId: () => PAGE,
		store: undefined,
	} as unknown as Editor
}

const dot = (shape: BlockShape, portId: string) => ({ shapeId: shape.id, portId })

function describeVerdict(verdict: ConnectionVerdict) {
	if (!verdict.ok) return verdict.reason
	const name = (endpoint: { shapeId: TLShapeId; portId: string; face: string }) =>
		`${endpoint.shapeId.replace('shape:', '')}.${endpoint.portId}${endpoint.face === 'inner' ? '(inside)' : ''}`
	return `${name(verdict.source)} -> ${name(verdict.sink)}`
}

/* ------------------------------------------------------------------------- */

describe('portPolarity — the one table', () => {
	it('flips with the face: an inlet emits into its own inside, an outlet receives from it', () => {
		expect(portPolarity('output', 'outer')).toBe('source')
		expect(portPolarity('input', 'outer')).toBe('sink')
		expect(portPolarity('input', 'inner')).toBe('source')
		expect(portPolarity('output', 'inner')).toBe('sink')
	})
})

describe('scopes', () => {
	const run = block('run', 'expanded', PAGE)
	const decode = block('decode', 'port', run.id)
	const encode = block('encode', 'expanded', PAGE)
	const deep = block('deep', 'port', decode.id)
	const editor = reader([run, decode, encode, deep])

	it('reads a Block\'s scope as its nearest Block ancestor, else the page', () => {
		expect(blockScopeId(editor, run.id)).toBe(PAGE)
		expect(blockScopeId(editor, decode.id)).toBe(run.id)
		expect(blockScopeId(editor, deep.id)).toBe(decode.id)
	})

	it('pairs faces from the tree alone', () => {
		expect(pairBlockFaces(editor, run, encode)).toEqual({ a: 'outer', b: 'outer', scopeId: PAGE })
		expect(pairBlockFaces(editor, run, decode)).toEqual({ a: 'inner', b: 'outer', scopeId: run.id })
		expect(pairBlockFaces(editor, decode, run)).toEqual({ a: 'outer', b: 'inner', scopeId: run.id })
		expect(pairBlockFaces(editor, run, run)).toEqual({ a: 'inner', b: 'inner', scopeId: run.id })
		// A grandchild shares no scope with the outer boundary.
		expect(pairBlockFaces(editor, run, deep)).toBeNull()
		// A collapsed Block has no live inside to wire...
		expect(pairBlockFaces(editor, decode, deep)).toBeNull()
		// ...but a cable already welded there is still structurally sound.
		expect(pairBlockFaces(editor, decode, deep, { requireLive: false }))
			.toEqual({ a: 'inner', b: 'outer', scopeId: decode.id })
	})

	it('faces a loose cable end toward the scope under the pointer', () => {
		expect(anchorFaceForScope(editor, dot(run, 'out_1'), PAGE)).toBe('outer')
		expect(anchorFaceForScope(editor, dot(run, 'out_1'), run.id)).toBe('inner')
		expect(anchorFaceForScope(editor, dot(decode, 'out_1'), run.id)).toBe('outer')
		// Inside some OTHER frame is nowhere this dot can reach.
		expect(anchorFaceForScope(editor, dot(decode, 'out_1'), encode.id)).toBeNull()
		expect(anchorFaceForScope(editor, dot(run, 'out_1'), encode.id)).toBeNull()
		// A collapsed Block's inside is not a scope a new cable can enter.
		expect(anchorFaceForScope(editor, dot(decode, 'in_1'), decode.id)).toBeNull()
	})
})

describe('judgeConnection — the boundary truth table', () => {
	const run = block('run', 'expanded', PAGE)
	const decode = block('decode', 'port', run.id)
	const editor = reader([run, decode])

	it.each([
		['run.in_1', 'decode.in_1', 'run.in_1(inside) -> decode.in_1', 'the inlet feeds the inside'],
		['decode.out_1', 'run.out_1', 'decode.out_1 -> run.out_1(inside)', 'the inside returns through the outlet'],
		['decode.out_1', 'run.in_1', 'same-polarity', 'data leaving the box through its own inlet'],
		['run.out_1', 'decode.in_1', 'same-polarity', 'the outlet acting as a source for the inside'],
	])('%s -> %s is %s (%s)', (from, to, expected) => {
		const [fromBlock, fromPort] = from.split('.')
		const [toBlock, toPort] = to.split('.')
		const shapes = { run, decode }
		const verdict = judgeConnection(
			editor,
			dot(shapes[fromBlock as 'run' | 'decode'], fromPort),
			dot(shapes[toBlock as 'run' | 'decode'], toPort),
		)
		expect(describeVerdict(verdict)).toBe(expected)
	})

	it('reads the same answer from either end', () => {
		const forward = judgeConnection(editor, dot(run, 'in_1'), dot(decode, 'in_1'))
		const backward = judgeConnection(editor, dot(decode, 'in_1'), dot(run, 'in_1'))
		expect(describeVerdict(forward)).toBe(describeVerdict(backward))
	})
})

describe('judgeConnection — siblings and the same Block', () => {
	const encode = block('encode', 'expanded', PAGE)
	const merge = block('merge', 'expanded', PAGE, { inputs: ['in_1', 'in_2'], outputs: [] })
	const leaf = block('leaf', 'port', PAGE)
	const editor = reader([encode, merge, leaf])

	it('wires two Expanded siblings from either dot — the reported regression', () => {
		expect(describeVerdict(judgeConnection(editor, dot(encode, 'out_1'), dot(merge, 'in_1'))))
			.toBe('encode.out_1 -> merge.in_1')
		expect(describeVerdict(judgeConnection(editor, dot(merge, 'in_1'), dot(encode, 'out_1'))))
			.toBe('encode.out_1 -> merge.in_1')
	})

	it('refuses input to input and output to output between siblings', () => {
		expect(describeVerdict(judgeConnection(editor, dot(encode, 'in_1'), dot(merge, 'in_1'))))
			.toBe('same-polarity')
		expect(describeVerdict(judgeConnection(editor, dot(encode, 'out_1'), dot(leaf, 'out_1'))))
			.toBe('same-polarity')
	})

	it('lets an Expanded Block pass its inlet straight through to its outlet', () => {
		expect(describeVerdict(judgeConnection(editor, dot(encode, 'in_1'), dot(encode, 'out_1'))))
			.toBe('encode.in_1(inside) -> encode.out_1(inside)')
	})

	it('refuses a leaf Block feeding itself', () => {
		expect(describeVerdict(judgeConnection(editor, dot(leaf, 'out_1'), dot(leaf, 'in_1'))))
			.toBe('same-block')
	})

	it('refuses ports that do not exist or are hidden — unless the cable already exists', () => {
		expect(describeVerdict(judgeConnection(editor, dot(encode, 'out_9'), dot(merge, 'in_1'))))
			.toBe('missing-port')
		const hiddenIn = block('hidden', 'port', PAGE)
		hiddenIn.props.inputs[0] = { ...hiddenIn.props.inputs[0], visible: false }
		const withHidden = reader([encode, hiddenIn])
		expect(describeVerdict(judgeConnection(withHidden, dot(encode, 'out_1'), dot(hiddenIn, 'in_1'))))
			.toBe('hidden-port')
		expect(describeVerdict(judgeConnection(
			withHidden, dot(encode, 'out_1'), dot(hiddenIn, 'in_1'), { existing: true },
		))).toBe('encode.out_1 -> hidden.in_1')
	})

	it('applies the cycle exclusion between outer faces only', () => {
		const excludeBlocks = new Set([merge.id])
		expect(describeVerdict(judgeConnection(
			editor, dot(encode, 'out_1'), dot(merge, 'in_1'), { excludeBlocks },
		))).toBe('cycle')
		// A boundary cable can never be part of a flat loop.
		const run = block('run', 'expanded', PAGE)
		const child = block('child', 'port', run.id)
		const nested = reader([run, child])
		expect(describeVerdict(judgeConnection(
			nested, dot(run, 'in_1'), dot(child, 'in_1'), { excludeBlocks: new Set([child.id]) },
		))).toBe('run.in_1(inside) -> child.in_1')
	})

	it('names the scope a legal cable lives in', () => {
		const verdict = judgeConnection(editor, dot(encode, 'out_1'), dot(merge, 'in_1'))
		expect(verdict.ok && verdict.scopeId).toBe(PAGE)
		const inside = judgeConnection(editor, dot(encode, 'in_1'), dot(encode, 'out_1'))
		expect(inside.ok && inside.scopeId).toBe(encode.id)
	})
})

describe('the picker landing port', () => {
	it('lands a cable that needs a consumer on the first input, a producer on the first output', () => {
		const props = block('call', 'port', PAGE, { inputs: ['in_1', 'in_2'], outputs: ['out_1'] }).props
		expect(firstOuterPortForPolarity(props, 'sink')?.id).toBe('in_1')
		expect(firstOuterPortForPolarity(props, 'source')?.id).toBe('out_1')
		const source = block('source', 'port', PAGE, { inputs: [], outputs: ['out_1'] }).props
		expect(firstOuterPortForPolarity(source, 'sink')).toBeNull()
	})
})

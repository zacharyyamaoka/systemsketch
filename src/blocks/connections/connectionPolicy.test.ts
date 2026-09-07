import { createShapeId, type Editor, type TLParentId, type TLShape, type TLShapeId } from 'tldraw'
import { describe, expect, it } from 'vitest'

import {
	getDefaultBlockProps,
	setBlockViewProps,
	type BlockShape,
	type BlockView,
} from '../blockModel'
import { arePortTypesCompatible } from './connectionModel'
import { judgeConnection, type ConnectionVerdict } from './connectionRules'
import { nearestCommonParent, pairBlockFaces } from './connectionScope'
import {
	DEFAULT_EDGE_POLICY,
	edgePolicyPreset,
	type EdgePolicy,
} from '../../settings/edgePolicy'

/* ------------------------------ a tiny tree -------------------------------- */

interface PortSpec {
	id: string
	type?: string
	visible?: boolean
}

function block(
	name: string,
	view: BlockView,
	parentId: TLParentId,
	ports: { inputs?: PortSpec[]; outputs?: PortSpec[] } = {},
): BlockShape {
	const port = (spec: PortSpec) => ({
		id: spec.id,
		name: spec.id,
		type: spec.type ?? '',
		visible: spec.visible ?? true,
	})
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
			inputs: (ports.inputs ?? [{ id: 'in_1' }]).map(port),
			outputs: (ports.outputs ?? [{ id: 'out_1' }]).map(port),
		},
	}
}

const PAGE = 'page:page' as TLParentId
const OTHER_PAGE = 'page:other' as TLParentId

function reader(shapes: TLShape[], pageOf: (id: TLShapeId) => TLParentId = () => PAGE): Editor {
	const byId = new Map(shapes.map((shape) => [shape.id, shape]))
	const resolve = (shape: TLShape | TLShapeId) => (typeof shape === 'string' ? byId.get(shape) : shape)
	return {
		getShape: (id: TLShapeId) => byId.get(id),
		getShapeParent: (shape: TLShape | TLShapeId) => {
			const resolved = resolve(shape)
			return resolved ? byId.get(resolved.parentId as TLShapeId) : undefined
		},
		getAncestorPageId: (shape: TLShape | TLShapeId) =>
			pageOf(typeof shape === 'string' ? shape : shape.id),
		store: undefined,
	} as unknown as Editor
}

const dot = (shape: BlockShape, portId: string) => ({ shapeId: shape.id, portId })

function reason(verdict: ConnectionVerdict): string {
	return verdict.ok ? 'ok' : verdict.reason
}

const WHITEBOARD = edgePolicyPreset('whiteboard').policy
const GUIDED = edgePolicyPreset('guided').policy
const TYPED = edgePolicyPreset('typed').policy
const STRICT = edgePolicyPreset('strict').policy

/* ------------------------------- the ladder -------------------------------- */

describe('the whiteboard end: any port to any port', () => {
	// Two siblings, each with one input and one output.
	const left = block('left', 'port', PAGE)
	const right = block('right', 'port', PAGE)
	const editor = reader([left, right])

	it.each([
		['out_1', 'out_1', 'two outputs'],
		['in_1', 'in_1', 'two inputs'],
	])('wires %s to %s (%s), which Guided refuses', (fromPort, toPort) => {
		const pair = [dot(left, fromPort), dot(right, toPort)] as const
		expect(reason(judgeConnection(editor, ...pair, { policy: GUIDED }))).toBe('same-polarity')
		expect(reason(judgeConnection(editor, ...pair, { policy: WHITEBOARD }))).toBe('ok')
	})

	it('lets a Block wire to itself, and Strict does not', () => {
		const self = [dot(left, 'out_1'), dot(left, 'in_1')] as const
		expect(reason(judgeConnection(editor, ...self, { policy: WHITEBOARD }))).toBe('ok')
		expect(reason(judgeConnection(editor, ...self, { policy: GUIDED }))).toBe('ok')
		expect(reason(judgeConnection(editor, ...self, { policy: STRICT }))).toBe('self-connection')
	})

	it('wires a hidden port', () => {
		const withHidden = block('hidden', 'port', PAGE, { inputs: [{ id: 'in_1', visible: false }] })
		const local = reader([left, withHidden])
		const pair = [dot(left, 'out_1'), dot(withHidden, 'in_1')] as const
		expect(reason(judgeConnection(local, ...pair, { policy: GUIDED }))).toBe('hidden-port')
		expect(reason(judgeConnection(local, ...pair, { policy: WHITEBOARD }))).toBe('ok')
	})
})

describe('the black-box rule', () => {
	// `deep` is a grandchild of `run`; `outside` is `run`'s sibling. They share
	// no scope, so no boundary port stands between them.
	const run = block('run', 'expanded', PAGE)
	const decode = block('decode', 'expanded', run.id)
	const deep = block('deep', 'port', decode.id)
	const outside = block('outside', 'port', PAGE)
	const editor = reader([run, decode, deep, outside])

	it('refuses a grandchild reaching past its own boundary', () => {
		expect(reason(judgeConnection(editor, dot(deep, 'out_1'), dot(outside, 'in_1'), { policy: GUIDED })))
			.toBe('no-shared-scope')
	})

	it('allows it once the boundary permission is withdrawn', () => {
		const verdict = judgeConnection(
			editor,
			dot(deep, 'out_1'),
			dot(outside, 'in_1'),
			{ policy: { ...GUIDED, allowCrossBoundary: true } },
		)
		expect(reason(verdict)).toBe('ok')
		// Both ends take their outer face, and the cable takes a parent that
		// actually contains both — otherwise a frame would clip half of it.
		expect(verdict.ok && verdict.a.face).toBe('outer')
		expect(verdict.ok && verdict.b.face).toBe('outer')
		expect(verdict.ok && verdict.scopeId).toBe(PAGE)
	})

	it('takes the innermost frame holding both ends, not always the page', () => {
		// `deep` and `sibling` are both under `run`, at different depths.
		const sibling = block('sibling', 'port', run.id)
		const local = reader([run, decode, deep, sibling])
		const verdict = judgeConnection(
			local,
			dot(deep, 'out_1'),
			dot(sibling, 'in_1'),
			{ policy: { ...GUIDED, allowCrossBoundary: true } },
		)
		expect(verdict.ok && verdict.scopeId).toBe(run.id)
	})

	it('still refuses two Blocks on different pages, under every policy', () => {
		const here = block('here', 'port', PAGE)
		const there = block('there', 'port', OTHER_PAGE)
		const local = reader([here, there], (id) => (id === there.id ? OTHER_PAGE : PAGE))
		expect(reason(judgeConnection(local, dot(here, 'out_1'), dot(there, 'in_1'), { policy: WHITEBOARD })))
			.toBe('no-shared-scope')
	})

	it('leaves the ordinary parent/child pairing untouched when crossing is allowed', () => {
		// A permission that only fires as a FALLBACK: an inner/outer pair that
		// already had an answer must keep it, or enabling the toggle would
		// quietly reface every boundary cable on the board.
		expect(pairBlockFaces(reader([run, decode]), run, decode, { crossBoundary: true }))
			.toEqual({ a: 'inner', b: 'outer', scopeId: run.id })
	})

	it('nearestCommonParent finds the innermost frame holding both', () => {
		expect(nearestCommonParent(editor, deep, outside)).toBe(PAGE)
		// A shape is not its own parent, so `deep` inside `decode` still meets it
		// in `run` — the frame that holds them BOTH. That is the property the
		// cable needs: taking `decode` would put the cable inside one of its own
		// endpoints, which is not a container relationship tldraw can draw.
		expect(nearestCommonParent(editor, deep, decode)).toBe(run.id)
	})
})

describe('data types', () => {
	const producer = block('producer', 'port', PAGE, { outputs: [{ id: 'out_1', type: 'Pose' }] })
	const poseConsumer = block('pose', 'port', PAGE, { inputs: [{ id: 'in_1', type: ' pose ' }] })
	const bytesConsumer = block('bytes', 'port', PAGE, { inputs: [{ id: 'in_1', type: 'bytes' }] })
	const anyConsumer = block('any', 'port', PAGE, { inputs: [{ id: 'in_1', type: 'Any' }] })
	const untypedConsumer = block('untyped', 'port', PAGE, { inputs: [{ id: 'in_1' }] })
	const editor = reader([producer, poseConsumer, bytesConsumer, anyConsumer, untypedConsumer])

	const judge = (consumer: BlockShape, policy: EdgePolicy) =>
		reason(judgeConnection(editor, dot(producer, 'out_1'), dot(consumer, 'in_1'), { policy }))

	it('is not policed at all when matching is off', () => {
		expect(judge(bytesConsumer, GUIDED)).toBe('ok')
	})

	it('refuses a real mismatch once matching is on', () => {
		expect(judge(bytesConsumer, TYPED)).toBe('type-mismatch')
		expect(judge(bytesConsumer, STRICT)).toBe('type-mismatch')
	})

	it('reads Pose and " pose " as the same type', () => {
		expect(judge(poseConsumer, TYPED)).toBe('ok')
		expect(judge(poseConsumer, STRICT)).toBe('ok')
	})

	it('lets a wildcard meet anything', () => {
		expect(judge(anyConsumer, STRICT)).toBe('ok')
	})

	it('treats an undeclared type as a wildcard in Lenient and a gap in Strict', () => {
		expect(judge(untypedConsumer, TYPED)).toBe('ok')
		expect(judge(untypedConsumer, STRICT)).toBe('untyped-port')
	})

	it('compares types directly, so the seam is testable without a board', () => {
		expect(arePortTypesCompatible('bytes', 'Pose', 'off')).toBe('ok')
		expect(arePortTypesCompatible('bytes', 'Pose', 'lenient')).toBe('mismatch')
		expect(arePortTypesCompatible('', 'Pose', 'lenient')).toBe('ok')
		expect(arePortTypesCompatible('', 'Pose', 'strict')).toBe('untyped')
		expect(arePortTypesCompatible('*', 'Pose', 'strict')).toBe('ok')
		expect(arePortTypesCompatible('object', 'Pose', 'strict')).toBe('ok')
	})
})

describe('direction when polarity no longer decides', () => {
	const left = block('left', 'port', PAGE)
	const right = block('right', 'port', PAGE)
	const editor = reader([left, right])

	it('follows the drag: the anchored end is the source', () => {
		// WHY this matters: with the polarity rule withdrawn, two outputs can be
		// wired and the model has no opinion left about which way it points — so
		// the arrowhead has to land where the person let go.
		const verdict = judgeConnection(editor, dot(left, 'out_1'), dot(right, 'out_1'), { policy: WHITEBOARD })
		expect(verdict.ok && verdict.source.shapeId).toBe(left.id)
		expect(verdict.ok && verdict.sink.shapeId).toBe(right.id)

		const reversed = judgeConnection(editor, dot(right, 'out_1'), dot(left, 'out_1'), { policy: WHITEBOARD })
		expect(reversed.ok && reversed.source.shapeId).toBe(right.id)
	})

	it('still lets polarity decide whenever the two faces disagree', () => {
		// Dragged from the INPUT: the cable is drawn backwards, and the verdict
		// straightens it out. That is the existing contract, unchanged.
		const verdict = judgeConnection(editor, dot(left, 'in_1'), dot(right, 'out_1'), { policy: WHITEBOARD })
		expect(verdict.ok && verdict.source.shapeId).toBe(right.id)
		expect(verdict.ok && verdict.sink.shapeId).toBe(left.id)
	})
})

describe('cables already on the board are never re-judged', () => {
	const left = block('left', 'port', PAGE, { outputs: [{ id: 'out_1', type: 'Pose' }] })
	const right = block('right', 'port', PAGE, { inputs: [{ id: 'in_1', type: 'bytes' }] })
	const editor = reader([left, right])

	it('validates a stored type-mismatched cable even under Strict', () => {
		// Tightening the policy must not retroactively condemn a board authored
		// under a looser one — the policy governs what you can DRAW.
		expect(reason(judgeConnection(
			editor,
			dot(left, 'out_1'),
			dot(right, 'in_1'),
			{ existing: true, policy: STRICT },
		))).toBe('ok')
	})
})

describe('the default policy', () => {
	it('is Guided, so nothing changes for a board opened today', () => {
		expect(DEFAULT_EDGE_POLICY).toEqual(GUIDED)
	})

	it('is what the judge falls back to when no policy is named', () => {
		const left = block('left', 'port', PAGE)
		const right = block('right', 'port', PAGE)
		const editor = reader([left, right])
		expect(reason(judgeConnection(editor, dot(left, 'out_1'), dot(right, 'out_1'))))
			.toBe('same-polarity')
	})
})

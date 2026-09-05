import { describe, expect, it } from 'vitest'

import {
	PROJECTION_BLOCK_TYPE,
	UNKNOWN_TOKEN,
	UNRESOLVED_BLOCK_TYPE,
	getDefaultBlockProps,
	isAccessorName,
	isProjectionBlock,
	isUnknownPort,
	isUnknownText,
	isUnresolvedBlock,
	makeProjectionProps,
	normalizeAccessorName,
	type BlockShapeProps,
} from './blockModel'
import {
	markBlockUnresolvedProps,
	markPortUnknownProps,
	patchBlockPortProps,
	unknownPort,
} from './commands/blockCommands'
import { BLOCK_PICKER_PRESETS, blockPresetProps } from './connections/blockPicker'

function block(patch: Partial<BlockShapeProps> = {}): BlockShapeProps {
	return { ...getDefaultBlockProps(), ...patch }
}

describe('the unknown token', () => {
	it('is `?`, and blank is deliberately something else', () => {
		// Blank means nobody annotated the slot — roughly half the ports in the
		// pyblocks golden corpus. `?` means we looked and could not tell.
		expect(UNKNOWN_TOKEN).toBe('?')
		expect(isUnknownText('?')).toBe(true)
		expect(isUnknownText('  ?  ')).toBe(true)
		expect(isUnknownText('')).toBe(false)
		expect(isUnknownText(undefined)).toBe(false)
	})

	it('is not `Any`, which is a type a program can actually declare', () => {
		// golden 12 declares `Client = Any`. If unresolved rendered as `Any` the
		// board could not tell a declaration from a failure to resolve.
		expect(isUnknownText('Any')).toBe(false)
		expect(isUnknownPort({ id: 'in_1', name: 'client', type: 'Any', visible: true })).toBe(false)
	})

	it('reports a port whose name or type is unknown', () => {
		expect(isUnknownPort({ id: 'in_1', name: '?', type: 'bytes', visible: true })).toBe(true)
		expect(isUnknownPort({ id: 'in_1', name: 'payload', type: '?', visible: true })).toBe(true)
		expect(isUnknownPort({ id: 'in_1', name: 'payload', type: 'bytes', visible: true })).toBe(false)
	})
})

describe('marking a Block unresolved', () => {
	// What an unresolved call actually looks like: the receiver is annotated
	// where the call is WRITTEN, so it is known; the callee's parameter and
	// return are not, so those slots arrive empty.
	const call = block({
		title: 'client.send()',
		blockType: 'call',
		view: 'port',
		inputs: [
			{ id: 'in_1', name: 'self', type: 'Client', visible: true },
			{ id: 'in_2', name: '', type: '', visible: true },
		],
		outputs: [{ id: 'out_1', name: '', type: '', visible: true }],
	})

	it('says it once on the type line, and drops to Simple view', () => {
		const marked = markBlockUnresolvedProps(call)
		expect(marked.blockType).toBe(UNRESOLVED_BLOCK_TYPE)
		expect(isUnresolvedBlock(marked)).toBe(true)
		expect(marked.view).toBe('simple')
	})

	it('never erases a slot the call site already proves', () => {
		// `client.send` never resolves, and `self: Client` is still exactly right.
		const marked = markBlockUnresolvedProps(call)
		expect(marked.inputs[0]).toBe(call.inputs[0])
		expect(marked.inputs[0]).toMatchObject({ name: 'self', type: 'Client' })
	})

	it('fills an empty type slot, and never touches a name', () => {
		const marked = markBlockUnresolvedProps(call)
		expect(marked.inputs[1]).toMatchObject({ name: '', type: UNKNOWN_TOKEN })
		expect(marked.outputs[0]).toMatchObject({ name: '', type: UNKNOWN_TOKEN })
	})

	it('keeps the title and every port identity', () => {
		const marked = markBlockUnresolvedProps(call)
		expect(marked.title).toBe('client.send()')
		expect(marked.inputs.map((port) => port.id)).toEqual(['in_1', 'in_2'])
		expect(marked.outputs.map((port) => port.id)).toEqual(['out_1'])
	})

	it('keeps a half-known row half-known', () => {
		// A named parameter whose type nobody resolved keeps its name; only the
		// empty half is filled, so the row reads `payload ?`.
		const half = block({
			inputs: [{ id: 'in_1', name: 'payload', type: '', visible: true }],
			outputs: [],
		})
		expect(markBlockUnresolvedProps(half).inputs[0])
			.toMatchObject({ name: 'payload', type: UNKNOWN_TOKEN })
	})

	it('never infers a type from a neighbour', () => {
		const wired = block({
			inputs: [{ id: 'in_1', name: '', type: '', visible: true }],
			outputs: [{ id: 'out_1', name: '', type: '', visible: true }],
		})
		const marked = markBlockUnresolvedProps(wired)
		expect(JSON.stringify(marked)).not.toContain('bytes')
	})

	it('is idempotent, so a second mark is not an undo step', () => {
		const once = markBlockUnresolvedProps(call)
		expect(markBlockUnresolvedProps(once)).toBe(once)
	})

	it('marks one port explicitly when someone decides it, keeping its name', () => {
		// The Block command only fills what is empty; this is how a row that DOES
		// state a type becomes unknown — by decision, not assumption.
		const marked = markPortUnknownProps(call, 'inputs', 'in_1')
		expect(marked.inputs[0]).toMatchObject({ id: 'in_1', name: 'self', type: UNKNOWN_TOKEN })
		expect(markPortUnknownProps(marked, 'inputs', 'in_1')).toBe(marked)
	})

	it('never removes what the drawing already says', () => {
		expect(unknownPort({ id: 'in_1', name: 'payload', type: 'bytes', visible: true }))
			.toMatchObject({ name: 'payload', type: UNKNOWN_TOKEN })
	})

	it('does not police where a `?` may go — the canvas stays hackable', () => {
		// One `?` per row is the generator's convention, not a rule this layer
		// enforces. A hand-typed `?` in a NAME survives every command and still
		// reads as unknown.
		const byHand = block({
			inputs: [{ id: 'in_1', name: UNKNOWN_TOKEN, type: UNKNOWN_TOKEN, visible: true }],
			outputs: [],
		})
		expect(patchBlockPortProps(byHand, 'inputs', 'in_1', { name: UNKNOWN_TOKEN }))
			.toBe(byHand)
		expect(markBlockUnresolvedProps(byHand).inputs[0])
			.toMatchObject({ name: UNKNOWN_TOKEN, type: UNKNOWN_TOKEN })
		expect(isUnknownPort(byHand.inputs[0])).toBe(true)
	})
})

describe('accessor names', () => {
	it('leads with a dot, whether or not one was typed', () => {
		expect(normalizeAccessorName('pose')).toBe('.pose')
		expect(normalizeAccessorName('.pose')).toBe('.pose')
		expect(normalizeAccessorName('  shape ')).toBe('.shape')
	})

	it('keeps a chain as one row', () => {
		// `.var.foo.bar` is one read of one member of a member. Splitting it into
		// a Block per link is what gets out of hand.
		expect(normalizeAccessorName('var.foo.bar')).toBe('.var.foo.bar')
		expect(normalizeAccessorName('.pose.translation.x')).toBe('.pose.translation.x')
		expect(isAccessorName('.pose.translation.x')).toBe(true)
	})

	it('leaves an index and the unknown token alone', () => {
		expect(normalizeAccessorName('[0]')).toBe('[0]')
		expect(isAccessorName('[0]')).toBe(true)
		expect(normalizeAccessorName('?')).toBe('?')
		expect(normalizeAccessorName('')).toBe('')
	})

	it('is applied wherever a projection row is renamed', () => {
		const projection = block({
			blockType: PROJECTION_BLOCK_TYPE,
			outputs: [{ id: 'out_1', name: '.', type: '', visible: true }],
		})
		const renamed = patchBlockPortProps(projection, 'outputs', 'out_1', { name: 'object_id' })
		expect(renamed.outputs[0].name).toBe('.object_id')
	})

	it('does not touch an ordinary Block, whose rows are parameters not members', () => {
		const call = block({
			blockType: 'call',
			outputs: [{ id: 'out_1', name: 'out_1', type: '', visible: true }],
		})
		const renamed = patchBlockPortProps(call, 'outputs', 'out_1', { name: 'payload' })
		expect(renamed.outputs[0].name).toBe('payload')
	})
})

describe('the projection Block', () => {
	it('takes the incoming type as its title, because the rows are facts about that type', () => {
		const fresh = block({
			blockType: PROJECTION_BLOCK_TYPE,
			inputs: [{ id: 'in_1', name: '', type: '', visible: true }],
		})
		const derived = makeProjectionProps(fresh, 'ObjectRecord')
		expect(derived.title).toBe('ObjectRecord')
		expect(derived.inputs[0]).toMatchObject({ id: 'in_1', name: '', type: 'ObjectRecord' })
		expect(isProjectionBlock(derived)).toBe(true)
		expect(isProjectionBlock(block({ blockType: 'projection' }))).toBe(true)
		expect(isProjectionBlock(block({ blockType: 'split' }))).toBe(false)
	})

	it('fills what is empty and never overwrites what someone authored', () => {
		// The whiteboard stays dumb: it may carry across a fact the cable states,
		// but it does not get to correct the drawing on a rewire.
		const authored = block({
			blockType: PROJECTION_BLOCK_TYPE,
			title: 'the record',
			inputs: [{ id: 'in_1', name: 'record', type: 'Legacy', visible: true }],
		})
		const after = makeProjectionProps(authored, 'ObjectRecord')
		expect(after).toBe(authored)
	})

	it('takes no type at all from an empty cable', () => {
		const fresh = block({ blockType: PROJECTION_BLOCK_TYPE })
		expect(makeProjectionProps(fresh, '   ')).toBe(fresh)
	})

	it('is idempotent for a type it already carries', () => {
		const settled = makeProjectionProps(block({ blockType: PROJECTION_BLOCK_TYPE }), 'Response')
		expect(makeProjectionProps(settled, 'Response')).toBe(settled)
	})

	it('is offered by the connection-drop picker as Unbundle', () => {
		const preset = BLOCK_PICKER_PRESETS.find((entry) => entry.id === 'projection')
		expect(preset).toBeDefined()
		expect(preset?.label).toBe('Unbundle')
		expect(preset?.blockType).toBe(PROJECTION_BLOCK_TYPE)
		expect(preset?.view).toBe('port')
	})

	it('arrives with an unnamed inlet and one untyped accessor row', () => {
		const preset = BLOCK_PICKER_PRESETS.find((entry) => entry.id === 'projection')!
		const props = blockPresetProps(preset, getDefaultBlockProps())
		expect(props.inputs).toHaveLength(1)
		expect(props.inputs[0].name).toBe('')
		expect(props.outputs).toHaveLength(1)
		expect(props.outputs[0].name).toBe('.')
		// A member read off a known type is assumed to decompose properly, so
		// there is nothing here the analyzer failed at — no `?`.
		expect(props.outputs[0].type).toBe('')
	})
})

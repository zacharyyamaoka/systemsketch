import {
	createShapeId,
	type Editor,
	type TLPage,
	type TLPageId,
	type TLParentId,
	type TLShape,
	type TLShapeId,
} from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

import {
	getDefaultBlockProps,
	type BlockPort,
	type BlockShape,
} from '../blocks/blockModel'
import type { PortHostShape } from '../blocks/connections/blockPorts'
import type { ConnectionBinding } from '../blocks/connections/ConnectionBindingUtil'
import type { ConnectionShape } from '../blocks/connections/ConnectionShapeUtil'
import { getDefaultBranchProps, type BranchShape } from '../branch/branchModel'
import { createValueBlockProps } from '../blocks/valueBlock'
import {
	BOARD_DIAGNOSTIC_CODES,
	focusBoardDiagnostic,
	getBoardDiagnosticsModel,
	type BoardDiagnostic,
} from './diagnosticsModel'

const PAGE_A = 'page:architecture' as TLPageId
const PAGE_B = 'page:runtime' as TLPageId

function port(
	id: string,
	name: string,
	defaultValue = '',
): BlockPort {
	return { id, name, type: '', visible: true, defaultValue }
}

function block(
	id: string,
	options: {
		title?: string
		inputs?: BlockPort[]
		outputs?: BlockPort[]
		pageId?: TLPageId
		index?: string
	} = {},
): BlockShape {
	return {
		id: createShapeId(id),
		typeName: 'shape',
		type: 'block',
		x: 0,
		y: 0,
		rotation: 0,
		index: (options.index ?? 'a1') as BlockShape['index'],
		parentId: options.pageId ?? PAGE_A,
		isLocked: false,
		opacity: 1,
		meta: {},
		props: {
			...getDefaultBlockProps(),
			title: options.title ?? id,
			inputs: options.inputs ?? [],
			outputs: options.outputs ?? [],
		},
	}
}

function branch(
	id: string,
	options: {
		title?: string
		controls?: BranchShape['props']['controls']
		pageId?: TLPageId
		index?: string
	} = {},
): BranchShape {
	return {
		id: createShapeId(id),
		typeName: 'shape',
		type: 'branch',
		x: 0,
		y: 0,
		rotation: 0,
		index: (options.index ?? 'a2') as BranchShape['index'],
		parentId: options.pageId ?? PAGE_A,
		isLocked: false,
		opacity: 1,
		meta: {},
		props: {
			...getDefaultBranchProps(),
			title: options.title ?? id,
			controls: options.controls ?? [],
		},
	}
}

function connection(id: string, pageId: TLPageId = PAGE_A, index = 'a8'): ConnectionShape {
	return {
		id: createShapeId(id),
		typeName: 'shape',
		type: 'connection',
		x: 0,
		y: 0,
		rotation: 0,
		index: index as ConnectionShape['index'],
		parentId: pageId,
		isLocked: false,
		opacity: 1,
		meta: {},
		props: {
			start: { x: 0, y: 0 },
			end: { x: 100, y: 0 },
			routing: 'elbow',
			curve: null,
			pins: [],
			elbowRoute: null,
			temporal: 'data',
			delayValue: '',
			pillPosition: 0.5,
		},
	}
}

function binding(
	connectionShape: ConnectionShape,
	hostShape: PortHostShape,
	portId: string,
	terminal: 'start' | 'end',
): ConnectionBinding {
	return {
		id: `binding:${connectionShape.id}:${terminal}` as ConnectionBinding['id'],
		typeName: 'binding',
		type: 'connection',
		fromId: connectionShape.id,
		toId: hostShape.id,
		meta: {},
		props: { portId, terminal, face: 'outer' },
	}
}

function wired(
	id: string,
	source: PortHostShape,
	sourcePort: string,
	sink: PortHostShape,
	sinkPort: string,
	index?: string,
): { shape: ConnectionShape; bindings: ConnectionBinding[] } {
	const shape = connection(id, PAGE_A, index)
	return {
		shape,
		bindings: [
			binding(shape, source, sourcePort, 'start'),
			binding(shape, sink, sinkPort, 'end'),
		],
	}
}

interface DiagnosticEditorFixture {
	editor: Editor
	setCurrentPage: ReturnType<typeof vi.fn>
	setCurrentTool: ReturnType<typeof vi.fn>
	select: ReturnType<typeof vi.fn>
	zoomToSelection: ReturnType<typeof vi.fn>
}

function diagnosticEditor(
	shapes: TLShape[],
	bindings: ConnectionBinding[] = [],
): DiagnosticEditorFixture {
	const pages = [
		{ id: PAGE_A, name: 'Architecture', index: 'a1' },
		{ id: PAGE_B, name: 'Runtime', index: 'a2' },
	] as TLPage[]
	const byId = new Map(shapes.map((shape) => [shape.id, shape]))
	const pageOf = (shapeOrId: TLShape | TLShapeId): TLPageId | undefined => {
		let shape = typeof shapeOrId === 'string' ? byId.get(shapeOrId) : shapeOrId
		const seen = new Set<TLShapeId>()
		while (shape && !String(shape.parentId).startsWith('page:')) {
			if (seen.has(shape.id)) return undefined
			seen.add(shape.id)
			shape = byId.get(shape.parentId as TLShapeId)
		}
		return shape?.parentId as TLPageId | undefined
	}
	const setCurrentPage = vi.fn()
	const setCurrentTool = vi.fn()
	const select = vi.fn()
	const zoomToSelection = vi.fn()
	const editor = {
		getPages: () => pages,
		getPage: (id: TLPageId) => pages.find((page) => page.id === id),
		getPageShapeIds: (page: TLPage | TLPageId) => {
			const id = typeof page === 'string' ? page : page.id
			return new Set(shapes.filter((shape) => pageOf(shape) === id).map((shape) => shape.id))
		},
		getShape: (id: TLShapeId) => byId.get(id),
		getShapeParent: (shapeOrId: TLShape | TLShapeId) => {
			const shape = typeof shapeOrId === 'string' ? byId.get(shapeOrId) : shapeOrId
			return shape ? byId.get(shape.parentId as TLShapeId) : undefined
		},
		getAncestorPageId: (shapeOrId: TLShape | TLShapeId) => pageOf(shapeOrId),
		getBindingsFromShape: (id: TLShapeId, type: string) => bindings.filter((record) => (
			record.fromId === id && record.type === type
		)),
		setCurrentPage,
		setCurrentTool,
		select,
		zoomToSelection,
	} as unknown as Editor
	return { editor, setCurrentPage, setCurrentTool, select, zoomToSelection }
}

describe('board diagnostics model', () => {
	it('treats a standalone Value Pill inlet as optional', () => {
		const base = block('literal')
		const literal: BlockShape = {
			...base,
			props: createValueBlockProps(getDefaultBlockProps(), '2.0'),
		}
		const { editor } = diagnosticEditor([literal])

		expect(getBoardDiagnosticsModel(editor).diagnostics).toEqual([])
	})

	it('reports Block identity, lane ambiguity, and unresolved inputs deterministically', () => {
		const malformed = block('malformed', {
			title: ' ',
			inputs: [port('duplicate', 'Value'), port('duplicate', ' value ')],
			outputs: [port('duplicate', 'Result')],
		})
		const complete = block('complete', {
			title: 'Complete',
			inputs: [port('in_default', 'Configured', '42')],
			pageId: PAGE_B,
		})
		const { editor } = diagnosticEditor([complete, malformed])

		const first = getBoardDiagnosticsModel(editor)
		const second = getBoardDiagnosticsModel(editor)
		expect(second).toEqual(first)
		expect(first.counts).toEqual({ total: 3, error: 1, warning: 2, info: 0 })
		expect(first.pages.map((page) => page.pageName)).toEqual(['Architecture'])
		expect(first.diagnostics.map(({ code }) => code)).toEqual([
			BOARD_DIAGNOSTIC_CODES.duplicatePortId,
			BOARD_DIAGNOSTIC_CODES.blankBlockTitle,
			BOARD_DIAGNOSTIC_CODES.duplicatePortName,
		])
		expect(new Set(first.diagnostics.map(({ id }) => id)).size).toBe(first.diagnostics.length)
		expect(first.diagnostics[0]).toMatchObject({
			severity: 'error',
			primaryShapeId: malformed.id,
			affectedIds: [malformed.id],
		})
	})

	it('counts one valid incoming cable and diagnoses a duplicate semantic pair', () => {
		const source = block('source', { outputs: [port('out', 'value')] })
		const sink = block('sink', { inputs: [port('in', 'value')] })
		const first = wired('cable-a', source, 'out', sink, 'in', 'a3')
		const second = wired('cable-b', source, 'out', sink, 'in', 'a4')
		const { editor } = diagnosticEditor(
			[source, sink, first.shape, second.shape],
			[...first.bindings, ...second.bindings],
		)

		const model = getBoardDiagnosticsModel(editor)
		expect(model.diagnostics).toHaveLength(1)
		expect(model.diagnostics[0]).toMatchObject({
			code: BOARD_DIAGNOSTIC_CODES.duplicateConnection,
			severity: 'warning',
			primaryShapeId: first.shape.id,
		})
		expect(model.diagnostics[0].affectedIds).toEqual(expect.arrayContaining([
			source.id,
			sink.id,
			first.shape.id,
			second.shape.id,
		]))
		expect(model.diagnostics.some(({ code }) => code === BOARD_DIAGNOSTIC_CODES.unsatisfiedInput))
			.toBe(false)
	})

	it('resolves Branch control ports as semantic endpoints', () => {
		const source = block('source', {
			title: 'Input data',
			outputs: [port('out', 'payload')],
		})
		const decision = branch('decision', {
			title: 'Retry policy',
			controls: [{ id: 'condition', name: 'should retry', type: 'boolean' }],
		})
		const first = wired('branch-cable-a', source, 'out', decision, 'condition', 'a3')
		const second = wired('branch-cable-b', source, 'out', decision, 'condition', 'a4')
		const { editor } = diagnosticEditor(
			[source, decision, first.shape, second.shape],
			[...first.bindings, ...second.bindings],
		)

		const model = getBoardDiagnosticsModel(editor)
		expect(model.diagnostics).toHaveLength(1)
		expect(model.diagnostics[0]).toMatchObject({
			code: BOARD_DIAGNOSTIC_CODES.duplicateConnection,
			message: 'Duplicate cable: Input data · payload → Retry policy · should retry',
		})
		expect(model.diagnostics[0].affectedIds).toEqual(expect.arrayContaining([
			source.id,
			decision.id,
			first.shape.id,
			second.shape.id,
		]))
	})

	it('does not turn a normal one-ended connection gesture into a problem', () => {
		const sink = block('sink', { inputs: [port('in', 'value')] })
		const loose = connection('loose')
		const end = binding(loose, sink, 'in', 'end')
		const { editor } = diagnosticEditor([sink, loose], [end])

		const model = getBoardDiagnosticsModel(editor)
		expect(model.counts.total).toBe(0)
	})

	it('reports a complete imported outer-face cycle once without claiming type errors', () => {
		const alpha = block('alpha', { inputs: [port('in', 'in')], outputs: [port('out', 'out')] })
		const beta = block('beta', { inputs: [port('in', 'in')], outputs: [port('out', 'out')] })
		const gamma = block('gamma', { inputs: [port('in', 'in')], outputs: [port('out', 'out')] })
		const ab = wired('ab', alpha, 'out', beta, 'in')
		const bg = wired('bg', beta, 'out', gamma, 'in')
		const ga = wired('ga', gamma, 'out', alpha, 'in')
		const { editor } = diagnosticEditor(
			[alpha, beta, gamma, ab.shape, bg.shape, ga.shape],
			[...ab.bindings, ...bg.bindings, ...ga.bindings],
		)

		const model = getBoardDiagnosticsModel(editor)
		expect(model.counts).toEqual({ total: 1, error: 1, warning: 0, info: 0 })
		expect(model.diagnostics[0]).toMatchObject({
			code: BOARD_DIAGNOSTIC_CODES.dataflowCycle,
			severity: 'error',
			message: 'Imported dataflow cycle across 3 Blocks',
		})
		expect(model.diagnostics[0].affectedIds).toHaveLength(6)
		expect(model.diagnostics[0].detail).not.toContain('type')
	})
})

describe('diagnostic navigation', () => {
	it('switches page, selects live implicated shapes, and fits them with stock camera APIs', () => {
		const primary = block('primary', { pageId: PAGE_B })
		const related = block('related', { pageId: PAGE_B })
		const fixture = diagnosticEditor([primary, related])
		const diagnostic: BoardDiagnostic = {
			id: 'systemsketch:test',
			code: BOARD_DIAGNOSTIC_CODES.dataflowCycle,
			severity: 'error',
			message: 'Test',
			detail: 'Test diagnostic',
			pageId: PAGE_B,
			primaryShapeId: primary.id,
			affectedIds: [related.id, primary.id, 'shape:gone' as TLShapeId],
		}

		expect(focusBoardDiagnostic(fixture.editor, diagnostic)).toBe(true)
		expect(fixture.setCurrentPage).toHaveBeenCalledWith(PAGE_B)
		expect(fixture.setCurrentTool).toHaveBeenCalledWith('select')
		expect(fixture.select).toHaveBeenCalledWith(...[primary.id, related.id].sort())
		expect(fixture.zoomToSelection).toHaveBeenCalledWith({ animation: { duration: 220 } })
	})

	it('leaves the editor alone when the primary target has disappeared', () => {
		const fixture = diagnosticEditor([])
		const missing: BoardDiagnostic = {
			id: 'systemsketch:missing',
			code: BOARD_DIAGNOSTIC_CODES.blankBlockTitle,
			severity: 'warning',
			message: 'Gone',
			detail: 'Gone',
			pageId: PAGE_A,
			primaryShapeId: 'shape:gone' as TLShapeId,
			affectedIds: [],
		}
		expect(focusBoardDiagnostic(fixture.editor, missing)).toBe(false)
		expect(fixture.setCurrentPage).not.toHaveBeenCalled()
	})
})

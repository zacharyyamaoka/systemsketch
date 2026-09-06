import { describe, expect, it } from 'vitest'
import { createShapeId } from 'tldraw'

import {
	chooseCommunicationRepresentative,
	inspectCommunicationChannel,
	parseCommunicationChannel,
	selectedCommunicationGroupKey,
	type CommunicationDescriptor,
	type CommunicationFamily,
	type CommunicationPhase,
	type CommunicationSummary,
} from './communicationProjection'

const inferred = { provenance: 'strict-port-name' as const }

function descriptor(
	id: string,
	family: CommunicationFamily,
	phase: CommunicationPhase,
): CommunicationDescriptor {
	return {
		connectionId: createShapeId(id),
		family,
		phase,
		name: 'move',
		sourceShapeId: createShapeId('source'),
		targetShapeId: createShapeId('target'),
		sourcePortName: `move.${phase}`,
		targetPortName: `move.${phase}`,
		bidirectional: family === 'action' || family === 'service',
		groupKey: `${family}:move`,
		pairKey: 'source:target',
		...inferred,
	}
}

describe('communication channel parsing', () => {
	it('groups service request and response names under one relationship', () => {
		expect(parseCommunicationChannel('pose.query', 'pose.query')).toEqual({
			family: 'service', phase: 'request', name: 'pose', bidirectional: true, ...inferred,
		})
		expect(parseCommunicationChannel('pose.reply', 'pose.reply')).toEqual({
			family: 'service', phase: 'response', name: 'pose', bidirectional: true, ...inferred,
		})
	})

	it('recognizes all four action legs', () => {
		for (const phase of ['goal', 'cancel', 'feedback', 'result'] as const) {
			expect(parseCommunicationChannel(`move.${phase}`, `move.${phase}`)).toEqual({
				family: 'action', phase, name: 'move', bidirectional: true, ...inferred,
			})
		}
	})

	it('keeps streams distinct from ordinary topics', () => {
		expect(parseCommunicationChannel('camera.preview', 'preview')).toEqual({
			family: 'stream', phase: 'stream', name: 'camera', bidirectional: false, ...inferred,
		})
		expect(parseCommunicationChannel('detections', 'detections')).toEqual({
			family: 'topic', phase: 'publish', name: 'detections', bidirectional: false, ...inferred,
		})
	})

	it('does not invent a multi-leg association from a bare phase', () => {
		expect(parseCommunicationChannel('goal', 'goal')).toBeNull()
		expect(inspectCommunicationChannel('goal', 'goal').issue).toMatchObject({
			kind: 'missing-interaction-name',
		})
	})

	it('rejects disagreeing endpoint claims instead of grouping by accident', () => {
		expect(parseCommunicationChannel('move.goal', 'dock.goal')).toBeNull()
		expect(inspectCommunicationChannel('move.goal', 'dock.goal').issue).toMatchObject({
			kind: 'conflicting-endpoint-claims',
		})
	})

	it('keeps Action and Service namespaces distinct even when the stem matches', () => {
		expect(parseCommunicationChannel('status.goal', 'status.goal')).toMatchObject({
			family: 'action', name: 'status', phase: 'goal',
		})
		expect(parseCommunicationChannel('status.request', 'status.request')).toMatchObject({
			family: 'service', name: 'status', phase: 'request',
		})
	})
})

describe('communication focus selection', () => {
	const goal = createShapeId('goal')
	const result = createShapeId('result')
	const request = createShapeId('request')
	const response = createShapeId('response')
	const summary = {
		relations: [
			{ groupKey: 'action:move', memberIds: [goal, result] },
			{ groupKey: 'service:pose', memberIds: [request, response] },
		],
	} as unknown as CommunicationSummary

	it('keeps focus only while exactly one member of that relationship is selected', () => {
		expect(selectedCommunicationGroupKey(summary, [goal])).toBe('action:move')
		expect(selectedCommunicationGroupKey(summary, [response])).toBe('service:pose')
		expect(selectedCommunicationGroupKey(summary, [])).toBeNull()
		expect(selectedCommunicationGroupKey(summary, [createShapeId('unrelated')])).toBeNull()
		expect(selectedCommunicationGroupKey(summary, [goal, result])).toBeNull()
	})
})

describe('communication representative edge policy', () => {
	const goal = descriptor('goal', 'action', 'goal')
	const cancel = descriptor('cancel', 'action', 'cancel')
	const feedback = descriptor('feedback', 'action', 'feedback')
	const result = descriptor('result', 'action', 'result')
	const actionCandidates = [
		{ descriptor: goal, pathLength: 150 },
		{ descriptor: cancel, pathLength: 5 },
		{ descriptor: feedback, pathLength: 40 },
		{ descriptor: result, pathLength: 90 },
	]

	it('uses the explicitly requested Action phase', () => {
		expect(chooseCommunicationRepresentative('action', actionCandidates, 'feedback')).toBe(feedback)
		expect(chooseCommunicationRepresentative('action', actionCandidates, 'result')).toBe(result)
	})

	it('uses the initiating leg when an optional requested phase is absent', () => {
		expect(chooseCommunicationRepresentative(
			'action',
			actionCandidates.filter((candidate) => candidate.descriptor.phase !== 'feedback'),
			'feedback',
		)).toBe(goal)
	})

	it('measures shortest across work and outcome legs without letting Cancel win', () => {
		expect(chooseCommunicationRepresentative('action', actionCandidates, 'shortest')).toBe(feedback)
	})

	it('can choose the shorter Service response route', () => {
		const request = descriptor('request', 'service', 'request')
		const response = descriptor('response', 'service', 'response')
		expect(chooseCommunicationRepresentative('service', [
			{ descriptor: request, pathLength: 80 },
			{ descriptor: response, pathLength: 30 },
		], 'shortest')).toBe(response)
	})
})

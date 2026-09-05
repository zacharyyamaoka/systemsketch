import { describe, expect, it } from 'vitest'

import { inspectCommunicationChannel, parseCommunicationChannel } from './communicationProjection'

const inferred = { provenance: 'strict-port-name' as const }

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

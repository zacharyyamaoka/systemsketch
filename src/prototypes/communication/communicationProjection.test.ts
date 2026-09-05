import { describe, expect, it } from 'vitest'

import { parseCommunicationChannel } from './communicationProjection'

describe('communication channel parsing', () => {
	it('groups service request and response names under one relationship', () => {
		expect(parseCommunicationChannel('pose.query', 'pose.query')).toEqual({
			family: 'service', phase: 'request', name: 'pose', bidirectional: true,
		})
		expect(parseCommunicationChannel('pose.reply', 'pose.reply')).toEqual({
			family: 'service', phase: 'response', name: 'pose', bidirectional: true,
		})
	})

	it('recognizes all four action legs', () => {
		for (const phase of ['goal', 'cancel', 'feedback', 'result'] as const) {
			expect(parseCommunicationChannel(`move.${phase}`, `move.${phase}`)).toEqual({
				family: 'action', phase, name: 'move', bidirectional: true,
			})
		}
	})

	it('keeps streams distinct from ordinary topics', () => {
		expect(parseCommunicationChannel('camera.preview', 'preview')).toEqual({
			family: 'stream', phase: 'stream', name: 'camera', bidirectional: false,
		})
		expect(parseCommunicationChannel('detections', 'detections')).toEqual({
			family: 'topic', phase: 'publish', name: 'detections', bidirectional: false,
		})
	})
})

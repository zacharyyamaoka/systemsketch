import { describe, expect, it } from 'vitest'

import {
	COMMUNICATION_DRAW_FAMILIES,
	COMMUNICATION_PROTOCOL_LEGS,
	communicationNameSlug,
	communicationPortId,
	communicationPortName,
	isCommunicationDrawFamily,
	type CommunicationDrawFamily,
} from './communicationAuthoring'
import { inspectCommunicationChannel } from './communicationProjection'

/**
 * The contract this file exists for.
 *
 * Communication view writes port names; Dataflow view reads them back through
 * the same strict parser a hand-wired board uses. If the two ever disagree, a
 * drawn Action silently becomes three unrelated topics — a failure that is
 * invisible in the view that created it. These assertions are the only thing
 * standing between that and a green build.
 */
describe('generated port names round-trip through the strict parser', () => {
	for (const family of COMMUNICATION_DRAW_FAMILIES) {
		for (const leg of COMMUNICATION_PROTOCOL_LEGS[family]) {
			it(`${family}.${leg.phase} reads back as itself`, () => {
				const portName = communicationPortName('move.base', leg.phase)
				const inspection = inspectCommunicationChannel(portName, portName)
				expect(inspection.issue).toBeNull()
				expect(inspection.parsed).not.toBeNull()
				expect(inspection.parsed?.family).toBe(family)
				expect(inspection.parsed?.phase).toBe(leg.phase)
				expect(inspection.parsed?.name).toBe('move.base')
			})
		}
	}

	it('collapses every leg of one relationship under one group name', () => {
		for (const family of COMMUNICATION_DRAW_FAMILIES) {
			const names = COMMUNICATION_PROTOCOL_LEGS[family].map((leg) => {
				const portName = communicationPortName('health', leg.phase)
				const parsed = inspectCommunicationChannel(portName, portName).parsed
				return `${parsed?.family}|${parsed?.name.toLowerCase()}`
			})
			expect(new Set(names).size).toBe(1)
		}
	})

	it('never emits a name the parser would re-read as a different phase', () => {
		// The reader splits on `[._:/-]` and rejoins with `.`, so the generator
		// has to emit that exact form. An underscore is NOT a safe joiner: it is
		// one of the separators, and `move_base` comes back as `move.base`.
		const hostile = 'Arm/Move-Base: v2.1'
		const slug = communicationNameSlug(hostile)
		expect(slug).toBe('arm.move.base.v2.1')
		const portName = communicationPortName(slug, 'goal')
		const parsed = inspectCommunicationChannel(portName, portName).parsed
		expect(parsed?.name).toBe(slug)
		expect(parsed?.phase).toBe('goal')
	})
})

describe('protocol leg tables', () => {
	it('gives Service and Action the legs their own validation requires', () => {
		// `computeCommunicationRelations` raises `missing-required-phase` unless
		// these exist, so a freshly drawn relationship must not be born invalid.
		const phases = (family: CommunicationDrawFamily) =>
			COMMUNICATION_PROTOCOL_LEGS[family].map((leg) => leg.phase)
		expect(phases('service')).toEqual(expect.arrayContaining(['request', 'response']))
		expect(phases('action')).toEqual(expect.arrayContaining(['goal', 'result']))
	})

	it('runs return legs back along the drawn arrow', () => {
		// The projection's reversed-phase diagnostic expects response, feedback
		// and result to run responder → initiator. Disagreeing here would flag
		// every generated board as reversed.
		const RETURNS = new Set(['response', 'feedback', 'result'])
		for (const family of COMMUNICATION_DRAW_FAMILIES) {
			for (const leg of COMMUNICATION_PROTOCOL_LEGS[family]) {
				expect(leg.direction).toBe(RETURNS.has(leg.phase) ? 'back' : 'forward')
			}
		}
	})

	it('leaves cancel out of a drawn Action', () => {
		const phases = COMMUNICATION_PROTOCOL_LEGS.action.map((leg) => leg.phase)
		expect(phases).not.toContain('cancel')
	})

	it('does not offer topic, which is the parser fallback', () => {
		expect(isCommunicationDrawFamily('topic')).toBe(false)
		expect(isCommunicationDrawFamily('stream')).toBe(true)
	})
})

describe('generated port identity', () => {
	it('is deterministic, so re-drawing reuses the same ports', () => {
		expect(communicationPortId('action', 'move', 'goal')).toBe('comm:action:move:goal')
		expect(communicationPortId('action', 'Move', 'goal')).toBe('comm:action:move:goal')
	})

	it('separates the phases of one relationship', () => {
		const ids = COMMUNICATION_PROTOCOL_LEGS.action
			.map((leg) => communicationPortId('action', 'move', leg.phase))
		expect(new Set(ids).size).toBe(ids.length)
	})

	it('keeps a disambiguating suffix round-trip safe', () => {
		// `battery_2` would come back from the parser as `battery.2`, splitting
		// one relationship's legs across two group keys.
		expect(communicationNameSlug('battery 2')).toBe('battery.2')
		const portName = communicationPortName(communicationNameSlug('battery 2'), 'request')
		expect(inspectCommunicationChannel(portName, portName).parsed?.name).toBe('battery.2')
	})

	it('keeps a stream port name as the readable channel', () => {
		expect(communicationPortName('camera', 'stream')).toBe('camera.stream')
		expect(communicationPortName('health', 'request')).toBe('health.request')
	})
})

import { describe, expect, it } from 'vitest'

import { parseBehaviorTreeXml } from '../btcppXml'
import {
	createMockEngine,
	lastIndexAtOrBeforeTick,
	mulberry32,
	reconstructAt,
	runtimeKey,
	type BtRunTransition,
	type BtTickResult,
} from './btMockEngine'
import {
	applyMockPresetToXml,
	readMockParamsById,
	resolveMockParams,
	setMockParamsInXml,
} from './mockParams'

function wrap(body: string, models = ''): string {
	return `<root BTCPP_format="4" main_tree_to_execute="T">
  <BehaviorTree ID="T">${body}</BehaviorTree>
  ${models}
</root>`
}

function runToEnd(xml: string, seed: number, maxTicks = 400) {
	const document = parseBehaviorTreeXml(xml)
	const engine = createMockEngine(document, { seed, debugSnapshots: true })
	expect(engine.unsupportedReasons).toEqual([])
	const log: BtRunTransition[] = []
	const snapshots: BtTickResult['snapshot'][] = []
	let outcome = null
	let tick = 0
	while (!outcome && tick < maxTicks) {
		const result = engine.step()
		tick = result.tick
		log.push(...result.events)
		snapshots.push(result.snapshot)
		outcome = result.outcome
	}
	return { log, snapshots, outcome, ticks: tick, engine }
}

const INSTANT = '_mock_duration_ms="1"'

describe('btMockEngine semantics', () => {
	it('a sequence latches: an earlier succeeded child is not re-ticked', () => {
		const xml = wrap(
			'<Sequence><a/><b/></Sequence>',
			`<TreeNodesModel>
        <Action ID="a" _mock_success="1" _mock_duration_ms="1"/>
        <Action ID="b" _mock_success="1" _mock_duration_ms="500"/>
      </TreeNodesModel>`,
		)
		const { log, outcome } = runToEnd(xml, 7)
		expect(outcome).toBe('success')
		// `a` runs exactly one attempt: one running mark, one success mark.
		const aEvents = log.filter((entry) => entry.path === '0.0')
		expect(aEvents.map((entry) => entry.to)).toEqual(['running', 'success'])
	})

	it('a fallback recovers: first child fails, second succeeds, run succeeds', () => {
		const xml = wrap(
			'<Fallback><bad/><good/></Fallback>',
			`<TreeNodesModel>
        <Action ID="bad" _mock_success="0" ${INSTANT}/>
        <Action ID="good" _mock_success="1" ${INSTANT}/>
      </TreeNodesModel>`,
		)
		const { log, outcome } = runToEnd(xml, 3)
		expect(outcome).toBe('success')
		expect(log.find((entry) => entry.path === '0.0' && entry.to === 'failure')).toBeTruthy()
		expect(log.find((entry) => entry.path === '0.1' && entry.to === 'success')).toBeTruthy()
	})

	it('a failing sequence halts the un-reached running sibling of a parallel', () => {
		const xml = wrap(
			`<Parallel success_count="-1" failure_count="1">
         <slow/>
         <bad/>
       </Parallel>`,
			`<TreeNodesModel>
        <Action ID="slow" _mock_success="1" _mock_duration_ms="2000"/>
        <Action ID="bad" _mock_success="0" ${INSTANT}/>
      </TreeNodesModel>`,
		)
		const { log, outcome } = runToEnd(xml, 5)
		expect(outcome).toBe('failure')
		expect(log.find((entry) => entry.path === '0.0' && entry.to === 'halted')).toBeTruthy()
	})

	it('RetryUntilSuccessful retries a flaky child up to num_attempts', () => {
		const xml = wrap(
			'<RetryUntilSuccessful num_attempts="50"><flaky/></RetryUntilSuccessful>',
			`<TreeNodesModel><Action ID="flaky" _mock_success="0.5" ${INSTANT}/></TreeNodesModel>`,
		)
		const { log, outcome } = runToEnd(xml, 11)
		expect(outcome).toBe('success')
		const attempts = log.filter((entry) => entry.path === '0.0' && (entry.to === 'success' || entry.to === 'failure'))
		expect(attempts.at(-1)?.to).toBe('success')
		expect(attempts.length).toBeGreaterThan(0)
		expect(attempts.slice(0, -1).every((entry) => entry.to === 'failure')).toBe(true)
	})

	it('Inverter swaps, ForceSuccess forces, Repeat counts cycles', () => {
		const xml = wrap(
			`<Sequence>
         <Inverter><bad/></Inverter>
         <ForceSuccess><bad/></ForceSuccess>
         <Repeat num_cycles="3"><good/></Repeat>
       </Sequence>`,
			`<TreeNodesModel>
        <Action ID="bad" _mock_success="0" ${INSTANT}/>
        <Action ID="good" _mock_success="1" ${INSTANT}/>
      </TreeNodesModel>`,
		)
		const { log, outcome } = runToEnd(xml, 2)
		expect(outcome).toBe('success')
		const goodDone = log.filter((entry) => entry.path === '0.2.0' && entry.to === 'success')
		expect(goodDone.length).toBe(3)
	})

	it('ReactiveSequence re-ticks from the first child every tick; plain Sequence does not', () => {
		const body = (control: string) => wrap(
			`<${control}><check/><slow/></${control}>`,
			`<TreeNodesModel>
        <Action ID="check" _mock_success="1" ${INSTANT}/>
        <Action ID="slow" _mock_success="1" _mock_duration_ms="400"/>
      </TreeNodesModel>`,
		)
		const reactive = runToEnd(body('ReactiveSequence'), 9)
		const latched = runToEnd(body('Sequence'), 9)
		const checkCompletions = (log: BtRunTransition[]) =>
			log.filter((entry) => entry.path === '0.0' && entry.to === 'success').length
		expect(checkCompletions(latched.log)).toBe(1)
		expect(checkCompletions(reactive.log)).toBeGreaterThan(1)
	})

	it('SequenceWithMemory resumes at the failed child instead of restarting', () => {
		// `first` succeeds once; under RetryUntilSuccessful the memory sequence
		// must NOT re-run it while retrying `flaky-then-good`.
		const xml = wrap(
			`<RetryUntilSuccessful num_attempts="60">
         <SequenceWithMemory><first/><flaky/></SequenceWithMemory>
       </RetryUntilSuccessful>`,
			`<TreeNodesModel>
        <Action ID="first" _mock_success="1" ${INSTANT}/>
        <Action ID="flaky" _mock_success="0.4" ${INSTANT}/>
      </TreeNodesModel>`,
		)
		const { log, outcome } = runToEnd(xml, 21)
		expect(outcome).toBe('success')
		const firstCompletions = log.filter((entry) => entry.path === '0.0.0' && entry.to === 'success')
		expect(firstCompletions.length).toBe(1)
	})

	it('SubTree descends into the referenced tree and reports its outcome', () => {
		const xml = `<root BTCPP_format="4" main_tree_to_execute="Main">
      <BehaviorTree ID="Main">
        <Sequence><SubTree ID="Inner"/></Sequence>
      </BehaviorTree>
      <BehaviorTree ID="Inner">
        <Fallback><bad/><good/></Fallback>
      </BehaviorTree>
      <TreeNodesModel>
        <Action ID="bad" _mock_success="0" ${INSTANT}/>
        <Action ID="good" _mock_success="1" ${INSTANT}/>
      </TreeNodesModel>
    </root>`
		const document = parseBehaviorTreeXml(xml)
		const engine = createMockEngine(document, { seed: 4 })
		expect(engine.unsupportedReasons).toEqual([])
		let result = engine.step()
		let guard = 0
		while (!result.outcome && guard < 100) {
			result = engine.step()
			guard += 1
		}
		expect(result.outcome).toBe('success')
	})

	it('refuses a Switch loudly instead of inventing semantics', () => {
		const xml = wrap('<Switch2 variable="{x}" case_1="1" case_2="2"><a/><b/><c/></Switch2>',
			'<TreeNodesModel><Action ID="a"/><Action ID="b"/><Action ID="c"/></TreeNodesModel>')
		const engine = createMockEngine(parseBehaviorTreeXml(xml), { seed: 1 })
		expect(engine.unsupportedReasons.length).toBeGreaterThan(0)
		expect(engine.unsupportedReasons[0]).toContain('Switch2')
	})
})

describe('the transition log reconstructs any tick exactly (the 100% scrub bar)', () => {
	const TREE = wrap(
		`<Sequence>
       <Fallback>
         <gripper/>
         <SequenceWithMemory><gripper/><gripper/></SequenceWithMemory>
       </Fallback>
       <Parallel success_count="-1" failure_count="1">
         <move/>
         <trommel/>
       </Parallel>
       <RetryUntilSuccessful num_attempts="4"><gripper/></RetryUntilSuccessful>
     </Sequence>`,
		`<TreeNodesModel>
      <Action ID="gripper" _mock_success="0.55" _mock_duration_ms="220"/>
      <Action ID="move" _mock_success="0.97" _mock_duration_ms="400"/>
      <Action ID="trommel" _mock_success="0.97" _mock_duration_ms="300"/>
    </TreeNodesModel>`,
	)

	it('fold(log, tick) equals the engine snapshot for EVERY tick, across seeds', () => {
		for (const seed of [1, 7, 13, 34, 55]) {
			const { log, snapshots } = runToEnd(TREE, seed)
			snapshots.forEach((snapshot, index) => {
				const tick = index + 1
				const folded = reconstructAt(log, lastIndexAtOrBeforeTick(log, tick), runtimeKey('T', '0'))
				expect(snapshot).not.toBeNull()
				// Every key present in either must agree on status.
				const keys = new Set([...snapshot!.keys(), ...folded.statuses.keys()])
				for (const key of keys) {
					expect(folded.statuses.get(key)?.status, `seed ${seed} tick ${tick} ${key}`).toBe(snapshot!.get(key))
				}
			})
		}
	})

	it('random ticks reconstruct exactly too (sampled, seeded)', () => {
		const rng = mulberry32(20260905)
		const { log, snapshots } = runToEnd(TREE, 34)
		for (let i = 0; i < 10; i += 1) {
			const tick = 1 + Math.floor(rng() * snapshots.length)
			const snapshot = snapshots[tick - 1]!
			const folded = reconstructAt(log, lastIndexAtOrBeforeTick(log, tick), runtimeKey('T', '0'))
			for (const key of new Set([...snapshot.keys(), ...folded.statuses.keys()])) {
				expect(folded.statuses.get(key)?.status).toBe(snapshot.get(key))
			}
		}
	})

	it('every ancestor of a running node is running (spinners cover the whole path)', () => {
		const { log, snapshots } = runToEnd(TREE, 34)
		snapshots.forEach((snapshot) => {
			for (const [key, status] of snapshot!) {
				if (status !== 'running') continue
				const [, path] = key.split(':')
				for (let cut = path.lastIndexOf('.'); cut > 0; cut = path.lastIndexOf('.', cut - 1)) {
					const ancestor = runtimeKey('T', path.slice(0, cut))
					expect(snapshot!.get(ancestor), `${ancestor} under running ${key}`).toBe('running')
				}
			}
		})
		expect(log.length).toBeGreaterThan(0)
	})
})

describe('sampling honors the authored expectation statistically', () => {
	it('a 30% node succeeds in roughly 30% of runs — not always, not never', () => {
		const xml = wrap('<flaky/>', `<TreeNodesModel><Action ID="flaky" _mock_success="0.3" ${INSTANT}/></TreeNodesModel>`)
		let successes = 0
		const runsCount = 600
		for (let seed = 1; seed <= runsCount; seed += 1) {
			const { outcome } = runToEnd(xml, seed)
			if (outcome === 'success') successes += 1
		}
		const rate = successes / runsCount
		expect(rate).toBeGreaterThan(0.24)
		expect(rate).toBeLessThan(0.36)
	})

	it('durations jitter around the authored expectation', () => {
		const xml = wrap('<move/>', '<TreeNodesModel><Action ID="move" _mock_success="1" _mock_duration_ms="1000"/></TreeNodesModel>')
		const ticksSeen = new Set<number>()
		for (let seed = 1; seed <= 40; seed += 1) {
			ticksSeen.add(runToEnd(xml, seed).ticks)
		}
		// 1000ms at 100ms/tick jittered ±30% → 7..13 ticks, and it must vary.
		expect(Math.min(...ticksSeen)).toBeGreaterThanOrEqual(7)
		expect(Math.max(...ticksSeen)).toBeLessThanOrEqual(13)
		expect(ticksSeen.size).toBeGreaterThan(1)
	})

	it('same seed, same run — replayable', () => {
		const xml = wrap('<Fallback><a/><b/></Fallback>',
			`<TreeNodesModel><Action ID="a" _mock_success="0.5" ${INSTANT}/><Action ID="b" _mock_success="0.5" ${INSTANT}/></TreeNodesModel>`)
		const first = runToEnd(xml, 42)
		const second = runToEnd(xml, 42)
		expect(second.log).toEqual(first.log)
	})
})

describe('mock params: authored on the skill, presets are bulk writers', () => {
	const XML = wrap('<Sequence><grip/><check/></Sequence>',
		`<TreeNodesModel>
      <Action ID="grip"><input_port name="g"/></Action>
      <Condition ID="check"/>
    </TreeNodesModel>`)

	it('round-trips through the TreeNodesModel entry', () => {
		const written = setMockParamsInXml(XML, 'grip', 'action', { successChance: 0.55, durationMs: 800 })
		expect(written.ok).toBe(true)
		const document = parseBehaviorTreeXml((written as { xml: string }).xml)
		const declared = readMockParamsById(document)
		expect(declared.get('grip')).toEqual({ successChance: 0.55, durationMs: 800 })
		// The document still parses clean and the port declaration survived.
		expect(document.models.find((model) => model.id === 'grip')?.ports.map((port) => port.name)).toEqual(['g'])
		expect(document.diagnostics.filter((entry) => entry.severity === 'error')).toEqual([])
	})

	it('creates a declaration for a used-but-undeclared skill', () => {
		const bare = wrap('<mystery/>')
		const written = setMockParamsInXml(bare, 'mystery', 'action', { successChance: 0.4 })
		expect(written.ok).toBe(true)
		const document = parseBehaviorTreeXml((written as { xml: string }).xml)
		expect(readMockParamsById(document).get('mystery')?.successChance).toBe(0.4)
	})

	it('defaults apply until authored, then the authored value wins', () => {
		const document = parseBehaviorTreeXml(XML)
		const declared = readMockParamsById(document)
		expect(resolveMockParams(declared, { id: 'grip', kind: 'action' }).successChance).toBe(0.9)
		expect(resolveMockParams(declared, { id: 'check', kind: 'condition' }).successChance).toBe(0.95)
	})

	it('a preset writes every used leaf and is itself plain authored XML', () => {
		const document = parseBehaviorTreeXml(XML)
		const chaos = applyMockPresetToXml(XML, document, 'T', 'chaos')
		expect(chaos.ok).toBe(true)
		const after = parseBehaviorTreeXml((chaos as { xml: string }).xml)
		const declared = readMockParamsById(after)
		expect(declared.get('grip')?.successChance).toBe(0.6)
		expect(declared.get('check')?.successChance).toBe(0.6)
		// Nominal restores certainty on top of chaos — bulk edits stack like edits.
		const nominal = applyMockPresetToXml((chaos as { xml: string }).xml, after, 'T', 'nominal')
		const final = readMockParamsById(parseBehaviorTreeXml((nominal as { xml: string }).xml))
		expect(final.get('grip')?.successChance).toBe(1)
	})
})

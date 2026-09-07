import { describe, expect, it } from 'vitest'

import {
  DEFAULT_EDGE_POLICY,
  EDGE_POLICY_PRESETS,
  EDGE_POLICY_RULE_COUNT,
  EDGE_POLICY_STORAGE_KEY,
  edgePoliciesEqual,
  edgePolicyPreset,
  enforcedRuleCount,
  matchingEdgePolicyPreset,
  parseStoredEdgePolicy,
  readEdgePolicy,
  writeEdgePolicy,
  type EdgePolicy,
} from './edgePolicy'

function storage(seed: Record<string, string> = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => { map.set(key, value) },
    read: (key: string) => map.get(key) ?? null,
  }
}

describe('edge policy presets', () => {
  it('ships the whole ladder, permissive end first', () => {
    expect(EDGE_POLICY_PRESETS.map((preset) => preset.id))
      .toEqual(['whiteboard', 'guided', 'typed', 'strict'])
  })

  it('whiteboard enforces nothing at all', () => {
    expect(enforcedRuleCount(edgePolicyPreset('whiteboard').policy)).toBe(0)
  })

  it('strict enforces every rule but fan-out', () => {
    const strict = edgePolicyPreset('strict').policy
    expect(strict.allowFanOut).toBe(true)
    expect(enforcedRuleCount(strict)).toBe(EDGE_POLICY_RULE_COUNT - 1)
  })

  it('each preset is strictly tighter than the one before it', () => {
    const counts = EDGE_POLICY_PRESETS.map((preset) => enforcedRuleCount(preset.policy))
    expect(counts).toEqual([...counts].sort((a, b) => a - b))
    expect(new Set(counts).size).toBe(counts.length)
  })

  it('guided is the default, so a fresh install behaves as SystemSketch always has', () => {
    expect(matchingEdgePolicyPreset(DEFAULT_EDGE_POLICY)).toBe('guided')
  })

  it('names a policy that matches no preset as Custom', () => {
    const custom: EdgePolicy = { ...DEFAULT_EDGE_POLICY, allowCrossBoundary: true }
    expect(matchingEdgePolicyPreset(custom)).toBeNull()
  })

  it('counts type matching as one rule however strict it is', () => {
    const off = enforcedRuleCount({ ...DEFAULT_EDGE_POLICY, typeMatching: 'off' })
    expect(enforcedRuleCount({ ...DEFAULT_EDGE_POLICY, typeMatching: 'lenient' })).toBe(off + 1)
    expect(enforcedRuleCount({ ...DEFAULT_EDGE_POLICY, typeMatching: 'strict' })).toBe(off + 1)
  })

  it('compares typeMatching, not only the switches', () => {
    expect(edgePoliciesEqual(
      { ...DEFAULT_EDGE_POLICY, typeMatching: 'lenient' },
      { ...DEFAULT_EDGE_POLICY, typeMatching: 'strict' },
    )).toBe(false)
  })
})

describe('edge policy persistence', () => {
  it('round-trips through storage', () => {
    const store = storage()
    const policy = edgePolicyPreset('strict').policy
    writeEdgePolicy(policy, store)
    expect(readEdgePolicy(store)).toEqual(policy)
  })

  it('falls back to the default when nothing is stored', () => {
    expect(readEdgePolicy(storage())).toEqual(DEFAULT_EDGE_POLICY)
  })

  it('survives corrupt JSON rather than throwing at startup', () => {
    expect(readEdgePolicy(storage({ [EDGE_POLICY_STORAGE_KEY]: '{not json' })))
      .toEqual(DEFAULT_EDGE_POLICY)
  })

  it('keeps every other choice when a record predates a field', () => {
    // A record written before `allowFanOut` existed: the missing field takes
    // its own default, and the eight real choices around it survive.
    const parsed = parseStoredEdgePolicy({
      version: 1,
      allowHiddenPorts: true,
      allowCrossBoundary: true,
      typeMatching: 'strict',
    })
    expect(parsed.allowHiddenPorts).toBe(true)
    expect(parsed.allowCrossBoundary).toBe(true)
    expect(parsed.typeMatching).toBe('strict')
    expect(parsed.allowFanOut).toBe(DEFAULT_EDGE_POLICY.allowFanOut)
  })

  it('resets wholesale when a stored field has the wrong type', () => {
    expect(parseStoredEdgePolicy({ version: 1, allowFanIn: 'yes' })).toEqual(DEFAULT_EDGE_POLICY)
    expect(parseStoredEdgePolicy({ version: 1, typeMatching: 'pedantic' })).toEqual(DEFAULT_EDGE_POLICY)
  })

  it('ignores a record from a version it does not know', () => {
    expect(parseStoredEdgePolicy({ version: 2, allowFanIn: false })).toEqual(DEFAULT_EDGE_POLICY)
  })
})

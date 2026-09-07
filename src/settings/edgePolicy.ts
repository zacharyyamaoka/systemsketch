import { useSyncExternalStore } from 'react'

/**
 * How much the board is allowed to refuse.
 *
 * SystemSketch spans two honest products: a whiteboard, where a line between
 * two things means whatever you meant, and a typed dataflow editor, where a
 * cable that cannot exist should never be drawable. Both are correct at
 * different moments — sketching versus specifying — so the boundary between
 * them is a setting rather than a hard-coded taste.
 *
 * WHY every field is spelled as a PERMISSION, never a restriction: the
 * whiteboard end of the ladder is "all true", so the most permissive policy is
 * also the one with no special cases, and a rule added later that defaults to
 * `true` cannot silently start refusing cables on someone's existing board.
 *
 * The judge (`judgeConnection`) reads this and nothing else.
 *
 * What it governs is DRAWING. Opening a board never re-judges what is already
 * in it: a file authored on a whiteboard opens intact under Strict, because
 * load-time cleanup and every read-only pass judge against the permissive
 * policy on purpose (see `connectionEndpointsAreValid`). A cable is only
 * re-checked when a live edit changes its Blocks' props or place in the tree,
 * which is the same moment SystemSketch has always re-checked one.
 */
export interface EdgePolicy {
  /** Wire a port that is hidden in the current view. */
  allowHiddenPorts: boolean
  /**
   * Wire straight across a Block boundary — a child inside one box to
   * something outside it, with no boundary port on the way.
   *
   * Off is the black-box rule: a Block's interior is reachable only through
   * its own ports, so the picture you can see is the whole contract.
   */
  allowCrossBoundary: boolean
  /** Wire output→output or input→input, instead of demanding one of each. */
  allowSamePolarity: boolean
  /** How hard the two ports' data types must agree. */
  typeMatching: TypeMatching
  /** Land a cable that closes a feedback loop back onto its own upstream. */
  allowCycles: boolean
  /** A second cable between the exact same two port faces. */
  allowDuplicates: boolean
  /** A Block wired to itself. */
  allowSelfConnection: boolean
  /** More than one cable INTO the same receiving face. */
  allowFanIn: boolean
  /** More than one cable OUT of the same emitting face. */
  allowFanOut: boolean
}

/**
 * `lenient` treats an untyped port as a wildcard, which is what a
 * half-annotated board needs; `strict` additionally demands that both ends
 * declare a type at all, which is the "only valid edges by design" end.
 */
export type TypeMatching = 'off' | 'lenient' | 'strict'

export const TYPE_MATCHING_MODES: readonly TypeMatching[] = ['off', 'lenient', 'strict']

export const EDGE_POLICY_STORAGE_KEY = 'systemsketch.edgePolicy.v1'

/* --------------------------------- presets -------------------------------- */

export type EdgePolicyPresetId = 'whiteboard' | 'guided' | 'typed' | 'strict'

export interface EdgePolicyPreset {
  id: EdgePolicyPresetId
  label: string
  summary: string
  policy: EdgePolicy
}

/** Anything to anything: the plain whiteboard, with the judge fully stood down. */
const WHITEBOARD: EdgePolicy = {
  allowHiddenPorts: true,
  allowCrossBoundary: true,
  allowSamePolarity: true,
  typeMatching: 'off',
  allowCycles: true,
  allowDuplicates: true,
  allowSelfConnection: true,
  allowFanIn: true,
  allowFanOut: true,
}

/**
 * The rules SystemSketch shipped with, and the default: direction and
 * containment are real, types are still free text so they are not policed.
 */
const GUIDED: EdgePolicy = {
  allowHiddenPorts: false,
  allowCrossBoundary: false,
  allowSamePolarity: false,
  typeMatching: 'off',
  allowCycles: false,
  allowDuplicates: false,
  allowSelfConnection: true,
  allowFanIn: true,
  allowFanOut: true,
}

/** Guided, plus the types have to line up wherever they are declared. */
const TYPED: EdgePolicy = {
  ...GUIDED,
  typeMatching: 'lenient',
  allowFanIn: false,
}

/**
 * Every rule on. Fan-OUT stays legal on purpose — one value read by two
 * consumers is ordinary dataflow, not an ambiguity, whereas two producers
 * writing one input is a question the picture cannot answer.
 */
const STRICT: EdgePolicy = {
  allowHiddenPorts: false,
  allowCrossBoundary: false,
  allowSamePolarity: false,
  typeMatching: 'strict',
  allowCycles: false,
  allowDuplicates: false,
  allowSelfConnection: false,
  allowFanIn: false,
  allowFanOut: true,
}

export const EDGE_POLICY_PRESETS: readonly EdgePolicyPreset[] = Object.freeze([
  {
    id: 'whiteboard',
    label: 'Whiteboard',
    summary: 'Any port to any port. Nothing is refused — the board means whatever you meant.',
    policy: Object.freeze(WHITEBOARD),
  },
  {
    id: 'guided',
    label: 'Guided',
    summary: 'Direction and containment are real; data types stay free text. The SystemSketch default.',
    policy: Object.freeze(GUIDED),
  },
  {
    id: 'typed',
    label: 'Typed',
    summary: 'Guided, plus declared types must agree and each input takes one producer.',
    policy: Object.freeze(TYPED),
  },
  {
    id: 'strict',
    label: 'Strict',
    summary: 'Only edges that could exist in the running program. Both ends must declare a matching type.',
    policy: Object.freeze(STRICT),
  },
])

export const DEFAULT_EDGE_POLICY: EdgePolicy = Object.freeze(GUIDED)

export function edgePolicyPreset(id: EdgePolicyPresetId): EdgePolicyPreset {
  return EDGE_POLICY_PRESETS.find((preset) => preset.id === id) ?? EDGE_POLICY_PRESETS[1]
}

export function edgePoliciesEqual(a: EdgePolicy, b: EdgePolicy): boolean {
  return EDGE_POLICY_BOOLEAN_KEYS.every((key) => a[key] === b[key])
    && a.typeMatching === b.typeMatching
}

/**
 * Which preset a policy IS, or null when the toggles have been taken somewhere
 * no preset names. The presets are shortcuts into the toggles, never a second
 * source of truth beside them — so this is derived, never stored.
 */
export function matchingEdgePolicyPreset(policy: EdgePolicy): EdgePolicyPresetId | null {
  return EDGE_POLICY_PRESETS.find((preset) => edgePoliciesEqual(preset.policy, policy))?.id ?? null
}

/** How many of the judge's rules this policy actually enforces, for a "2 of 9" readout. */
export function enforcedRuleCount(policy: EdgePolicy): number {
  const booleans = EDGE_POLICY_BOOLEAN_KEYS.filter((key) => !policy[key]).length
  return booleans + (policy.typeMatching === 'off' ? 0 : 1)
}

export const EDGE_POLICY_RULE_COUNT = 9

/* ------------------------------- persistence ------------------------------- */

const EDGE_POLICY_BOOLEAN_KEYS = [
  'allowHiddenPorts',
  'allowCrossBoundary',
  'allowSamePolarity',
  'allowCycles',
  'allowDuplicates',
  'allowSelfConnection',
  'allowFanIn',
  'allowFanOut',
] as const satisfies readonly (keyof EdgePolicy)[]

export type EdgePolicyBooleanKey = (typeof EDGE_POLICY_BOOLEAN_KEYS)[number]

interface StoredEdgePolicy extends EdgePolicy {
  version: 1
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isTypeMatching(value: unknown): value is TypeMatching {
  return typeof value === 'string' && (TYPE_MATCHING_MODES as readonly string[]).includes(value)
}

/**
 * A field the stored record predates is `undefined`, not wrong — it falls back
 * to its own default rather than discarding every other choice the user made.
 * A field present with the wrong type means the record is corrupt, and the
 * whole thing resets. Same contract as `parseStoredAppearancePreferences`.
 */
export function parseStoredEdgePolicy(value: unknown): EdgePolicy {
  if (!isRecord(value) || value.version !== 1) return DEFAULT_EDGE_POLICY
  for (const key of EDGE_POLICY_BOOLEAN_KEYS) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') return DEFAULT_EDGE_POLICY
  }
  if (value.typeMatching !== undefined && !isTypeMatching(value.typeMatching)) return DEFAULT_EDGE_POLICY

  const parsed = { ...DEFAULT_EDGE_POLICY } as EdgePolicy
  for (const key of EDGE_POLICY_BOOLEAN_KEYS) {
    const stored = value[key]
    if (typeof stored === 'boolean') parsed[key] = stored
  }
  if (isTypeMatching(value.typeMatching)) parsed.typeMatching = value.typeMatching
  return parsed
}

export function readEdgePolicy(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): EdgePolicy {
  try {
    const stored = storage.getItem(EDGE_POLICY_STORAGE_KEY)
    return stored === null ? DEFAULT_EDGE_POLICY : parseStoredEdgePolicy(JSON.parse(stored))
  } catch {
    return DEFAULT_EDGE_POLICY
  }
}

export function writeEdgePolicy(
  policy: EdgePolicy,
  storage: Pick<Storage, 'setItem'> = window.localStorage,
): EdgePolicy {
  const stored: StoredEdgePolicy = { version: 1, ...policy }
  try {
    storage.setItem(EDGE_POLICY_STORAGE_KEY, JSON.stringify(stored))
  } catch {
    // A preference is a convenience; the board must keep working without it.
  }
  return policy
}

/* --------------------------------- the store ------------------------------- */

let snapshot = DEFAULT_EDGE_POLICY
let hydrated = false
const listeners = new Set<() => void>()

function hydrate(): void {
  if (hydrated) return
  hydrated = true
  if (typeof window !== 'undefined') snapshot = readEdgePolicy()
}

export function getEdgePolicy(): EdgePolicy {
  hydrate()
  return snapshot
}

export function updateEdgePolicy(patch: Partial<EdgePolicy>): EdgePolicy {
  hydrate()
  const next: EdgePolicy = { ...snapshot, ...patch }
  if (edgePoliciesEqual(next, snapshot)) return snapshot
  snapshot = typeof window === 'undefined' ? next : writeEdgePolicy(next)
  listeners.forEach((listener) => listener())
  return snapshot
}

export function applyEdgePolicyPreset(id: EdgePolicyPresetId): EdgePolicy {
  return updateEdgePolicy({ ...edgePolicyPreset(id).policy })
}

export function subscribeEdgePolicy(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useEdgePolicy(): EdgePolicy {
  return useSyncExternalStore(subscribeEdgePolicy, getEdgePolicy, () => DEFAULT_EDGE_POLICY)
}

/** Test seam: forget the hydrated snapshot so a case can start from storage again. */
export function resetEdgePolicyForTests(policy: EdgePolicy = DEFAULT_EDGE_POLICY): void {
  snapshot = policy
  hydrated = true
  listeners.forEach((listener) => listener())
}

/**
 * The lab is only worth having if its levers compose the SAME way the product
 * surfaces do. These tests pin that: the presets reproduce the shipped shapes,
 * and each lever changes exactly the thing it names.
 */
import { describe, expect, it, vi } from 'vitest'

import {
  CONNECTOR_CONTEXTUAL_RECIPE,
  contextualControlIds,
} from '../../contextualMenus/contextualControlRegistry'
import {
  LAB_KINDS,
  LAB_PRESETS,
  LAB_PRESET_RECIPES,
  emptyLabState,
  labCandidates,
  labComposition,
  labDangling,
  labRecipe,
  labPresetDrift,
  labRecipeSource,
  moveLabControl,
  setLabControl,
} from './menuLabModel'

const noop = vi.fn()
const preset = (id: string) => LAB_PRESETS.find((candidate) => candidate.id === id)!.state

describe('the lab composes with the product\'s own machinery', () => {
  it('offers every registered control and no invented ones', () => {
    // A lever board that drifts from the registry is a second vocabulary,
    // which is the exact failure the registry exists to prevent.
    expect(emptyLabState().controls.map((control) => control.kind)).toEqual([...LAB_KINDS])
  })

  it('stacks a control into the next one instead of emitting it', () => {
    const state = preset('shape')
    const ids = contextualControlIds(labComposition(state, noop))
    // Thickness and line style are folded into the palette's popover, so they
    // are not triggers of their own — the same chain the real Stroke popover
    // uses.
    expect(ids).not.toContain('strokeWidth')
    expect(ids).not.toContain('lineStyle')
    expect(ids).toContain('strokeColor')
    const stroke = labCandidates(state, noop).find((control) => control.id === 'strokeColor')!
    expect(stroke.modePlacement).toBe('above')
    expect(stroke.modeControl?.id).toBe('lineStyle')
    expect(stroke.modeControl?.modeControl?.id).toBe('strokeWidth')
  })

  it('puts the same control beside instead of above when the lever says so', () => {
    const state = preset('connector')
    const lineStyle = labCandidates(state, noop).find((control) => control.id === 'lineStyle')!
    expect(lineStyle.modePlacement).toBe('beside')
    expect(lineStyle.modeControl?.id).toBe('strokeWidth')
    // ...and it is literally the same registered vocabulary as the shape's.
    const shape = labCandidates(preset('shape'), noop).find((c) => c.id === 'strokeColor')!
    expect(lineStyle.modeControl?.options).toEqual(shape.modeControl?.modeControl?.options)
  })

  it('reproduces the connector recipe\'s group order from levers alone', () => {
    const groups = labRecipe(preset('connector')).groups.map((group) => group.items)
    expect(groups).toEqual([
      ['color', 'lineStyle'],
      ['arrowheadStart', 'lineShape', 'arrowheadEnd'],
    ])
    // The shipped recipe carries the same flow group, in the same order.
    expect(CONNECTOR_CONTEXTUAL_RECIPE.groups.find((group) => group.id === 'flow')?.items)
      .toEqual(['arrowheadStart', 'lineShape', 'arrowheadEnd'])
  })

  it('turns a group break into a new group and reorder into new order', () => {
    let state = setLabControl(emptyLabState(), 'color', { included: true })
    state = setLabControl(state, 'font', { included: true })
    expect(labRecipe(state).groups).toHaveLength(1)
    state = setLabControl(state, 'font', { breakBefore: true })
    expect(labRecipe(state).groups.map((group) => group.items)).toEqual([['color'], ['font']])
    // Reorder steps past the switched-off rows between them, and the break
    // travels with the control that owns it — first in the list, it has
    // nothing to separate, so the two fold back into one group.
    state = moveLabControl(state, 'font', -1)
    expect(labRecipe(state).groups.map((group) => group.items)).toEqual([['font', 'color']])
    state = setLabControl(state, 'color', { breakBefore: true })
    expect(labRecipe(state).groups.map((group) => group.items)).toEqual([['font'], ['color']])
  })

  it('emits the recipe literal the levers describe', () => {
    const state = setLabControl(emptyLabState(), 'color', { included: true })
    expect(labRecipeSource(state)).toContain("{ id: 'group-1', items: ['color'] },")
  })

  it('hands mixed and shared readings through unchanged', () => {
    let state = setLabControl(emptyLabState(), 'color', { included: true, value: 'mixed' })
    expect(labCandidates(state, noop)[0].value).toEqual({ type: 'mixed' })
    state = setLabControl(state, 'color', { value: 'second' })
    expect(labCandidates(state, noop)[0].value?.type).toBe('shared')
  })
})

describe('a lever that does nothing says so', () => {
  it('names a control stacked onto nothing instead of dropping it in silence', () => {
    let state = setLabControl(emptyLabState(), 'color', { included: true })
    state = setLabControl(state, 'font', { included: true, stack: 'above' })
    // `font` is last, so it has no host to fold into — it disappears from the
    // composed menu, and the lab has to admit that rather than shrug.
    expect(contextualControlIds(labComposition(state, noop))).toEqual(['color'])
    expect(labDangling(state)).toEqual(['font'])
    // Moved above its host, the same lever composes.
    state = moveLabControl(state, 'font', -1)
    expect(labDangling(state)).toEqual([])
    expect(contextualControlIds(labComposition(state, noop))).toEqual(['color'])
    expect(labCandidates(state, noop)[0].modeControl?.id).toBe('font')
  })
})

describe('a preset cannot drift from the surface it names', () => {
  // WHY these run per preset rather than as one loop assertion: the lab's
  // whole promise is "if a composition works here it works in the product".
  // The presets are hand-written, so nothing but a test stops one from
  // keeping a grouping the real recipe has since moved on from — and a lab
  // that lies about the product is worse than no lab.
  for (const preset of LAB_PRESETS.filter((candidate) => LAB_PRESET_RECIPES[candidate.id])) {
    it(`${preset.id} composes only what its product recipe carries`, () => {
      expect(labPresetDrift(preset)).toEqual({ absentFromRecipe: [], splitGroups: [] })
    })
  }

  it('every preset that names a product surface is checked against one', () => {
    // The escape hatch — an unmapped preset is skipped above — must stay
    // deliberate. `empty` is the only preset that reproduces no surface.
    const unmapped = LAB_PRESETS
      .filter((candidate) => !LAB_PRESET_RECIPES[candidate.id])
      .map((candidate) => candidate.id)
    expect(unmapped).toEqual(['empty'])
  })

  it('catches a preset whose group the product recipe actually splits', () => {
    // Font size lives in the recipe's `type` group and alignment in
    // `alignment`; a preset that drew them as one group would be describing a
    // menu the product cannot produce.
    const drifted = {
      ...LAB_PRESETS.find((candidate) => candidate.id === 'shape')!,
      state: setLabControl(preset('shape'), 'align', { breakBefore: false }),
    }
    expect(labPresetDrift(drifted).splitGroups).toEqual(['group-3: alignment + type'])
  })
})

describe('the Code selection pill, composed from the same registry', () => {
  it('is Language plus the shared Font size ladder, and nothing it cannot paint', () => {
    const ids = contextualControlIds(labComposition(preset('code'), noop))
    expect(ids).toEqual(['codeLanguage', 'size'])
  })

  it('offers no thickness row, because a Code block has no painted edge', () => {
    // WHY this is pinned rather than left to chance: `strokeWidth` only
    // paints through `getCustomDisplayValues` on geo/draw/line/arrow
    // (`hasAdjustableStrokeWidth`). A Code block's frame is chrome, so a
    // thickness row here would be a control that silently does nothing —
    // exactly the class of contextual-menu bug this work set out to end.
    const ids = contextualControlIds(labComposition(preset('code'), noop))
    expect(ids).not.toContain('strokeWidth')
    expect(ids).not.toContain('strokeColor')
  })

  it('leaves the Block title with typography only, for the same reason', () => {
    const ids = contextualControlIds(labComposition(preset('block-title'), noop))
    expect(ids).toEqual(['font', 'size', 'bold', 'color', 'align'])
    expect(ids).not.toContain('strokeWidth')
  })
})

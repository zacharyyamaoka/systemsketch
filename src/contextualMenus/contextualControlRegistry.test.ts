import { describe, expect, it, vi } from 'vitest'

import {
  BLOCK_TITLE_CONTEXTUAL_RECIPE,
  CONNECTOR_CONTEXTUAL_RECIPE,
  CONTEXTUAL_CONTROL_REGISTRY,
  SHAPE_CONTEXTUAL_RECIPE,
  bindContextualControl,
  composeContextualControls,
  contextualControlIds,
  isAutomaticContextualSelection,
} from './contextualControlRegistry'

const shared = (value: string) => ({ type: 'shared' as const, value })

describe('contextual control composition', () => {
  it('keeps each control vocabulary entry in one registry', () => {
    expect(Object.keys(CONTEXTUAL_CONTROL_REGISTRY)).toEqual([
      'geo', 'color', 'fill', 'lineStyle', 'strokeColor', 'strokeWidth', 'codeLanguage', 'size', 'font', 'align',
      'verticalAlign', 'lineShape',
      'arrowheadStart', 'arrowheadEnd', 'bold', 'addText',
    ])
    expect(CONTEXTUAL_CONTROL_REGISTRY.font.options.map((option) => option.label))
      .toEqual(['Simple', 'Bookish', 'Technical', 'Scribbled'])
  })

  it('registers thickness once: the shape row and the connector row are one control', () => {
    // The connector used to own a `weight` kind of its own — two rungs writing
    // the stock `size` style — beside a shape that had no thickness control at
    // all. Zach's rule: "all the icons by construction must be the same", so
    // there is ONE registered vocabulary and the surfaces differ only in how
    // they compose it.
    const thicknessLabelled = Object.values(CONTEXTUAL_CONTROL_REGISTRY)
      .filter((definition) => definition.label === 'Line thickness')
    expect(thicknessLabelled).toHaveLength(1)
    expect(thicknessLabelled[0].options.map((option) => option.value))
      .toEqual(['thin', 'medium', 'thick'])
    expect(thicknessLabelled[0].meta).toBe('width')
  })

  it('registers Line shape once: one concept, one label, one vocabulary', () => {
    // The reported duplicate-dropdown bug was three sibling kinds (arrow kind,
    // line spline, cable routing) all labelled "Line shape". The registry now
    // structurally cannot compose two of them into one group.
    const lineShapeLabelled = Object.values(CONTEXTUAL_CONTROL_REGISTRY)
      .filter((definition) => definition.label === 'Line shape')
    expect(lineShapeLabelled).toHaveLength(1)
    expect(lineShapeLabelled[0].options.map((option) => option.value))
      .toEqual(['elbow', 'curve', 'straight'])
  })

  it('composes Block title controls only by recipe and preserves group order', () => {
    const controls = [
      bindContextualControl('align', { id: 'titleAlign', value: shared('start'), onSelect: vi.fn() }),
      bindContextualControl('font', { id: 'titleFont', value: shared('sans'), onSelect: vi.fn() }),
      bindContextualControl('color', { id: 'titleColor', value: shared('blue'), onSelect: vi.fn() }),
      bindContextualControl('bold', { id: 'titleBold', value: shared('off'), onSelect: vi.fn() }),
      bindContextualControl('size', { id: 'titleSize', value: shared('m'), onSelect: vi.fn() }),
    ]
    const composition = composeContextualControls(BLOCK_TITLE_CONTEXTUAL_RECIPE, controls)
    expect(contextualControlIds(composition)).toEqual([
      'titleFont', 'titleSize', 'titleBold', 'titleColor', 'titleAlign',
    ])
    expect(composition.groups.map((group) => group.id))
      .toEqual(['type', 'emphasis', 'ink', 'alignment'])
  })

  it('drops unavailable items and empty groups without leaving separator gaps', () => {
    const composition = composeContextualControls(SHAPE_CONTEXTUAL_RECIPE, [
      bindContextualControl('font', { id: 'font', value: shared('sans'), onSelect: vi.fn() }),
      bindContextualControl('align', { id: 'align', value: shared('middle'), onSelect: vi.fn() }),
    ])
    expect(composition.groups.map((group) => group.id)).toEqual(['type', 'alignment'])
    expect(contextualControlIds(composition)).toEqual(['font', 'align'])
  })

  it('puts connector text insertion in the paint group by recipe', () => {
    const composition = composeContextualControls(CONNECTOR_CONTEXTUAL_RECIPE, [
      bindContextualControl('addText', { id: 'addText', value: null, onSelect: vi.fn() }),
      bindContextualControl('lineStyle', { id: 'lineStyle', value: shared('solid'), onSelect: vi.fn() }),
      bindContextualControl('color', { id: 'color', value: shared('black'), onSelect: vi.fn() }),
    ])
    expect(composition.groups).toHaveLength(1)
    expect(composition.groups[0].id).toBe('paint')
    expect(contextualControlIds(composition)).toEqual(['color', 'lineStyle', 'addText'])
  })

  it('keeps a freehand stroke\'s bare Line style chips in the shape paint group', () => {
    // A draw shape emits `lineStyle` instead of `strokeColor` (a dash but no
    // separately paintable edge). The shape recipe must list that slot, or the
    // candidate is built and then silently never rendered — which is exactly
    // what happened before this test existed.
    const composition = composeContextualControls(SHAPE_CONTEXTUAL_RECIPE, [
      bindContextualControl('color', { id: 'color', value: shared('black'), onSelect: vi.fn() }),
      bindContextualControl('lineStyle', { id: 'lineStyle', value: shared('solid'), onSelect: vi.fn() }),
    ])
    expect(composition.groups.map((group) => group.id)).toEqual(['paint'])
    expect(contextualControlIds(composition)).toEqual(['color', 'lineStyle'])
  })
})

describe('the Automatic badge predicate', () => {
  it('claims Automatic only for a declared option the value actually matches', () => {
    const automaticOption = { value: 'automatic', label: 'Automatic' }
    const automatic = bindContextualControl('color', {
      id: 'titleColor', value: shared('automatic'), automaticOption, onSelect: vi.fn(),
    })
    expect(isAutomaticContextualSelection(automatic)).toBe(true)
    const chosen = bindContextualControl('color', {
      id: 'titleColor', value: shared('blue'), automaticOption, onSelect: vi.fn(),
    })
    expect(isAutomaticContextualSelection(chosen)).toBe(false)
  })

  it('never claims Automatic for a control without the concept, however unresolved', () => {
    // The regression this guards: `automaticOption?.value === current?.value`
    // is true (`undefined === undefined`) for any automatic-less control whose
    // value is mixed or unoffered, which painted "A" over the Color and Line
    // style triggers of every disagreeing selection.
    const mixed = bindContextualControl('color', {
      id: 'color', value: { type: 'mixed' }, onSelect: vi.fn(),
    })
    expect(isAutomaticContextualSelection(mixed)).toBe(false)
    const unoffered = bindContextualControl('lineStyle', {
      id: 'lineStyle', value: shared('draw'), onSelect: vi.fn(),
    })
    expect(isAutomaticContextualSelection(unoffered)).toBe(false)
  })
})

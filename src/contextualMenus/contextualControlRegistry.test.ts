import { describe, expect, it, vi } from 'vitest'

import {
  BLOCK_TITLE_CONTEXTUAL_RECIPE,
  CONNECTOR_CONTEXTUAL_RECIPE,
  CONTEXTUAL_CONTROL_REGISTRY,
  SHAPE_CONTEXTUAL_RECIPE,
  bindContextualControl,
  composeContextualControls,
  contextualControlIds,
} from './contextualControlRegistry'

const shared = (value: string) => ({ type: 'shared' as const, value })

describe('contextual control composition', () => {
  it('keeps each control vocabulary entry in one registry', () => {
    expect(Object.keys(CONTEXTUAL_CONTROL_REGISTRY)).toEqual([
      'geo', 'color', 'fill', 'dash', 'lineStyle', 'size', 'weight', 'font', 'align',
      'verticalAlign', 'arrowKind', 'spline', 'connectionRouting',
      'arrowheadStart', 'arrowheadEnd', 'bold', 'addText',
    ])
    expect(CONTEXTUAL_CONTROL_REGISTRY.font.options.map((option) => option.label))
      .toEqual(['Simple', 'Bookish', 'Technical', 'Scribbled'])
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
})

import { describe, expect, it, vi } from 'vitest'
import type { TLUiToolsContextType } from 'tldraw'

import { shapeLibraryItemById, type ShapeLibraryStorage } from './shapeLibraryModel'
import { activateShapeLibraryTool, shapeLibraryToolId } from './shapeLibraryTool'

function memoryStorage(): ShapeLibraryStorage & { values: Map<string, string> } {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value) },
  }
}

function oneTool(id: string) {
  const onSelect = vi.fn()
  return {
    onSelect,
    tools: { [id]: { onSelect } } as unknown as TLUiToolsContextType,
  }
}

describe('shape library tool activation', () => {
  it('routes a basic primitive through the matching stock toolbar item', () => {
    const { tools, onSelect } = oneTool('rectangle')
    const storage = memoryStorage()
    const item = shapeLibraryItemById('rectangle')!

    expect(activateShapeLibraryTool(tools, item, storage)).toBe('rectangle')
    expect(onSelect).toHaveBeenCalledWith('toolbar')
    expect(storage.values.size).toBe(1)
  })

  it('maps flowchart aliases to the stock geo tool that draws them', () => {
    expect(shapeLibraryToolId(shapeLibraryItemById('process')!)).toBe('rectangle')
    expect(shapeLibraryToolId(shapeLibraryItemById('terminator')!)).toBe('oval')
    expect(shapeLibraryToolId(shapeLibraryItemById('manual-input')!)).toBe('trapezoid')
  })

  it('routes curved arrows through the same preset item as the toolbar menu', () => {
    const { tools, onSelect } = oneTool('systemsketch-arrow-curve')
    const item = shapeLibraryItemById('arrow-curve')!

    expect(activateShapeLibraryTool(tools, item, memoryStorage())).toBe('arrow-curve')
    expect(onSelect).toHaveBeenCalledWith('toolbar')
  })
})

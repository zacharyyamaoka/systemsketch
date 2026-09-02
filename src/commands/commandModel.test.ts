import type { Editor } from 'tldraw'
import { describe, expect, it } from 'vitest'

import {
  commandPaletteActionDisabled,
  filterCommandPaletteActions,
  nextPaletteIndex,
  type CommandPaletteAction,
} from './commandModel'

const actions: CommandPaletteAction[] = [
  { id: 'fit', label: 'Zoom to fit', description: 'Show the whole board', keywords: ['camera'], shortcut: 'Shift+1', run() {} },
  { id: 'find', label: 'Find and replace', description: 'Search every page', keywords: ['text'], shortcut: 'Ctrl+F', run() {} },
  { id: 'select', label: 'Select all', description: 'Select visible shapes', shortcut: 'Ctrl+A', run() {} },
]

describe('command palette model', () => {
  it('filters across labels, descriptions, keywords, and shortcuts with stable relevance', () => {
    expect(filterCommandPaletteActions(actions, '').map((action) => action.id)).toEqual(['fit', 'find', 'select'])
    expect(filterCommandPaletteActions(actions, 'find').map((action) => action.id)).toEqual(['find'])
    expect(filterCommandPaletteActions(actions, 'whole board').map((action) => action.id)).toEqual(['fit'])
    expect(filterCommandPaletteActions(actions, 'camera').map((action) => action.id)).toEqual(['fit'])
    expect(filterCommandPaletteActions(actions, 'ctrl f').map((action) => action.id)).toEqual(['find'])
  })

  it('wraps keyboard movement and represents an empty list explicitly', () => {
    expect(nextPaletteIndex(0, 1, 3)).toBe(1)
    expect(nextPaletteIndex(2, 1, 3)).toBe(0)
    expect(nextPaletteIndex(0, -1, 3)).toBe(2)
    expect(nextPaletteIndex(-1, 1, 3)).toBe(0)
    expect(nextPaletteIndex(-1, -1, 3)).toBe(2)
    expect(nextPaletteIndex(0, 1, 0)).toBe(-1)
  })

  it('supports static and editor-derived disabled states', () => {
    const editor = {} as Editor
    expect(commandPaletteActionDisabled(editor, { ...actions[0], disabled: true })).toBe(true)
    expect(commandPaletteActionDisabled(editor, { ...actions[0], disabled: false })).toBe(false)
    expect(commandPaletteActionDisabled(editor, { ...actions[0], disabled: (received) => received === editor })).toBe(true)
  })
})

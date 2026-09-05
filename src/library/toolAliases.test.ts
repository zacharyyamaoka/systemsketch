import { describe, expect, it } from 'vitest'
import {
  MAX_TOOL_ALIAS_LENGTH,
  TOOL_ALIASES_STORAGE_KEY,
  normalizeToolAlias,
  normalizeToolAliases,
  parseStoredToolAliases,
  readToolAliases,
  writeToolAliases,
} from './toolAliases'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

describe('tool aliases', () => {
  it('keeps authored handles readable while cleaning whitespace, duplicates, and invalid data', () => {
    expect(normalizeToolAlias('  @datatype  ')).toBe('@datatype')
    expect(normalizeToolAlias('  intent   label ')).toBe('intent label')
    expect(normalizeToolAlias('')).toBeNull()
    expect(normalizeToolAlias('x'.repeat(MAX_TOOL_ALIAS_LENGTH + 1))).toBeNull()
    expect(normalizeToolAliases({
      text: [' @datatype ', '@datatype', 42, 'type'],
      rectangle: 'not an array',
      empty: [],
    })).toEqual({ text: ['@datatype', 'type'] })
  })

  it('round-trips a versioned local preference and safely rejects malformed storage', () => {
    const storage = memoryStorage()
    writeToolAliases({ text: ['@datatype'], diamond: ['decision-point'] }, storage)
    expect(storage.getItem(TOOL_ALIASES_STORAGE_KEY)).toBe(
      '{"version":1,"aliases":{"text":["@datatype"],"diamond":["decision-point"]}}',
    )
    expect(readToolAliases(storage)).toEqual({ text: ['@datatype'], diamond: ['decision-point'] })
    expect(parseStoredToolAliases({ version: 2, aliases: { text: ['@datatype'] } })).toEqual({})
    expect(readToolAliases(memoryStorage({ [TOOL_ALIASES_STORAGE_KEY]: '{oops' }))).toEqual({})
  })
})

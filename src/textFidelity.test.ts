import { describe, expect, it } from 'vitest'
import { storedTextOr } from './textFidelity'

describe('storedTextOr', () => {
  it('uses a fallback only for an absent value, preserving punctuation and whitespace exactly', () => {
    expect(storedTextOr('', 'Untitled')).toBe('Untitled')
    expect(storedTextOr(' gain_copy ', 'Untitled')).toBe(' gain_copy ')
  })
})

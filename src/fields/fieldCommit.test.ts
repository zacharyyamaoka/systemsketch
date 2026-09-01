import { describe, expect, it } from 'vitest'

import { FieldGesture, type FieldCommitMode } from './fieldCommit'

function recorder(mode: FieldCommitMode = 'live') {
  const log: string[] = []
  const gesture = new FieldGesture({
    write: (value) => void log.push(`write:${value}`),
    begin: () => void log.push('begin'),
    end: (value, startValue) => void log.push(`end:${startValue}->${value}`),
  }, mode)
  return { gesture, log }
}

describe('field gesture', () => {
  it('writes every keystroke in live mode inside one undo step', () => {
    const { gesture, log } = recorder()
    gesture.focus('out_1')
    gesture.change('F')
    gesture.change('Fr')
    gesture.change('Frame')
    gesture.commit()
    expect(log).toEqual([
      'begin',
      'write:F',
      'write:Fr',
      'write:Frame',
      'end:out_1->Frame',
    ])
  })

  it('leaves no trace when a field is focused but never edited', () => {
    const { gesture, log } = recorder()
    gesture.focus('out_1')
    gesture.change('out_1')
    gesture.commit()
    expect(log).toEqual(['end:out_1->out_1'])
  })

  it('commits the typed value when the field is destroyed instead of blurred', () => {
    // The reported bug: clicking the canvas deselects the Block and unmounts
    // the panel, and Chrome fires no blur for a removed element. Unmount calls
    // commit() directly, so under either policy the write still happens.
    for (const mode of ['live', 'exit'] as const) {
      const { gesture, log } = recorder(mode)
      gesture.focus('out_1')
      gesture.change('Frame')
      gesture.commit() // ← the React unmount cleanup, not a blur
      expect(log.filter((entry) => entry.startsWith('write:')).at(-1)).toBe('write:Frame')
      expect(log.at(-1)).toBe('end:out_1->Frame')
    }
  })

  it('buffers in exit mode and writes exactly once', () => {
    const { gesture, log } = recorder('exit')
    gesture.focus('')
    gesture.change('a')
    gesture.change('ab')
    gesture.change('abc')
    gesture.commit()
    expect(log).toEqual(['begin', 'write:abc', 'end:->abc'])
  })

  it('ends exactly once however many exit routes fire', () => {
    const { gesture, log } = recorder()
    gesture.focus('a')
    gesture.change('ab')
    gesture.commit() // blur
    gesture.commit() // unmount right behind it
    gesture.commit()
    expect(log.filter((entry) => entry.startsWith('end:'))).toEqual(['end:a->ab'])
  })

  it('keeps the original pre-edit value across a re-entered focus', () => {
    const { gesture, log } = recorder()
    gesture.focus('start')
    gesture.change('start!')
    gesture.focus('start!')
    gesture.change('start!!')
    gesture.commit()
    expect(log.at(-1)).toBe('end:start->start!!')
  })

  it('reports the boundary a backend rename would be emitted from', () => {
    const { gesture, log } = recorder()
    gesture.focus('raw')
    gesture.change('r')
    gesture.change('rgb')
    gesture.commit()
    // One semantic event per gesture — not one per keystroke — while the
    // document itself already saw all three values.
    expect(log.filter((entry) => entry.startsWith('end:'))).toEqual(['end:raw->rgb'])
  })

  it('switches write policy per field without changing the loss guarantee', () => {
    const { gesture, log } = recorder('exit')
    gesture.mode = 'live'
    gesture.focus('x')
    gesture.change('xy')
    expect(log).toEqual(['begin', 'write:xy'])
  })
})

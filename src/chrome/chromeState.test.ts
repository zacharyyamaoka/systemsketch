import { describe, expect, it } from 'vitest'
import { INITIAL_CHROME_STATE, reduceChromeState } from './chromeState'

describe('SystemSketch chrome state', () => {
  it('lets the two inset popouts coexist', () => {
    const withLeft = reduceChromeState(INITIAL_CHROME_STATE, {
      type: 'set-left',
      surface: 'shapes',
    })
    const withBoth = reduceChromeState(withLeft, {
      type: 'set-right',
      surface: 'comments',
    })

    expect(withBoth.leftSurface).toBe('shapes')
    expect(withBoth.rightSurface).toBe('comments')
    expect(withBoth.openOrder).toEqual(['left:shapes', 'right:comments'])
  })

  it('closes transient surfaces in last-opened-first order', () => {
    const state = [
      { type: 'set-left', surface: 'shapes' } as const,
      { type: 'set-right', surface: 'comments' } as const,
      { type: 'set-toolbar', surface: 'commands' } as const,
    ].reduce(reduceChromeState, INITIAL_CHROME_STATE)

    const firstEscape = reduceChromeState(state, { type: 'close-latest' })
    const secondEscape = reduceChromeState(firstEscape, { type: 'close-latest' })

    expect(firstEscape.toolbarSurface).toBeNull()
    expect(firstEscape.rightSurface).toBe('comments')
    expect(secondEscape.rightSurface).toBeNull()
    expect(secondEscape.leftSurface).toBe('shapes')
  })

  it('swaps right-side bodies without disturbing the left popout', () => {
    const withLeft = reduceChromeState(INITIAL_CHROME_STATE, {
      type: 'set-left',
      surface: 'shapes',
    })
    const withComments = reduceChromeState(withLeft, {
      type: 'set-right',
      surface: 'comments',
    })
    const withInspector = reduceChromeState(withComments, {
      type: 'set-right',
      surface: 'inspector',
    })

    expect(withInspector.leftSurface).toBe('shapes')
    expect(withInspector.rightSurface).toBe('inspector')
    expect(withInspector.openOrder).toEqual(['left:shapes', 'right:inspector'])
  })
})


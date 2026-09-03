import { describe, expect, it } from 'vitest'
import { compactSidePanelsQuery } from './ChromeProvider'
import { INITIAL_CHROME_STATE, reduceChromeState } from './chromeState'

describe('SystemSketch chrome state', () => {
  it('scales the compact breakpoint with the interface', () => {
    expect(compactSidePanelsQuery(80)).toBe('(max-width: 656px)')
    expect(compactSidePanelsQuery(100)).toBe('(max-width: 820px)')
    expect(compactSidePanelsQuery(160)).toBe('(max-width: 1312px)')
  })

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

  it('keeps only the newest side panel in compact mode', () => {
    const compact = reduceChromeState(INITIAL_CHROME_STATE, {
      type: 'set-compact-side-panels',
      compact: true,
    })
    const withLeft = reduceChromeState(compact, { type: 'set-left', surface: 'shapes' })
    const withRight = reduceChromeState(withLeft, { type: 'set-right', surface: 'comments' })

    expect(withRight.leftSurface).toBeNull()
    expect(withRight.rightSurface).toBe('comments')
    expect(withRight.openOrder).toEqual(['right:comments'])

    const backToLeft = reduceChromeState(withRight, { type: 'set-left', surface: 'files' })
    expect(backToLeft.leftSurface).toBe('files')
    expect(backToLeft.rightSurface).toBeNull()
    expect(backToLeft.openOrder).toEqual(['left:files'])
  })

  it('collapses existing desktop panels to the most recently opened side', () => {
    const desktop = [
      { type: 'set-right', surface: 'comments' } as const,
      { type: 'set-toolbar', surface: 'commands' } as const,
      { type: 'set-left', surface: 'shapes' } as const,
    ].reduce(reduceChromeState, INITIAL_CHROME_STATE)
    const compact = reduceChromeState(desktop, {
      type: 'set-compact-side-panels',
      compact: true,
    })

    expect(compact.leftSurface).toBe('shapes')
    expect(compact.rightSurface).toBeNull()
    expect(compact.toolbarSurface).toBe('commands')
    expect(compact.openOrder).toEqual(['toolbar:commands', 'left:shapes'])

    const wideAgain = reduceChromeState(compact, {
      type: 'set-compact-side-panels',
      compact: false,
    })
    const coexist = reduceChromeState(wideAgain, { type: 'set-right', surface: 'inspector' })
    expect(coexist.leftSurface).toBe('shapes')
    expect(coexist.rightSurface).toBe('inspector')
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

  it('treats Problems as a real right-side surface', () => {
    const problems = reduceChromeState(INITIAL_CHROME_STATE, {
      type: 'set-right',
      surface: 'diagnostics',
    })
    expect(problems.rightSurface).toBe('diagnostics')
    expect(problems.openOrder).toEqual(['right:diagnostics'])
  })

  it('switches command palette modes in the shared transient stack', () => {
    const commands = reduceChromeState(INITIAL_CHROME_STATE, {
      type: 'set-toolbar',
      surface: 'commands',
    })
    const find = reduceChromeState(commands, {
      type: 'set-toolbar',
      surface: 'find-replace',
    })
    expect(find.toolbarSurface).toBe('find-replace')
    expect(find.openOrder).toEqual(['toolbar:find-replace'])
  })
})

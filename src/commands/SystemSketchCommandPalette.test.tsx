import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  editor: {
    getIsReadonly: (() => false) as () => boolean,
    getPages: () => [],
  },
}))

vi.mock('tldraw', async (importOriginal) => {
  const actual = await importOriginal<typeof import('tldraw')>()
  return {
    ...actual,
    useEditor: () => mocks.editor,
    useValue: (_name: string, read: () => unknown) => read(),
  }
})

import { SystemSketchCommandPalette } from './SystemSketchCommandPalette'

describe('SystemSketch command palette', () => {
  beforeEach(() => {
    mocks.editor.getIsReadonly = () => false
  })

  it('renders an accessible command dialog and callback-driven actions', () => {
    const html = renderToStaticMarkup(
      <SystemSketchCommandPalette
        actions={[{
          id: 'zoom-fit',
          label: 'Zoom to fit',
          description: 'Show the whole board',
          shortcut: 'Shift+1',
          run() {},
        }]}
        onClose={() => {}}
      />,
    )

    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('role="tablist"')
    expect(html).toContain('aria-label="Search commands"')
    expect(html).toContain('role="listbox"')
    expect(html).toContain('role="option"')
    expect(html).toContain('Zoom to fit')
    expect(html).toContain('Show the whole board')
    expect(html).toContain('Shift+1')
  })

  it('renders find and replace controls disabled for a read-only board', () => {
    mocks.editor.getIsReadonly = () => true
    const html = renderToStaticMarkup(
      <SystemSketchCommandPalette initialMode="find-replace" onClose={() => {}} />,
    )

    expect(html).toContain('Find &amp; replace')
    expect(html).toContain('aria-label="Find on board"')
    expect(html).toContain('placeholder="Replace with…"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('Searches all pages; hidden shapes stay hidden')
  })
})

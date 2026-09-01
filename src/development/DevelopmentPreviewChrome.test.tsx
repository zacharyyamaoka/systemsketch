import { renderToStaticMarkup } from 'react-dom/server'
import type { Editor, TLUiToolsContextType } from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

import { BlockIcon } from '../blocks/BlockIcon'
import { BLOCK_DEVELOPMENT_OVERRIDES } from './DevelopmentPreviewChrome'

describe('block development UI seam', () => {
  it('claims B for Block and releases B from the stock draw tool', () => {
    const setCurrentTool = vi.fn()
    const editor = { setCurrentTool } as unknown as Editor
    const tools = {
      draw: {
        id: 'draw',
        label: 'Draw',
        icon: 'tool-pencil',
        kbd: 'd,b,x',
        onSelect: vi.fn(),
      },
    } as TLUiToolsContextType

    const overridden = BLOCK_DEVELOPMENT_OVERRIDES.tools?.(editor, tools, {} as never)

    expect(overridden?.draw.kbd).toBe('d,x')
    expect(overridden?.block.kbd).toBe('b')
    overridden?.block.onSelect('toolbar')
    expect(setCurrentTool).toHaveBeenCalledWith('block')
  })

  it('uses the pyblocks cube-plus glyph instead of a stock shape icon', () => {
    const html = renderToStaticMarkup(<BlockIcon />)

    expect(html).toContain('systemsketch-block-icon')
    expect(html).toContain('viewBox="0 0 24 24"')
    expect(html).toContain('M17.3 18.1h5.1')
  })
})

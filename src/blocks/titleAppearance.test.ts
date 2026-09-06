import { describe, expect, it } from 'vitest'

import { getDefaultBlockProps, setBlockViewProps } from './blockModel'
import {
  blockTitleAlign,
  blockTitleBold,
  blockTitleExportAppearance,
  blockTitleFont,
  blockTitleSize,
} from './titleAppearance'

describe('Block title appearance', () => {
  it('retains each legacy face until a person formats its title', () => {
    const simple = getDefaultBlockProps()
    const port = setBlockViewProps(simple, 'port')

    expect([blockTitleSize(port), blockTitleFont(port), blockTitleAlign(port), blockTitleBold(port)])
      .toEqual(['l', 'mono', 'start', false])
    expect([blockTitleSize(simple), blockTitleFont(simple), blockTitleAlign(simple), blockTitleBold(simple)])
      .toEqual(['xl', 'sans', 'middle', true])
  })

  it('makes every authored title control portable to SVG, including custom ink', () => {
    const appearance = blockTitleExportAppearance({
      ...getDefaultBlockProps(),
      titleSize: 'm',
      titleFont: 'serif',
      titleAlign: 'end',
      titleBold: true,
      titleColor: 'custom-a3f2c1',
    })

    expect(appearance).toMatchObject({
      fontSize: 24,
      fontFamily: expect.stringMatching(/Georgia/),
      fontWeight: 700,
      textAlign: 'right',
      justifyContent: 'flex-end',
      color: '#a3f2c1',
    })
  })

  it('centers an unformatted title with its centered header but preserves explicit text alignment', () => {
    const port = setBlockViewProps(getDefaultBlockProps(), 'port')
    expect(blockTitleAlign({ ...port, headerAlign: 'center' })).toBe('middle')
    expect(blockTitleAlign({ ...port, headerAlign: 'center', titleAlign: 'end' })).toBe('end')
  })
})

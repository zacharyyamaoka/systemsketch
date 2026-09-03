import { describe, expect, it } from 'vitest'
import { topNoticePlacement } from './topNoticePlacement'

describe('top notice placement', () => {
  it('uses the top row when the centred notice clears both corner capsules', () => {
    expect(topNoticePlacement({
      viewportWidth: 1990,
      noticeWidth: 784,
      leftChromeRight: 522,
      rightChromeLeft: 1687,
    })).toBe('inline')
  })

  it('drops below when either corner would be covered', () => {
    expect(topNoticePlacement({
      viewportWidth: 1464,
      noticeWidth: 730,
      leftChromeRight: 413,
      rightChromeLeft: 814,
    })).toBe('below')
  })

  it('keeps a safety gap on both sides', () => {
    expect(topNoticePlacement({
      viewportWidth: 1000,
      noticeWidth: 300,
      leftChromeRight: 338,
      rightChromeLeft: 662,
      gap: 12,
    })).toBe('inline')
    expect(topNoticePlacement({
      viewportWidth: 1000,
      noticeWidth: 302,
      leftChromeRight: 338,
      rightChromeLeft: 662,
      gap: 12,
    })).toBe('below')
  })
})

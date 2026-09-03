import { useLayoutEffect, useState, type RefObject } from 'react'

export type TopNoticePlacement = 'inline' | 'below'

interface NoticeFitInput {
  viewportWidth: number
  noticeWidth: number
  leftChromeRight: number
  rightChromeLeft: number
  gap?: number
}

/**
 * A centred notice belongs in the top chrome row only when its actual painted
 * width fits between both corner capsules. Otherwise it drops below them.
 */
export function topNoticePlacement({
  viewportWidth,
  noticeWidth,
  leftChromeRight,
  rightChromeLeft,
  gap = 12,
}: NoticeFitInput): TopNoticePlacement {
  const noticeLeft = (viewportWidth - noticeWidth) / 2
  const noticeRight = noticeLeft + noticeWidth
  return noticeLeft >= leftChromeRight + gap && noticeRight <= rightChromeLeft - gap
    ? 'inline'
    : 'below'
}

/** Share one collision rule between passive Preview status and active REC. */
export function useTopNoticePlacement<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active = true,
): TopNoticePlacement {
  const [placement, setPlacement] = useState<TopNoticePlacement>('below')

  useLayoutEffect(() => {
    if (!active) return
    const notice = ref.current
    const left = document.querySelector<HTMLElement>('[data-testid="systemsketch-top-left-shell"]')
    const right = document.querySelector<HTMLElement>('[data-testid="systemsketch-top-right-shell"]')
    if (!notice || !left || !right) return

    const measure = () => {
      const noticeBounds = notice.getBoundingClientRect()
      const leftBounds = left.getBoundingClientRect()
      const rightBounds = right.getBoundingClientRect()
      setPlacement(topNoticePlacement({
        viewportWidth: window.innerWidth,
        noticeWidth: noticeBounds.width,
        leftChromeRight: leftBounds.right,
        rightChromeLeft: rightBounds.left,
      }))
    }

    measure()
    window.addEventListener('resize', measure)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(notice)
    observer?.observe(left)
    observer?.observe(right)
    return () => {
      window.removeEventListener('resize', measure)
      observer?.disconnect()
    }
  }, [active, ref])

  return placement
}

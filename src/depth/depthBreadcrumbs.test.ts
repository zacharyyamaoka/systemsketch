import { describe, expect, it } from 'vitest'

import { compactDepthBreadcrumbs, type DepthBreadcrumbItem } from './depthBreadcrumbs'

function entry(depth: number, name = `Level ${depth}`): DepthBreadcrumbItem {
  return { id: `shape:${depth}`, name, isCurrent: false }
}

describe('compactDepthBreadcrumbs', () => {
  it('shows every structural level when the path fits the inline budget', () => {
    const entries = [entry(1, 'System'), entry(2, 'Scheduler'), { ...entry(3, 'Dispatch'), isCurrent: true }]

    expect(compactDepthBreadcrumbs('Board', entries)).toEqual(entries)
  })

  it('keeps root context, immediate parent, and current scope while eliding level 2 onward first', () => {
    const entries = [
      entry(1, 'System'),
      entry(2, 'A'.repeat(75)),
      entry(3, 'B'.repeat(75)),
      entry(4, 'C'.repeat(75)),
      { ...entry(5, 'Current dispatch'), isCurrent: true },
    ]

    expect(compactDepthBreadcrumbs('Board', entries)).toEqual([
      entries[0],
      { kind: 'elision', hiddenCount: 2 },
      entries[3],
      entries[4],
    ])
  })

  it('does not compact a short path just because it has multiple depths', () => {
    const entries = [entry(1, 'A'), entry(2, 'B'), { ...entry(3, 'C'), isCurrent: true }]

    expect(compactDepthBreadcrumbs('Board', entries, 150)).toEqual(entries)
  })
})

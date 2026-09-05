export interface DepthBreadcrumbItem {
  kind?: never
  id: string
  name: string
  isCurrent: boolean
}

export type CompactDepthBreadcrumbItem<Entry extends DepthBreadcrumbItem = DepthBreadcrumbItem> = Entry | { kind: 'elision'; hiddenCount: number }

const CHARACTER_BUDGET = 150
const SEPARATOR_LENGTH = 3 // ` › `

function pathLength(rootName: string, entries: readonly DepthBreadcrumbItem[]) {
  return rootName.length + entries.reduce((total, entry) => total + SEPARATOR_LENGTH + entry.name.length, 0)
}

/**
 * Keeps the compact chrome useful as a location cue, rather than turning it
 * into a left- or right-truncated filename. The root, immediate parent, and
 * current scope orient a reader; levels immediately after the root are the
 * least useful first removals, while the disclosure retains every ancestor as
 * a jump target.
 */
export function compactDepthBreadcrumbs<Entry extends DepthBreadcrumbItem>(
  rootName: string,
  entries: readonly Entry[],
  budget = CHARACTER_BUDGET,
): CompactDepthBreadcrumbItem<Entry>[] {
  if (pathLength(rootName, entries) <= budget || entries.length < 3) return [...entries]

  const visible = new Set(entries.map((entry) => entry.id))
  // WHY: Keep the root plus immediate local context legible. When space runs
  // out, the earliest descendant is the least actionable location cue, so
  // delete from level 1 forward rather than surprising the reader by hiding a
  // nearer parent.
  for (const entry of entries.slice(0, -2)) {
    if (pathLength(rootName, entries.filter((candidate) => visible.has(candidate.id))) <= budget) break
    visible.delete(entry.id)
  }

  const compacted = entries.filter((entry) => visible.has(entry.id))
  if (compacted.length === entries.length) return compacted

  const result: CompactDepthBreadcrumbItem<Entry>[] = []
  let hiddenCount = 0
  for (const entry of entries) {
    if (visible.has(entry.id)) {
      if (hiddenCount) {
        result.push({ kind: 'elision', hiddenCount })
        hiddenCount = 0
      }
      result.push(entry)
    } else {
      hiddenCount += 1
    }
  }
  return result
}

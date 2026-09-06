import {
  SHAPE_LIBRARY_ITEMS,
  filterShapeLibraryItems,
  type ShapeLibraryItem,
} from './shapeLibraryModel'

/** A stable name that Settings can use for aliases, even before an editor mounts. */
export interface ToolSearchAliasItem {
  id: string
  label: string
  detail: string
}

/** A visible toolbar choice which arms an existing tldraw UI tool. */
export interface ToolbarToolSearchItem extends ToolSearchAliasItem {
  toolId: string
  searchTerms?: readonly string[]
}

export type ToolSearchItem =
  | { source: 'library'; item: ShapeLibraryItem }
  | { source: 'toolbar'; item: ToolbarToolSearchItem }

/**
 * Search registration for every tool exposed by SystemSketch's product toolbar.
 *
 * WHY this is an explicit catalog instead of tldraw's complete UI-tool map:
 * tldraw also registers tools that SystemSketch deliberately does not put in
 * its toolbar. The S launcher should mirror the tools people can see, while
 * `toolId` keeps every result routed through that visible tool's own public
 * `onSelect` handler. Library-only shapes join this list below.
 */
export const TOOLBAR_TOOL_SEARCH_ITEMS: readonly ToolbarToolSearchItem[] = [
  { id: 'select', label: 'Cursor', detail: 'Toolbar tool', toolId: 'select', searchTerms: ['select', 'pointer'] },
  { id: 'frame', label: 'Frame', detail: 'Toolbar tool', toolId: 'frame' },
  { id: 'block', label: 'Block', detail: 'Toolbar tool', toolId: 'block' },
  { id: 'branch', label: 'Branch', detail: 'Toolbar tool', toolId: 'branch' },
  { id: 'loop', label: 'Loop', detail: 'Toolbar tool', toolId: 'loop' },
  { id: 'behaviorTree', label: 'Behavior Tree', detail: 'Toolbar tool', toolId: 'behaviorTree', searchTerms: ['behavior', 'tree'] },
  { id: 'code', label: 'Code', detail: 'Toolbar tool', toolId: 'code' },
  { id: 'pill', label: 'Pill', detail: 'Toolbar tool', toolId: 'pill', searchTerms: ['value', 'literal'] },
  { id: 'type', label: 'Type', detail: 'Toolbar tool', toolId: 'type' },
  { id: 'callout', label: 'Callout', detail: 'Toolbar tool', toolId: 'callout', searchTerms: ['annotation', 'note'] },
  { id: 'rectangle', label: 'Rectangle', detail: 'Toolbar tool', toolId: 'rectangle' },
  { id: 'ellipse', label: 'Ellipse', detail: 'Toolbar tool', toolId: 'ellipse', searchTerms: ['circle'] },
  { id: 'triangle', label: 'Triangle', detail: 'Toolbar tool', toolId: 'triangle' },
  { id: 'diamond', label: 'Diamond', detail: 'Toolbar tool', toolId: 'diamond' },
  { id: 'line', label: 'Line', detail: 'Toolbar tool', toolId: 'line' },
  { id: 'arrow-straight', label: 'Straight arrow', detail: 'Toolbar tool', toolId: 'systemsketch-arrow-straight', searchTerms: ['arrow', 'connection', 'line'] },
  { id: 'arrow-curve', label: 'Curved arrow', detail: 'Toolbar tool', toolId: 'systemsketch-arrow-curve', searchTerms: ['arrow', 'connection', 'arc'] },
  { id: 'arrow-elbow', label: 'Elbow arrow', detail: 'Toolbar tool', toolId: 'systemsketch-arrow-elbow', searchTerms: ['arrow', 'connection', 'orthogonal'] },
  { id: 'draw', label: 'Pen', detail: 'Toolbar tool', toolId: 'draw', searchTerms: ['draw', 'pencil'] },
  { id: 'highlight', label: 'Highlighter', detail: 'Toolbar tool', toolId: 'highlight' },
  { id: 'text', label: 'Text', detail: 'Toolbar tool', toolId: 'text', searchTerms: ['typing', 'label'] },
]

/** Every search result Settings may attach a personal alias to, once only. */
export const TOOL_SEARCH_ALIAS_ITEMS: readonly ToolSearchAliasItem[] = (() => {
  const byId = new Map<string, ToolSearchAliasItem>()
  for (const item of SHAPE_LIBRARY_ITEMS) {
    byId.set(item.id, {
      id: item.id,
      label: item.label,
      detail: item.kind === 'tool' ? 'Canvas tool' : item.section,
    })
  }
  for (const item of TOOLBAR_TOOL_SEARCH_ITEMS) {
    if (!byId.has(item.id)) byId.set(item.id, item)
  }
  return [...byId.values()]
})()

function wordsIn(query: string): string[] {
  return query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
}

function includesAllWords(words: readonly string[], values: readonly string[]): boolean {
  const haystack = values.join(' ').toLocaleLowerCase()
  return words.every((word) => haystack.includes(word))
}

export function toolSearchItemId(item: ToolSearchItem): string {
  return item.item.id
}

export function toolSearchItemLabel(item: ToolSearchItem): string {
  return item.item.label
}

/** Put the literal name ahead of a synonym such as Text's historic "type" term. */
function matchRank(item: ToolSearchItem, normalizedQuery: string): number {
  const label = toolSearchItemLabel(item).toLocaleLowerCase()
  if (label === normalizedQuery) return 0
  if (label.startsWith(normalizedQuery)) return 1
  return 2
}

/**
 * Merge library-only shapes with every available product-toolbar choice.
 *
 * The `availableToolbarToolIds` fence makes a development mount honest: a
 * row only appears when choosing it can invoke a real registered tool.
 */
export function filterToolSearchItems(
  query: string,
  aliases: Readonly<Record<string, readonly string[]>> = {},
  availableToolbarToolIds: ReadonlySet<string> = new Set(TOOLBAR_TOOL_SEARCH_ITEMS.map((item) => item.toolId)),
): ToolSearchItem[] {
  const words = wordsIn(query)
  if (words.length === 0) return []

  const libraryItems: ToolSearchItem[] = filterShapeLibraryItems(query, aliases)
    .map((item) => ({ source: 'library' as const, item }))
  const libraryIds = new Set(libraryItems.map((item) => item.item.id))
  const toolbarItems: ToolSearchItem[] = TOOLBAR_TOOL_SEARCH_ITEMS
    .filter((item) => availableToolbarToolIds.has(item.toolId))
    .filter((item) => !libraryIds.has(item.id))
    .filter((item) => includesAllWords(words, [
      item.label,
      item.id,
      ...(item.searchTerms ?? []),
      ...(aliases[item.id] ?? []),
    ]))
    .map((item) => ({ source: 'toolbar' as const, item }))

  const normalizedQuery = query.trim().toLocaleLowerCase()
  return [...libraryItems, ...toolbarItems]
    .sort((left, right) => matchRank(left, normalizedQuery) - matchRank(right, normalizedQuery))
}

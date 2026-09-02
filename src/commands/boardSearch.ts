import {
  richTextValidator,
  type Editor,
  type TLPageId,
  type TLRichText,
  type TLShape,
  type TLShapeId,
  type TLShapePartial,
} from 'tldraw'

import { isBlockShape } from '../blocks/blockModel'

export type BoardSearchField = 'block-title' | 'frame-name' | 'rich-text' | 'shape-text'

export interface BoardSearchOptions {
  matchCase?: boolean
  wholeWord?: boolean
}

export type BoardSearchReplaceBlocker =
  | 'locked'
  | 'unsupported-field'
  | 'format-boundary'

export interface BoardSearchMatch {
  /** Stable for one board revision; callers should still treat it as an opaque UI key. */
  id: string
  pageId: TLPageId
  pageName: string
  shapeId: TLShapeId
  shapeType: string
  field: BoardSearchField
  text: string
  start: number
  end: number
  occurrence: number
  replaceable: boolean
  replaceBlocker?: BoardSearchReplaceBlocker
}

export interface BoardReplaceResult {
  ok: boolean
  replacedCount: number
  skippedCount: number
  updatedShapeIds: TLShapeId[]
  reason?: 'missing-shape' | 'stale-match' | 'read-only' | 'unsupported-field' | 'unchanged'
}

interface ShapeTextSource {
  field: BoardSearchField
  text: string
  richText?: TLRichText
  replaceBlocker?: BoardSearchReplaceBlocker
}

interface TextLeaf {
  path: number[]
  text: string
  start: number
  end: number
}

interface TextReplacement {
  start: number
  end: number
  value: string
}

const CAMERA_ANIMATION = { duration: 220 }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function fieldForShape(shape: TLShape): BoardSearchField {
  if (isBlockShape(shape)) return 'block-title'
  if (shape.type === 'frame') return 'frame-name'
  const richText = Reflect.get(shape.props, 'richText')
  if (richTextValidator.isValid(richText)) return 'rich-text'
  return 'shape-text'
}

/**
 * Read the same primary text that the registered tldraw ShapeUtil exposes.
 *
 * Search remains useful for custom/host shapes because discovery is generic;
 * mutation stays deliberately narrow so an unknown shape's data is never
 * guessed at or rewritten.
 */
function textSourceForShape(editor: Editor, shape: TLShape): ShapeTextSource | null {
  let text: string | undefined
  try {
    text = editor.getShapeUtil(shape).getText(shape as never)
  } catch {
    return null
  }
  if (typeof text !== 'string' || text.length === 0) return null

  const field = fieldForShape(shape)
  const locked = editor.getIsReadonly() || shape.isLocked || !editor.canEditShape(shape)
  if (locked) return { field, text, replaceBlocker: 'locked' }
  if (field === 'shape-text') return { field, text, replaceBlocker: 'unsupported-field' }
  if (field !== 'rich-text') return { field, text }

  const richText = Reflect.get(shape.props, 'richText')
  if (!richTextValidator.isValid(richText)) {
    return { field: 'shape-text', text, replaceBlocker: 'unsupported-field' }
  }
  return { field, text, richText }
}

function collectRawTextLeaves(value: unknown, path: number[] = [], leaves: Array<{
  path: number[]
  text: string
}> = []): Array<{ path: number[]; text: string }> {
  if (Array.isArray(value)) {
    value.forEach((child, index) => collectRawTextLeaves(child, [...path, index], leaves))
    return leaves
  }
  if (!isObject(value)) return leaves
  if (value.type === 'text' && typeof value.text === 'string') {
    leaves.push({ path, text: value.text })
    return leaves
  }
  if (Array.isArray(value.content)) {
    value.content.forEach((child, index) => collectRawTextLeaves(child, [...path, index], leaves))
  }
  return leaves
}

/**
 * Map ProseMirror text leaves back onto ShapeUtil.getText() without assuming
 * how stock tldraw renders paragraph separators. Formatting marks and attrs
 * live on these leaves and are therefore retained by a safe replacement.
 */
function locateTextLeaves(richText: TLRichText, plainText: string): TextLeaf[] | null {
  const rawLeaves = collectRawTextLeaves(richText)
  const leaves: TextLeaf[] = []
  let cursor = 0
  for (const leaf of rawLeaves) {
    const start = plainText.indexOf(leaf.text, cursor)
    if (start < 0) return null
    const end = start + leaf.text.length
    leaves.push({ ...leaf, start, end })
    cursor = end
  }
  return leaves
}

function leafForRange(leaves: TextLeaf[] | null, start: number, end: number): TextLeaf | null {
  if (!leaves) return null
  return leaves.find((leaf) => start >= leaf.start && end <= leaf.end) ?? null
}

function wordCharacter(value: string | undefined): boolean {
  return Boolean(value && /[\p{L}\p{N}_]/u.test(value))
}

/** Return ordered, non-overlapping occurrences without interpreting the query as regex. */
export function findTextOccurrences(
  text: string,
  query: string,
  options: BoardSearchOptions = {},
): Array<{ start: number; end: number }> {
  if (!query) return []
  const flags = options.matchCase ? 'gu' : 'giu'
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(escaped, flags)
  const occurrences: Array<{ start: number; end: number }> = []
  for (const match of text.matchAll(pattern)) {
    const start = match.index
    const end = start + match[0].length
    if (options.wholeWord && (wordCharacter(text[start - 1]) || wordCharacter(text[end]))) continue
    occurrences.push({ start, end })
  }
  return occurrences
}

/** A live, cross-page projection of text exposed through public ShapeUtil seams. */
export function searchBoard(
  editor: Editor,
  query: string,
  options: BoardSearchOptions = {},
): BoardSearchMatch[] {
  if (!query) return []
  const matches: BoardSearchMatch[] = []
  const pages = [...editor.getPages()].sort((a, b) =>
    String(a.index).localeCompare(String(b.index)) || String(a.id).localeCompare(String(b.id)),
  )

  for (const page of pages) {
    const shapes = [...editor.getPageShapeIds(page)]
      .map((id) => editor.getShape(id))
      .filter((shape): shape is TLShape => Boolean(shape) && !editor.isShapeHidden(shape!))
      .sort((a, b) =>
        String(a.index).localeCompare(String(b.index)) || String(a.id).localeCompare(String(b.id)),
      )

    for (const shape of shapes) {
      const source = textSourceForShape(editor, shape)
      if (!source) continue
      const leaves = source.richText ? locateTextLeaves(source.richText, source.text) : null
      const occurrences = findTextOccurrences(source.text, query, options)
      occurrences.forEach(({ start, end }, occurrence) => {
        const formatBoundary = source.richText && !leafForRange(leaves, start, end)
        const replaceBlocker = source.replaceBlocker ?? (formatBoundary ? 'format-boundary' : undefined)
        matches.push({
          id: `${page.id}|${shape.id}|${source.field}|${start}`,
          pageId: page.id,
          pageName: page.name.trim() || 'Untitled page',
          shapeId: shape.id,
          shapeType: shape.type,
          field: source.field,
          text: source.text,
          start,
          end,
          occurrence,
          replaceable: !replaceBlocker,
          replaceBlocker,
        })
      })
    }
  }
  return matches
}

function replaceStringRanges(text: string, replacements: TextReplacement[]): string {
  return [...replacements]
    .sort((a, b) => b.start - a.start)
    .reduce((result, replacement) =>
      `${result.slice(0, replacement.start)}${replacement.value}${result.slice(replacement.end)}`,
    text)
}

function updateValueAtPath(
  value: unknown,
  path: number[],
  update: (leaf: Record<string, unknown>) => Record<string, unknown>,
  depth = 0,
): unknown {
  if (depth === path.length) return isObject(value) ? update(value) : value
  if (Array.isArray(value)) {
    const index = path[depth]
    return value.map((child, childIndex) =>
      childIndex === index ? updateValueAtPath(child, path, update, depth + 1) : child,
    )
  }
  if (!isObject(value) || !Array.isArray(value.content)) return value
  const index = path[depth]
  return {
    ...value,
    content: value.content.map((child, childIndex) =>
      childIndex === index ? updateValueAtPath(child, path, update, depth + 1) : child,
    ),
  }
}

function replaceRichTextRanges(
  richText: TLRichText,
  plainText: string,
  replacements: TextReplacement[],
): TLRichText | null {
  const leaves = locateTextLeaves(richText, plainText)
  if (!leaves) return null
  const byPath = new Map<string, { leaf: TextLeaf; replacements: TextReplacement[] }>()
  for (const replacement of replacements) {
    const leaf = leafForRange(leaves, replacement.start, replacement.end)
    if (!leaf) return null
    const key = leaf.path.join('.')
    const group = byPath.get(key) ?? { leaf, replacements: [] }
    group.replacements.push(replacement)
    byPath.set(key, group)
  }

  let next: unknown = richText
  for (const { leaf, replacements: leafReplacements } of byPath.values()) {
    next = updateValueAtPath(next, leaf.path, (node) => ({
      ...node,
      text: replaceStringRanges(
        leaf.text,
        leafReplacements.map((replacement) => ({
          start: replacement.start - leaf.start,
          end: replacement.end - leaf.start,
          value: replacement.value,
        })),
      ),
    }))
  }
  return richTextValidator.isValid(next) ? next : null
}

function partialForReplacement(
  shape: TLShape,
  source: ShapeTextSource,
  replacements: TextReplacement[],
): TLShapePartial<TLShape> | null {
  if (source.field === 'block-title' && isBlockShape(shape)) {
    return {
      id: shape.id,
      type: shape.type,
      props: { title: replaceStringRanges(shape.props.title, replacements) },
    } as TLShapePartial<TLShape>
  }
  if (source.field === 'frame-name' && shape.type === 'frame') {
    return {
      id: shape.id,
      type: shape.type,
      props: { name: replaceStringRanges(shape.props.name, replacements) },
    } as TLShapePartial<TLShape>
  }
  if (source.field === 'rich-text' && source.richText) {
    const richText = replaceRichTextRanges(source.richText, source.text, replacements)
    if (!richText) return null
    return {
      id: shape.id,
      type: shape.type,
      props: { richText },
    } as TLShapePartial<TLShape>
  }
  return null
}

function partialProp(partial: TLShapePartial<TLShape>, key: string): unknown {
  return Reflect.get(partial.props ?? {}, key)
}

export function focusBoardSearchMatch(editor: Editor, match: BoardSearchMatch): boolean {
  const shape = editor.getShape(match.shapeId)
  if (!shape) return false
  const pageId = editor.getAncestorPageId(shape) ?? match.pageId
  if (!editor.getPage(pageId)) return false
  editor.setCurrentPage(pageId)
  editor.setCurrentTool('select')
  editor.select(match.shapeId)
  editor.zoomToSelection({ animation: CAMERA_ANIMATION })
  return true
}

/** Replace one still-current match, refusing to guess after the shape changes. */
export function replaceBoardMatch(
  editor: Editor,
  match: BoardSearchMatch,
  replacement: string,
): BoardReplaceResult {
  const shape = editor.getShape(match.shapeId)
  if (!shape) {
    return { ok: false, replacedCount: 0, skippedCount: 1, updatedShapeIds: [], reason: 'missing-shape' }
  }
  const source = textSourceForShape(editor, shape)
  if (!source || source.field !== match.field || source.text !== match.text) {
    return { ok: false, replacedCount: 0, skippedCount: 1, updatedShapeIds: [], reason: 'stale-match' }
  }
  if (source.replaceBlocker === 'locked') {
    return { ok: false, replacedCount: 0, skippedCount: 1, updatedShapeIds: [], reason: 'read-only' }
  }
  if (!match.replaceable || source.replaceBlocker) {
    return { ok: false, replacedCount: 0, skippedCount: 1, updatedShapeIds: [], reason: 'unsupported-field' }
  }
  const partial = partialForReplacement(shape, source, [{
    start: match.start,
    end: match.end,
    value: replacement,
  }])
  if (!partial) {
    return { ok: false, replacedCount: 0, skippedCount: 1, updatedShapeIds: [], reason: 'unsupported-field' }
  }
  const nextValue = source.field === 'block-title'
    ? partialProp(partial, 'title')
    : source.field === 'frame-name'
      ? partialProp(partial, 'name')
      : partialProp(partial, 'richText')
  const previousValue = source.field === 'rich-text' ? source.richText : source.text
  if (JSON.stringify(nextValue) === JSON.stringify(previousValue)) {
    return { ok: false, replacedCount: 0, skippedCount: 0, updatedShapeIds: [], reason: 'unchanged' }
  }

  editor.markHistoryStoppingPoint('replace board text')
  editor.run(() => editor.updateShape(partial))
  return { ok: true, replacedCount: 1, skippedCount: 0, updatedShapeIds: [shape.id] }
}

/** Replace every safe match in exactly one history boundary and editor transaction. */
export function replaceAllBoardMatches(
  editor: Editor,
  query: string,
  replacement: string,
  options: BoardSearchOptions = {},
): BoardReplaceResult {
  const matches = searchBoard(editor, query, options)
  const safeMatches = matches.filter((match) => match.replaceable)
  const groups = new Map<string, BoardSearchMatch[]>()
  for (const match of safeMatches) {
    const key = `${match.shapeId}|${match.field}`
    const group = groups.get(key) ?? []
    group.push(match)
    groups.set(key, group)
  }

  const updates: TLShapePartial<TLShape>[] = []
  const updatedShapeIds: TLShapeId[] = []
  let replacedCount = 0
  for (const group of groups.values()) {
    const first = group[0]
    const shape = editor.getShape(first.shapeId)
    if (!shape) continue
    const source = textSourceForShape(editor, shape)
    if (!source || source.field !== first.field || source.replaceBlocker) continue
    const partial = partialForReplacement(shape, source, group.map((match) => ({
      start: match.start,
      end: match.end,
      value: replacement,
    })))
    if (!partial) continue

    const nextValue = source.field === 'block-title'
      ? partialProp(partial, 'title')
      : source.field === 'frame-name'
        ? partialProp(partial, 'name')
        : partialProp(partial, 'richText')
    const previousValue = source.field === 'rich-text' ? source.richText : source.text
    if (JSON.stringify(nextValue) === JSON.stringify(previousValue)) continue
    updates.push(partial)
    updatedShapeIds.push(shape.id)
    replacedCount += group.length
  }

  if (updates.length === 0) {
    return {
      ok: false,
      replacedCount: 0,
      skippedCount: matches.length,
      updatedShapeIds: [],
      reason: matches.length === 0
        ? undefined
        : safeMatches.length === 0
          ? 'unsupported-field'
          : 'unchanged',
    }
  }
  editor.markHistoryStoppingPoint('replace all board text')
  editor.run(() => editor.updateShapes(updates))
  return {
    ok: true,
    replacedCount,
    skippedCount: matches.length - replacedCount,
    updatedShapeIds,
  }
}

/** Human-readable field name for search results and assistive descriptions. */
export function boardSearchFieldLabel(field: BoardSearchField): string {
  switch (field) {
    case 'block-title': return 'Block title'
    case 'frame-name': return 'Frame name'
    case 'rich-text': return 'Shape text'
    case 'shape-text': return 'Shape text (view only)'
  }
}

export function boardSearchMatchSnippet(
  match: BoardSearchMatch,
  contextLength = 36,
): { before: string; found: string; after: string } {
  const beforeStart = Math.max(0, match.start - contextLength)
  const afterEnd = Math.min(match.text.length, match.end + contextLength)
  return {
    before: `${beforeStart > 0 ? '…' : ''}${match.text.slice(beforeStart, match.start)}`,
    found: match.text.slice(match.start, match.end),
    after: `${match.text.slice(match.end, afterEnd)}${afterEnd < match.text.length ? '…' : ''}`,
  }
}

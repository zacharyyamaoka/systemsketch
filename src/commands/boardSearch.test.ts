import {
  createShapeId,
  PageRecordType,
  type Editor,
  type TLPage,
  type TLPageId,
  type TLRichText,
  type TLShape,
  type TLShapeId,
  type TLShapePartial,
} from 'tldraw'
import { describe, expect, it, vi } from 'vitest'

import { getDefaultBlockProps } from '../blocks/blockModel'
import {
  boardSearchMatchSnippet,
  findTextOccurrences,
  focusBoardSearchMatch,
  replaceAllBoardMatches,
  replaceBoardMatch,
  searchBoard,
} from './boardSearch'

function richTextPlainText(value: unknown): string {
  if (Array.isArray(value)) return value.map(richTextPlainText).join('')
  if (!value || typeof value !== 'object') return ''
  const node = value as Record<string, unknown>
  if (node.type === 'text') return typeof node.text === 'string' ? node.text : ''
  if (!Array.isArray(node.content)) return ''
  return node.content.map(richTextPlainText).join(node.type === 'doc' ? '\n' : '')
}

function page(id: string, name: string, index: string): TLPage {
  return { id: PageRecordType.createId(id), typeName: 'page', name, index, meta: {} } as TLPage
}

function shape(
  id: string,
  type: string,
  parentId: TLPageId,
  index: string,
  props: Record<string, unknown>,
  isLocked = false,
): TLShape {
  return {
    id: createShapeId(id),
    typeName: 'shape',
    type,
    parentId,
    index,
    x: 0,
    y: 0,
    rotation: 0,
    opacity: 1,
    isLocked,
    meta: {},
    props,
  } as unknown as TLShape
}

function block(id: string, parentId: TLPageId, index: string, title: string, locked = false) {
  return shape(id, 'block', parentId, index, {
    ...getDefaultBlockProps(),
    title,
  }, locked)
}

function makeEditor(
  pages: TLPage[],
  initialShapes: TLShape[],
  hiddenIds: TLShapeId[] = [],
) {
  const shapes = new Map(initialShapes.map((item) => [item.id, item]))
  const hidden = new Set(hiddenIds)
  const history: string[] = []
  const events: string[] = []
  let currentPageId = pages[0]?.id
  let selected: TLShapeId[] = []

  const applyPartial = (partial: TLShapePartial<TLShape>) => {
    const current = shapes.get(partial.id)
    if (!current) return
    shapes.set(current.id, {
      ...current,
      ...partial,
      props: { ...current.props, ...partial.props },
    } as TLShape)
  }
  const editor = {
    getPages: () => pages,
    getPage: (id: TLPageId) => pages.find((candidate) => candidate.id === id),
    getPageShapeIds: (candidate: TLPage | TLPageId) => {
      const id = typeof candidate === 'string' ? candidate : candidate.id
      return new Set([...shapes.values()].filter((item) => item.parentId === id).map((item) => item.id))
    },
    getShape: (id: TLShapeId) => shapes.get(id),
    getAncestorPageId: (candidate: TLShape | TLShapeId) => {
      const item = typeof candidate === 'string' ? shapes.get(candidate) : candidate
      return item?.parentId as TLPageId | undefined
    },
    getShapeUtil: (candidate: TLShape) => ({
      getText: () => {
        if (candidate.type === 'block') return Reflect.get(candidate.props, 'title') as string
        if (candidate.type === 'frame') return Reflect.get(candidate.props, 'name') as string
        const richText = Reflect.get(candidate.props, 'richText')
        if (richText) return richTextPlainText(richText)
        return Reflect.get(candidate.props, 'text') as string | undefined
      },
    }),
    isShapeHidden: (candidate: TLShape | TLShapeId) => hidden.has(typeof candidate === 'string' ? candidate : candidate.id),
    canEditShape: (candidate: TLShape) => !candidate.isLocked,
    getIsReadonly: () => false,
    markHistoryStoppingPoint: (label: string) => { history.push(label); events.push('mark') },
    run: (callback: () => void) => { events.push('run:start'); callback(); events.push('run:end') },
    updateShape: (partial: TLShapePartial<TLShape>) => { events.push('update:one'); applyPartial(partial); return editor },
    updateShapes: (partials: TLShapePartial<TLShape>[]) => {
      events.push(`update:${partials.length}`)
      partials.forEach(applyPartial)
      return editor
    },
    setCurrentPage: vi.fn((id: TLPageId) => { currentPageId = id }),
    setCurrentTool: vi.fn(),
    select: vi.fn((id: TLShapeId) => { selected = [id] }),
    zoomToSelection: vi.fn(),
  } as unknown as Editor

  return {
    editor,
    shapes,
    history,
    events,
    currentPage: () => currentPageId,
    selected: () => selected,
  }
}

describe('board text search', () => {
  it('finds literal text case-insensitively and supports case and whole-word constraints', () => {
    expect(findTextOccurrences('Alpha alpha alphabet a.lpha', 'alpha')).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
      { start: 12, end: 17 },
    ])
    expect(findTextOccurrences('Alpha alpha alphabet', 'alpha', { matchCase: true })).toEqual([
      { start: 6, end: 11 },
      { start: 12, end: 17 },
    ])
    expect(findTextOccurrences('Alpha alpha alphabet', 'alpha', { wholeWord: true })).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
    ])
    expect(findTextOccurrences('a.lpha aXlpha', 'a.lpha')).toEqual([{ start: 0, end: 6 }])
  })

  it('orders pages and shapes by index, excludes hidden shapes, and exposes view-only custom text', () => {
    const first = page('first', 'First', 'a1')
    const second = page('second', 'Second', 'a2')
    const hiddenShape = block('hidden', first.id, 'a0', 'target hidden')
    const custom = shape('custom', 'host-card', first.id, 'a3', { text: 'target custom' })
    const { editor } = makeEditor(
      [second, first],
      [
        block('second-block', second.id, 'a2', 'target second'),
        block('first-late', first.id, 'a2', 'target late'),
        block('first-early', first.id, 'a1', 'target early'),
        hiddenShape,
        custom,
      ],
      [hiddenShape.id],
    )

    const matches = searchBoard(editor, 'target')
    expect(matches.map((match) => [match.pageName, match.shapeId])).toEqual([
      ['First', createShapeId('first-early')],
      ['First', createShapeId('first-late')],
      ['First', createShapeId('custom')],
      ['Second', createShapeId('second-block')],
    ])
    expect(matches[2]).toMatchObject({
      field: 'shape-text',
      replaceable: false,
      replaceBlocker: 'unsupported-field',
    })
  })

  it('replaces a current Block match and refuses stale or locked matches', () => {
    const first = page('first', 'First', 'a1')
    const editable = block('editable', first.id, 'a1', 'Alpha node')
    const locked = block('locked', first.id, 'a2', 'Alpha locked', true)
    const harness = makeEditor([first], [editable, locked])
    const [match, lockedMatch] = searchBoard(harness.editor, 'Alpha')

    expect(replaceBoardMatch(harness.editor, match, 'Beta')).toMatchObject({ ok: true, replacedCount: 1 })
    expect(Reflect.get(harness.shapes.get(editable.id)!.props, 'title')).toBe('Beta node')
    expect(harness.history).toEqual(['replace board text'])
    expect(harness.events).toEqual(['mark', 'run:start', 'update:one', 'run:end'])
    expect(replaceBoardMatch(harness.editor, match, 'Gamma').reason).toBe('stale-match')
    expect(replaceBoardMatch(harness.editor, lockedMatch, 'Gamma').reason).toBe('read-only')
  })

  it('replaces Block, Frame, and rich text in one history boundary while retaining marks', () => {
    const first = page('first', 'First', 'a1')
    const richText = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Alpha and Alpha', marks: [{ type: 'bold' }] }],
      }],
    } as TLRichText
    const blockShape = block('block', first.id, 'a1', 'Alpha Block')
    const frameShape = shape('frame', 'frame', first.id, 'a2', { name: 'Alpha Frame' })
    const geoShape = shape('geo', 'geo', first.id, 'a3', { richText })
    const harness = makeEditor([first], [blockShape, frameShape, geoShape])

    const result = replaceAllBoardMatches(harness.editor, 'Alpha', 'Beta')

    expect(result).toMatchObject({ ok: true, replacedCount: 4, skippedCount: 0 })
    expect(harness.history).toEqual(['replace all board text'])
    expect(harness.events).toEqual(['mark', 'run:start', 'update:3', 'run:end'])
    expect(Reflect.get(harness.shapes.get(blockShape.id)!.props, 'title')).toBe('Beta Block')
    expect(Reflect.get(harness.shapes.get(frameShape.id)!.props, 'name')).toBe('Beta Frame')
    const updatedRichText = Reflect.get(harness.shapes.get(geoShape.id)!.props, 'richText') as TLRichText
    expect(richTextPlainText(updatedRichText)).toBe('Beta and Beta')
    expect((updatedRichText.content[0] as { content: Array<{ marks: unknown }> }).content[0].marks)
      .toEqual([{ type: 'bold' }])
  })

  it('keeps a match spanning differently formatted leaves navigable but not replaceable', () => {
    const first = page('first', 'First', 'a1')
    const richText = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Al', marks: [{ type: 'bold' }] },
          { type: 'text', text: 'pha' },
        ],
      }],
    } as TLRichText
    const geoShape = shape('geo', 'geo', first.id, 'a1', { richText })
    const harness = makeEditor([first], [geoShape])

    const [match] = searchBoard(harness.editor, 'Alpha')
    expect(match).toMatchObject({ replaceable: false, replaceBlocker: 'format-boundary' })
    expect(replaceAllBoardMatches(harness.editor, 'Alpha', 'Beta')).toMatchObject({
      ok: false,
      replacedCount: 0,
      skippedCount: 1,
    })
    expect(harness.history).toEqual([])
  })

  it('navigates across pages and produces a bounded highlighted snippet', () => {
    const first = page('first', 'First', 'a1')
    const second = page('second', 'Second', 'a2')
    const destination = block('destination', second.id, 'a1', 'A long prefix around the Needle and a long suffix')
    const harness = makeEditor([first, second], [destination])
    const [match] = searchBoard(harness.editor, 'Needle')

    expect(focusBoardSearchMatch(harness.editor, match)).toBe(true)
    expect(harness.currentPage()).toBe(second.id)
    expect(harness.selected()).toEqual([destination.id])
    expect(harness.editor.setCurrentTool).toHaveBeenCalledWith('select')
    expect(harness.editor.zoomToSelection).toHaveBeenCalledWith({ animation: { duration: 220 } })
    expect(boardSearchMatchSnippet(match, 8)).toEqual({
      before: '…und the ',
      found: 'Needle',
      after: ' and a l…',
    })
  })
})

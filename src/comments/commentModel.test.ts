import { describe, expect, it, vi } from 'vitest'
import {
  createComment,
  createCommentThread,
  createTLStore,
  toRichText,
  type Editor,
  type TLComment,
  type TLCommentThread,
  type TLPageId,
  type TLShape,
  type TLShapeId,
} from 'tldraw'
import {
  createLocalCommentThread,
  deleteLocalComment,
  deleteLocalCommentThread,
  deriveCommentAnchor,
  formatSourceReference,
  getLocalCommentThreads,
  normalizeSourceReference,
  parseSourceReferenceInput,
  replyToLocalCommentThread,
  revealLocalCommentThread,
  setLocalCommentThreadResolved,
  sourceReferenceFromMeta,
  sourceReferenceMeta,
  SYSTEMSKETCH_COMMENT_RECORDS,
} from './commentModel'

const PAGE_ID = 'page:one' as TLPageId
const SECOND_PAGE_ID = 'page:two' as TLPageId
const SHAPE_ID = 'shape:block' as TLShapeId

function makeShape(): TLShape {
  return {
    id: SHAPE_ID,
    typeName: 'shape',
    type: 'block',
    parentId: PAGE_ID,
    index: 'a1',
    x: 10,
    y: 20,
    rotation: 0,
    opacity: 1,
    isLocked: false,
    meta: {},
    props: { title: 'Pipeline' },
  } as unknown as TLShape
}

function commentEditor(initial: unknown[] = [], selected: TLShape[] = [makeShape()]) {
  const records = new Map<string, unknown>(
    initial.map((record) => [(record as { id: string }).id, record]),
  )
  const put = vi.fn((next: unknown[]) => {
    next.forEach((record) => records.set((record as { id: string }).id, record))
  })
  const run = vi.fn((fn: () => void) => fn())
  const editor = {
    store: {
      allRecords: () => [...records.values()],
      get: (id: string) => records.get(id),
      put,
    },
    run,
    getCurrentPageId: () => PAGE_ID,
    getSelectedShapes: () => selected,
    getTextOptions: () => ({}),
    getPage: (id: TLPageId) => (
      id === PAGE_ID
        ? { id: PAGE_ID, name: 'Architecture' }
        : id === SECOND_PAGE_ID
          ? { id: SECOND_PAGE_ID, name: 'Runtime' }
          : undefined
    ),
    getShape: (id: TLShapeId) => selected.find((shape) => shape.id === id),
    getShapeUtil: () => ({ getText: () => 'Pipeline' }),
    getShapePageBounds: vi.fn(() => ({ x: 10, y: 20, w: 220, h: 140 })),
    getViewportPageBounds: vi.fn(() => ({ center: { x: 640, y: 360 } })),
    setCurrentPage: vi.fn(),
    setCurrentTool: vi.fn(),
    select: vi.fn(),
    selectNone: vi.fn(),
    zoomToBounds: vi.fn(),
    zoomToFit: vi.fn(),
  } as unknown as Editor
  return { editor, records, put, run }
}

describe('comment source references', () => {
  it('parses compact Python file, line range, and symbol references', () => {
    expect(parseSourceReferenceInput(' src/pipeline.py:24-31#Pipeline.build ')).toEqual({
      path: 'src/pipeline.py',
      startLine: 24,
      endLine: 31,
      symbol: 'Pipeline.build',
    })
    expect(parseSourceReferenceInput('C:\\repo\\model.py:7')).toEqual({
      path: 'C:\\repo\\model.py',
      startLine: 7,
    })
    expect(parseSourceReferenceInput('src/plain.py')).toEqual({ path: 'src/plain.py' })
    expect(parseSourceReferenceInput('   ')).toBeNull()
  })

  it('round-trips validated metadata and rejects malformed source payloads', () => {
    const source = normalizeSourceReference({
      path: ' engine.py ',
      symbol: ' tick ',
      startLine: 12,
      endLine: 4,
      digest: ' abc ',
    })
    expect(source).toEqual({
      path: 'engine.py',
      symbol: 'tick',
      startLine: 12,
      endLine: 12,
      digest: 'abc',
    })
    expect(formatSourceReference(source!)).toBe('engine.py:12#tick')
    expect(sourceReferenceFromMeta(sourceReferenceMeta(source))).toEqual(source)
    expect(sourceReferenceFromMeta({ systemSketchSource: { path: '' } })).toBeNull()
    expect(sourceReferenceFromMeta({ systemSketchSource: 'not an object' })).toBeNull()
  })
})

describe('local comment mutations', () => {
  it('registers all official comment record types with a stock tldraw store', () => {
    const store = createTLStore({ records: SYSTEMSKETCH_COMMENT_RECORDS })
    const thread = createCommentThread({
      pageId: PAGE_ID,
      anchor: { type: 'page' },
      createdBy: 'systemsketch:local-author',
    })
    const comment = createComment({
      threadId: thread.id,
      pageId: thread.pageId,
      authorId: 'systemsketch:local-author',
      body: toRichText('Stored locally'),
    })

    ;(store as unknown as { put(records: unknown[]): void }).put([thread, comment])
    expect((store.allRecords() as unknown[]).filter(
      (record) => (record as { typeName: string }).typeName.startsWith('comment'),
    )).toEqual(expect.arrayContaining([thread, comment]))
  })

  it('creates an official thread and first comment at the selected shape outside undo history', () => {
    const { editor, records, run } = commentEditor()
    const threadId = createLocalCommentThread(editor, {
      body: '  Check this transform.  ',
      source: { path: 'pipeline.py', startLine: 42 },
      now: 1_000,
    })

    expect(threadId).toMatch(/^comment-thread:/)
    expect(run).toHaveBeenCalledWith(expect.any(Function), { history: 'ignore' })
    const thread = records.get(threadId!) as TLCommentThread
    expect(thread.typeName).toBe('comment-thread')
    expect(thread.anchor).toEqual({
      type: 'shape',
      shapeId: SHAPE_ID,
      x: 1,
      y: 0,
      isPrecise: false,
    })
    expect(sourceReferenceFromMeta(thread.meta)).toEqual({ path: 'pipeline.py', startLine: 42 })
    const first = [...records.values()].find(
      (record): record is TLComment => (record as TLComment).typeName === 'comment',
    )!
    expect(first.threadId).toBe(threadId)
    expect(first.authorId).toBe('systemsketch:local-author')
    expect(first.createdAt).toBe(1_000)
  })

  it('uses the viewport centre or an explicit point without exactly one selected shape', () => {
    const { editor } = commentEditor([], [])
    expect(deriveCommentAnchor(editor)).toEqual({ type: 'point', x: 640, y: 360 })
    expect(deriveCommentAnchor(editor, { x: 30, y: 40 })).toEqual({
      type: 'point',
      x: 30,
      y: 40,
    })
    expect(createLocalCommentThread(editor, { body: '   ' })).toBeNull()
  })

  it('replies, resolves, reopens, and soft-deletes threads and messages', () => {
    const thread = createCommentThread({
      pageId: PAGE_ID,
      anchor: { type: 'page' },
      createdBy: 'systemsketch:local-author',
      now: 100,
    })
    const first = createComment({
      threadId: thread.id,
      pageId: PAGE_ID,
      authorId: 'systemsketch:local-author',
      body: toRichText('First'),
      now: 100,
    })
    const { editor, records } = commentEditor([thread, first], [])

    const replyId = replyToLocalCommentThread(editor, thread.id, 'Second', undefined, 200)
    expect(replyId).toMatch(/^comment:/)
    expect(setLocalCommentThreadResolved(editor, thread.id, true, undefined, 300)).toBe(true)
    expect((records.get(thread.id) as TLCommentThread).resolved).toEqual({
      at: 300,
      by: 'systemsketch:local-author',
    })
    expect(setLocalCommentThreadResolved(editor, thread.id, false)).toBe(true)
    expect((records.get(thread.id) as TLCommentThread).resolved).toBeNull()
    expect(deleteLocalComment(editor, replyId!)).toBe(true)
    expect((records.get(replyId!) as TLComment).isDeleted).toBe(true)
    expect(deleteLocalCommentThread(editor, thread.id)).toBe(true)
    expect((records.get(thread.id) as TLCommentThread).isDeleted).toBe(true)
    expect((records.get(first.id) as TLComment).isDeleted).toBe(true)
    expect(replyToLocalCommentThread(editor, thread.id, 'After deletion')).toBeNull()
  })
})

describe('local comment projection and navigation', () => {
  it('groups messages, hides soft-deleted records, and orders open threads before resolved ones', () => {
    const shapeThread = createCommentThread({
      pageId: PAGE_ID,
      anchor: { type: 'shape', shapeId: SHAPE_ID, x: 1, y: 0, isPrecise: false },
      createdBy: 'systemsketch:local-author',
      now: 100,
      meta: sourceReferenceMeta({ path: 'pipeline.py', startLine: 8 }),
    })
    const pageThread = {
      ...createCommentThread({
        pageId: SECOND_PAGE_ID,
        anchor: { type: 'page' },
        createdBy: 'someone-else',
        now: 300,
      }),
      resolved: { at: 400, by: 'someone-else' },
    }
    const records = [
      shapeThread,
      pageThread,
      createComment({
        threadId: shapeThread.id,
        pageId: PAGE_ID,
        authorId: 'systemsketch:local-author',
        body: toRichText('First\nmessage'),
        now: 100,
      }),
      createComment({
        threadId: pageThread.id,
        pageId: SECOND_PAGE_ID,
        authorId: 'someone-else',
        body: toRichText('Resolved'),
        now: 350,
      }),
    ]
    const { editor } = commentEditor(records)
    const model = getLocalCommentThreads(editor)

    expect(model.map((item) => item.record.id)).toEqual([shapeThread.id, pageThread.id])
    expect(model[0]).toMatchObject({
      anchorLabel: 'Pipeline · Architecture',
      targetExists: true,
      source: { path: 'pipeline.py', startLine: 8 },
    })
    expect(model[0].comments[0]).toMatchObject({
      body: 'First\nmessage',
      authorLabel: 'You',
    })
    expect(model[1].comments[0].authorLabel).toBe('someone-else')
  })

  it('reveals shape, point, region, and page anchors with public camera APIs', () => {
    const { editor } = commentEditor()
    const shapeThread = createCommentThread({
      pageId: PAGE_ID,
      anchor: { type: 'shape', shapeId: SHAPE_ID, x: 1, y: 0, isPrecise: false },
      createdBy: 'me',
    })
    expect(revealLocalCommentThread(editor, shapeThread)).toBe(true)
    expect(editor.setCurrentPage).toHaveBeenCalledWith(PAGE_ID)
    expect(editor.select).toHaveBeenCalledWith(SHAPE_ID)
    expect(editor.zoomToBounds).toHaveBeenCalledWith(
      { x: 10, y: 20, w: 220, h: 140 },
      { inset: 72, animation: { duration: 220 } },
    )

    const pointThread = createCommentThread({
      pageId: PAGE_ID,
      anchor: { type: 'point', x: 500, y: 400 },
      createdBy: 'me',
    })
    expect(revealLocalCommentThread(editor, pointThread)).toBe(true)
    expect(editor.zoomToBounds).toHaveBeenLastCalledWith(
      { x: 400, y: 300, w: 200, h: 200 },
      { inset: 72, animation: { duration: 220 } },
    )

    const regionThread = createCommentThread({
      pageId: PAGE_ID,
      anchor: { type: 'region', x: 4, y: 5, w: 60, h: 80 },
      createdBy: 'me',
    })
    expect(revealLocalCommentThread(editor, regionThread)).toBe(true)
    expect(editor.zoomToBounds).toHaveBeenLastCalledWith(
      { type: 'region', x: 4, y: 5, w: 60, h: 80 },
      { inset: 72, animation: { duration: 220 } },
    )

    const pageThread = createCommentThread({
      pageId: PAGE_ID,
      anchor: { type: 'page' },
      createdBy: 'me',
    })
    expect(revealLocalCommentThread(editor, pageThread)).toBe(true)
    expect(editor.zoomToFit).toHaveBeenCalledWith({ animation: { duration: 220 } })
  })
})

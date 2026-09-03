import { describe, expect, it } from 'vitest'
import type { Editor, TLShapeId } from 'tldraw'

import {
  inspectorSubjectOwnsHeader,
  inspectorSubjectTitle,
  readInspectorSubject,
  resolveInspectorSubject,
  type InspectorSubject,
} from './inspectorSubject'

const EMPTY = {
  hasBranch: false, hasLoop: false, hasBlockContext: false, hasConnection: false, hasSelection: false,
}

describe('resolveInspectorSubject', () => {
  it('keeps the precedence the chrome used to hold inline', () => {
    expect(resolveInspectorSubject({ ...EMPTY, hasBranch: true, hasBlockContext: true, hasSelection: true }))
      .toBe('branch')
    // A Branch wins over a Loop too — they cannot both be the only selection,
    // but if a reader ever answered both true the region subject still wins
    // over the Block lens below it.
    expect(resolveInspectorSubject({ ...EMPTY, hasLoop: true, hasBlockContext: true, hasSelection: true }))
      .toBe('loop')
    expect(resolveInspectorSubject({ ...EMPTY, hasConnection: true, hasSelection: true }))
      .toBe('connection')
    // A Block wins over a cable, because a Block carries far more to edit.
    expect(resolveInspectorSubject({ ...EMPTY, hasBlockContext: true, hasConnection: true, hasSelection: true }))
      .toBe('block')
  })

  it('routes a selection nobody claims to the shape lens', () => {
    expect(resolveInspectorSubject({ ...EMPTY, hasSelection: true })).toBe('shape')
  })

  it('is empty only when nothing at all is selected', () => {
    expect(resolveInspectorSubject(EMPTY)).toBe('empty')
  })

  it('keeps the Block lens for the armed Block tool with nothing selected', () => {
    // `getBlockInspectorContext` returns kind `tool` while the tool is armed,
    // which is a Block context even though the selection is empty.
    expect(resolveInspectorSubject({ ...EMPTY, hasBlockContext: true })).toBe('block')
  })
})

describe('inspectorSubjectOwnsHeader', () => {
  it('is true exactly for the panels that draw their own close button', () => {
    const owns: Record<InspectorSubject, boolean> = {
      block: true,
      branch: true,
      loop: true,
      connection: false,
      shape: false,
      empty: false,
    }
    for (const [subject, expected] of Object.entries(owns)) {
      expect(inspectorSubjectOwnsHeader(subject as InspectorSubject)).toBe(expected)
    }
  })

  it('leaves the dock header — the only pointer way out — on every other subject', () => {
    for (const subject of ['connection', 'shape', 'empty'] as const) {
      expect(inspectorSubjectOwnsHeader(subject)).toBe(false)
      expect(inspectorSubjectTitle(subject)).not.toBe('')
    }
  })
})

describe('readInspectorSubject', () => {
  const reader = (
    branch: unknown,
    kind: string,
    connection: unknown,
    loop: unknown = null,
  ) => ({
    getOnlySelectedBranch: () => branch,
    getOnlySelectedLoop: () => loop,
    getBlockInspectorContextKind: () => kind,
    getConnectionInspectorContext: () => connection,
  })
  const editor = (selected: string[]) => ({
    getSelectedShapeIds: () => selected as TLShapeId[],
  } as unknown as Editor)

  it('treats an empty Block context plus a selection as the shape lens', () => {
    expect(readInspectorSubject(editor(['shape:a']), reader(null, 'empty', null))).toBe('shape')
  })

  it('treats an empty Block context and no selection as empty', () => {
    expect(readInspectorSubject(editor([]), reader(null, 'empty', null))).toBe('empty')
  })

  it('reads a Block context of any kind as the Block lens', () => {
    for (const kind of ['selected', 'multi', 'tool']) {
      expect(readInspectorSubject(editor(['shape:a']), reader(null, kind, null))).toBe('block')
    }
  })

  it('reads a selected Loop as the loop lens, ahead of the Block lens', () => {
    expect(readInspectorSubject(editor(['shape:loop']), reader(null, 'empty', null, {}))).toBe('loop')
  })
})

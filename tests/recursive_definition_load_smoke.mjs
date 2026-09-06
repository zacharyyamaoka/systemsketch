#!/usr/bin/env node
/**
 * A Definition may recursively call itself. Its nested occurrence is a real
 * member of the outer body, not an independent copy target. Loading this
 * deliberately overlapping set of member stamps used to assign the leaf as
 * its own parent and crash tldraw while it walked binding ancestry.
 */
import assert from 'node:assert/strict'

import {
  delay,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const { checks, pass } = makeChecklist()

async function main() {
  const app = await startApp({
    label: 'systemsketch-recursive-definition-load',
    build: 'recursive-definition-load-smoke',
  })
  const { page, port } = app

  try {
    await openApp(page, port, '?previewClone')
    await waitFor(page, 'window.__systemsketch?.editor', 'blank product editor')

    await evaluate(page, `(() => {
      const editor = window.__systemsketch.editor
      const snapshot = editor.getSnapshot()
      const base = editor.getShapeUtil('block').getDefaultProps()
      const props = {
        ...base,
        title: 'recurse()',
        view: 'expanded',
        w: 600,
        h: 400,
        views: { ...base.views, expanded: { w: 600, h: 400 } },
        definitionId: 'recursive-definition',
        definitionKey: 'recurse',
      }
      const shape = (id, parentId, index, meta = {}) => ({
        id,
        typeName: 'shape',
        type: 'block',
        x: 40,
        y: 40,
        rotation: 0,
        isLocked: false,
        opacity: 1,
        index,
        parentId,
        meta,
        props,
      })
      const member = (occurrenceId) => ({
        systemSketchDefinitionMember: {
          definitionId: 'recursive-definition',
          memberId: 'recursive-member',
          occurrenceId,
        },
      })
      editor.loadSnapshot({
        ...snapshot,
        document: {
          ...snapshot.document,
          store: {
            ...snapshot.document.store,
            'shape:recursive-root': shape(
              'shape:recursive-root', editor.getCurrentPageId(), 'a1',
            ),
            'shape:recursive-middle': shape(
              'shape:recursive-middle', 'shape:recursive-root', 'a2',
              member('shape:recursive-root'),
            ),
            'shape:recursive-leaf': shape(
              'shape:recursive-leaf', 'shape:recursive-middle', 'a3',
              member('shape:recursive-middle'),
            ),
          },
        },
      }, { forceOverwriteSessionState: true })
      return true
    })()`)

    await waitFor(page,
      `window.__systemsketch?.editor?.getShape('shape:recursive-leaf')`,
      'recursive Definition after snapshot load')
    await delay(120)
    const hierarchy = JSON.parse(await evaluate(page, `JSON.stringify({
      middleParent: window.__systemsketch.editor.getShape('shape:recursive-middle')?.parentId,
      leafParent: window.__systemsketch.editor.getShape('shape:recursive-leaf')?.parentId,
      cycle: document.querySelector('.tl-error-boundary') !== null,
    })`))
    assert.deepEqual(hierarchy, {
      middleParent: 'shape:recursive-root',
      leafParent: 'shape:recursive-middle',
      cycle: false,
    })
    pass('a recursive Definition reloads without becoming its own parent')

    assert.deepEqual(await localConsoleErrors(page), [])
    pass('the real editor reports no runtime errors while loading it')

    console.log(`recursive Definition load smoke · ${checks.length} checks passed`)
  } finally {
    app.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

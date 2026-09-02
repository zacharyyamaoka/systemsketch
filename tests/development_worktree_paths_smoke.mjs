#!/usr/bin/env node

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import {
  ROOT,
  delay,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const linkedDirectory = await mkdtemp(join(ROOT, '.systemsketch-linked-board-'))
const linkedBoard = join(linkedDirectory, 'Linked.systemsketch')
const outsideBoard = join('/tmp', `systemsketch-outside-${process.pid}.systemsketch`)
const app = await startApp({
  label: 'systemsketch-worktree-paths',
  build: 'development-worktree-paths',
  allowSourceRoot: true,
})
const { page, port, apiPort } = app

try {
  await openApp(page, port, `?board=${encodeURIComponent(linkedBoard)}`)
  await waitFor(page, 'window.__systemsketch?.editor', 'the linked worktree board')
  await evaluate(page, `(() => {
    window.__systemsketch.editor.createShape({
      id: 'shape:linked-proof',
      type: 'geo',
      x: 240,
      y: 180,
      props: { geo: 'rectangle', w: 260, h: 140, color: 'green', fill: 'semi' },
    })
  })()`)
  await waitFor(
    page,
    `['dirty', 'saving'].includes(document.querySelector('.systemsketch-file-title i')?.dataset.state)`,
    'the source-worktree board to become dirty',
  )
  await waitFor(
    page,
    `document.querySelector('.systemsketch-file-title i')?.dataset.state === 'clean'`,
    'autosave into the source worktree',
  )
  await delay(200)

  const document = JSON.parse(await readFile(linkedBoard, 'utf8'))
  if (!document.records.some((record) => record.id === 'shape:linked-proof')) {
    throw new Error('the source-worktree document did not receive the saved shape')
  }

  await openApp(page, port, `?board=${encodeURIComponent(linkedBoard)}`)
  await waitFor(
    page,
    `window.__systemsketch?.editor?.getShape('shape:linked-proof')`,
    'the cold-reopened source-worktree shape',
  )

  await writeFile(outsideBoard, await readFile(linkedBoard))
  const rejected = await fetch(
    `http://127.0.0.1:${apiPort}/api/workspace/file?path=${encodeURIComponent(outsideBoard)}`,
  )
  const rejection = await rejected.json()
  if (rejected.status !== 400 || !String(rejection.error).includes('allowed root')) {
    throw new Error(`an unrelated machine path was not rejected: ${rejected.status} ${JSON.stringify(rejection)}`)
  }

  const errors = localConsoleErrors(page)
  if (errors.length) throw new Error(`browser console errors: ${errors.join('; ')}`)
  process.stdout.write('PASS source-worktree URL opened, autosaved, and cold-reopened\n')
  process.stdout.write('PASS unrelated machine path remained rejected\n')
} finally {
  app.close()
  await rm(linkedDirectory, { recursive: true, force: true })
  await rm(outsideBoard, { force: true })
}

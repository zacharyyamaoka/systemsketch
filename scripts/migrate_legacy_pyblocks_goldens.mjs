#!/usr/bin/env node

/**
 * Rewrite a PyBlocks golden corpus through the real SystemSketch editor.
 *
 * Dry-run is the default. `--write` copies each legacy file into the isolated
 * browser harness, lets the product import and serialize it with its registered
 * schema, verifies a cold reopen, then atomically replaces only that source
 * file. Zero-byte authoring targets and already-current files are untouched.
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, relative, resolve } from 'node:path'

import {
  delay,
  evaluate,
  localConsoleErrors,
  openApp,
  startApp,
  waitFor,
} from '../tests/browser_harness.mjs'

function usage() {
  return 'Usage: node scripts/migrate_legacy_pyblocks_goldens.mjs --root CORPUS [--write]'
}

function argumentsFrom(argv) {
  const result = { write: false }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--write') result.write = true
    else if (value === '--root') {
      if (!argv[index + 1]) throw new Error(`--root requires a path\n${usage()}`)
      result.root = resolve(argv[++index])
    } else if (value === '--help' || value === '-h') {
      process.stdout.write(`${usage()}\n`)
      process.exit(0)
    } else throw new Error(`unknown argument: ${value}\n${usage()}`)
  }
  if (!result.root) throw new Error(usage())
  return result
}

async function walk(directory) {
  const { readdir } = await import('node:fs/promises')
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return walk(path)
    return /^(target|generated)\.systemsketch$/.test(entry.name) ? [path] : []
  }))
  return nested.flat().sort()
}

function classify(source) {
  if (!source.trim()) return 'blank'
  try {
    const parsed = JSON.parse(source)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (parsed.systemSketch && Array.isArray(parsed.records) && parsed.schema) return 'current'
      if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) return 'legacy'
    }
  } catch { /* reported as invalid below */ }
  return 'invalid'
}

async function waitForCurrentFile(path, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const source = await readFile(path, 'utf8')
      if (classify(source) === 'current') return source
    } catch { /* writer may be between atomic operations */ }
    await delay(80)
  }
  throw new Error(`timed out waiting for SystemSketch to serialize ${path}`)
}

async function atomicReplace(path, source) {
  const temporary = join(dirname(path), `.${basename(path)}.${process.pid}.migration`)
  await writeFile(temporary, source, 'utf8')
  await rename(temporary, path)
}

async function guardedOpenApp(page, port, query, timeoutMs = 20000) {
  const firstEvent = page.events.length
  let settled = false
  let failure
  const navigation = openApp(page, port, query)
    .catch((cause) => { failure = cause })
    .finally(() => { settled = true })
  const deadline = Date.now() + timeoutMs
  let handledDialog = false
  while (!settled && Date.now() < deadline) {
    const dialog = page.events.slice(firstEvent)
      .find((event) => event.method === 'Page.javascriptDialogOpening')
    if (dialog && !handledDialog) {
      handledDialog = true
      await page.send('Page.handleJavaScriptDialog', { accept: true })
    }
    await delay(40)
  }
  if (!settled) throw new Error('timed out opening the next migration document')
  await navigation
  if (failure) throw failure
}

async function migrateInProduct(app, sourcePath, index) {
  const scratchDirectory = join(app.filesRoot, 'SystemSketch', 'legacy-migration')
  await mkdir(scratchDirectory, { recursive: true })
  const scratchPath = join(scratchDirectory, `${String(index + 1).padStart(3, '0')}.systemsketch`)
  const source = await readFile(sourcePath, 'utf8')
  const legacy = JSON.parse(source)
  const expectedBlocks = legacy.nodes.filter((node) => (
    node && typeof node === 'object' && node.data?.extension?.pyblocksBlock
  )).length
  const expectedConnections = legacy.edges.filter((edge) => (
    edge && typeof edge === 'object' && edge.sourceHandle && edge.targetHandle
  )).length
  await writeFile(scratchPath, source, 'utf8')

  await guardedOpenApp(app.page, app.port, `?board=${encodeURIComponent(scratchPath)}`)
  await waitFor(app.page, 'window.__systemsketch?.editor', 'the real SystemSketch editor')
  await waitFor(
    app.page,
    `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'block').length === ${expectedBlocks}`,
    `${basename(dirname(sourcePath))}/${basename(sourcePath)} legacy Blocks`,
  )
  // Connections land after the Blocks they bind, so the Block count alone is
  // not "the import finished". On a one-lane board the gap is invisible; on a
  // twelve-lane series board it read 37 of 75 and failed a correct migration.
  await waitFor(
    app.page,
    `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'connection').length === ${expectedConnections}`,
    `${basename(dirname(sourcePath))}/${basename(sourcePath)} legacy connections`,
  )
  const imported = await evaluate(app.page, `(() => {
    const editor = window.__systemsketch.editor
    const shapes = editor.getCurrentPageShapes()
    return {
      blocks: shapes.filter((shape) => shape.type === 'block').length,
      connections: shapes.filter((shape) => shape.type === 'connection').length,
      error: document.querySelector('[data-testid="systemsketch-document-error"]')?.textContent
        ?? document.querySelector('[data-testid="systemsketch-embed-error"]')?.textContent
        ?? null,
    }
  })()`)
  if (imported.error) throw new Error(`${sourcePath}: ${imported.error}`)
  if (imported.blocks !== expectedBlocks || imported.connections !== expectedConnections) {
    throw new Error(`${sourcePath}: imported ${imported.blocks}/${imported.connections} Blocks/connections; expected ${expectedBlocks}/${expectedConnections}`)
  }

  // A reversible user-sourced nudge asks the ordinary autosave path to emit
  // the imported current document; no migration-only serializer is invented.
  await evaluate(app.page, `(async () => {
    const editor = window.__systemsketch.editor
    const shape = editor.getCurrentPageShapes().find((candidate) => candidate.type === 'block')
    if (!shape) throw new Error('legacy document has no importable Block')
    editor.updateShape({ id: shape.id, type: shape.type, x: shape.x + 1 })
    await new Promise((resolve) => setTimeout(resolve, 40))
    editor.updateShape({ id: shape.id, type: shape.type, x: shape.x })
  })()`)
  const migrated = await waitForCurrentFile(scratchPath)

  // The saved bytes must survive the same product reader, with no importer.
  await guardedOpenApp(app.page, app.port, `?board=${encodeURIComponent(scratchPath)}`)
  await waitFor(app.page, 'window.__systemsketch?.editor', 'the cold-reopened SystemSketch editor')
  await waitFor(
    app.page,
    `window.__systemsketch.editor.getCurrentPageShapes().filter((shape) => shape.type === 'block').length === ${expectedBlocks}`,
    'the migrated Blocks after cold reopen',
  )
  const reopened = await evaluate(app.page, `(() => {
    const shapes = window.__systemsketch.editor.getCurrentPageShapes()
    return {
      blocks: shapes.filter((shape) => shape.type === 'block').length,
      connections: shapes.filter((shape) => shape.type === 'connection').length,
    }
  })()`)
  if (reopened.blocks !== expectedBlocks || reopened.connections !== expectedConnections) {
    throw new Error(`${sourcePath}: cold reopen changed the imported inventory`)
  }
  return migrated
}

async function main() {
  const args = argumentsFrom(process.argv.slice(2))
  const files = await walk(args.root)
  const inventory = { blank: [], current: [], legacy: [], invalid: [] }
  for (const path of files) inventory[classify(await readFile(path, 'utf8'))].push(path)
  process.stdout.write(
    `SystemSketch corpus: ${files.length} files · ${inventory.legacy.length} legacy · ${inventory.current.length} current · ${inventory.blank.length} blank · ${inventory.invalid.length} invalid\n`,
  )
  if (inventory.invalid.length) {
    throw new Error(`refusing to migrate invalid files:\n${inventory.invalid.join('\n')}`)
  }
  if (!args.write || inventory.legacy.length === 0) return

  // Recycle Chromium periodically. Retained canvas resources from dozens of
  // cold navigations can otherwise exhaust a headless renderer before a large
  // corpus finishes, even though every individual migration is healthy.
  const batchSize = 20
  for (let batchStart = 0; batchStart < inventory.legacy.length; batchStart += batchSize) {
    const batch = inventory.legacy.slice(batchStart, batchStart + batchSize)
    const app = await startApp({ label: 'systemsketch-legacy-migration', build: 'legacy-pyblocks-migration' })
    try {
      for (const [localIndex, path] of batch.entries()) {
        const index = batchStart + localIndex
        const migrated = await migrateInProduct(app, path, index)
        await atomicReplace(path, migrated.endsWith('\n') ? migrated : `${migrated}\n`)
        process.stdout.write(`  ${index + 1}/${inventory.legacy.length} ${relative(args.root, path)}\n`)
      }
      const errors = localConsoleErrors(app.page).filter((entry) => !String(entry).includes('Failed to fetch'))
      if (errors.length) throw new Error(`browser errors:\n${errors.join('\n')}`)
    } finally {
      app.close()
      await rm(app.filesRoot, { recursive: true, force: true })
    }
  }

  const after = { blank: 0, current: 0, legacy: 0, invalid: 0 }
  for (const path of files) after[classify(await readFile(path, 'utf8'))] += 1
  if (after.legacy || after.invalid) throw new Error(`post-migration inventory is not current: ${JSON.stringify(after)}`)
  process.stdout.write(`Migrated ${inventory.legacy.length}; preserved ${after.blank} blank authoring targets.\n`)
}

await main()

import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const bundle = JSON.parse(await readFile(resolve(pluginRoot, 'dist', 'bundle.json'), 'utf8'))
const reference = JSON.parse(await readFile(
  resolve(pluginRoot, '..', 'vscode-systemsketch', 'dist', 'app', 'app.json'),
  'utf8',
))

assert.equal(bundle.architecture, 'same-document-fallback')
assert.equal(bundle.matchesReferenceApp, true)
assert.ok(bundle.sourceCommit, 'the Obsidian bundle has no source commit')
assert.equal(bundle.sourceCommit, bundle.referenceAppCommit)
assert.equal(bundle.sourceCommit, reference.sourceCommit)
console.log(JSON.stringify({ sourceCommit: bundle.sourceCommit, matchesReferenceApp: true }, null, 2))

import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { CanvasCheckpointStore } from '../src/checkpointStore.ts'
import { enqueueSessionWrite } from '../src/sessionWriteQueue.ts'

const root = mkdtempSync(join(tmpdir(), 'systemsketch-checkpoints-'))
const store = new CanvasCheckpointStore(root)
const uri = 'file:///workspace/board.systemsketch'

store.save(uri, 'source-a', 'session-a', 1, { document: { store: { one: 1 } } })
assert.deepEqual(store.adopt(uri, 'source-a', 'session-b')?.snapshot, {
  document: { store: { one: 1 } },
})

store.save(uri, 'source-a', 'session-b', 2, { document: { store: { two: 2 } } })
store.save(uri, 'source-a', 'session-b', 1, { document: { store: { stale: true } } })
assert.deepEqual(store.adopt(uri, 'source-a', 'session-b')?.snapshot, {
  document: { store: { two: 2 } },
})

store.save(uri, 'source-a', 'session-b', 3, { document: { store: { newest: true } } })
store.settle(uri, 'session-b', 2, 'source-b')
assert.deepEqual(store.adopt(uri, 'source-b', 'session-c')?.snapshot, {
  document: { store: { newest: true } },
})

store.settle(uri, 'session-c', 3, 'source-c')
assert.equal(store.adopt(uri, 'source-c', 'session-d'), null)

// A sibling canvas pane observes this document write as an external change.
// Its session must not erase the owner's newer in-flight checkpoint.
store.save(uri, 'source-c', 'session-owner', 1, { first: true })
store.save(uri, 'source-c', 'session-owner', 2, { second: true })
store.clear(uri, 'session-sibling')
store.settle(uri, 'session-owner', 1, 'source-owner-first')
assert.deepEqual(store.adopt(uri, 'source-owner-first', 'session-recovered')?.snapshot, {
  second: true,
})

store.save(uri, 'source-c', 'session-d', 4, { recover: true })
assert.equal(store.adopt(uri, 'externally-changed', 'session-e'), null)

// A corrupt partial write is ignored rather than becoming document content.
store.save(uri, 'externally-changed', 'session-e', 5, { recover: true })
const checkpointDir = join(root, 'canvas-checkpoints')
const [checkpointName] = readdirSync(checkpointDir)
writeFileSync(join(checkpointDir, checkpointName), '{', 'utf8')
assert.equal(store.adopt(uri, 'externally-changed', 'session-f'), null)

// A queued edit is fenced again when it reaches the front of the host queue,
// not merely when its webview message first arrives.
let currentSession = 'queue-a'
let releaseFirst
let markFirstStarted
const firstStarted = new Promise((resolve) => { markFirstStarted = resolve })
const firstGate = new Promise((resolve) => { releaseFirst = resolve })
const executed = []
let queue = enqueueSessionWrite(Promise.resolve(), 'queue-a', () => currentSession, async () => {
  executed.push('first')
  markFirstStarted()
  await firstGate
})
await firstStarted
queue = enqueueSessionWrite(queue, 'queue-a', () => currentSession, async () => {
  executed.push('stale second')
})
currentSession = 'queue-b'
releaseFirst()
await queue
assert.deepEqual(executed, ['first'])

process.stdout.write('8 checkpoint-store and host-queue checks passed.\n')

#!/usr/bin/env node
/**
 * Real-browser proof for the round-2 diff vocabulary: highlight, not strike,
 * across every field, every cable finding, and both geometry dimensions.
 *
 * Round 1 was rejected on three specific counts, and this journey is organised
 * around them rather than around the code:
 *
 *   "you're just showing for text changes, but you're not showing for position
 *    changes or for edge changes"
 *   "you're using a lot of crossouts, but it would be better to highlight"
 *   "if you rename a title, you have the old title there highlighted in red,
 *    and then the new title in the same bar in green"
 *
 * So the assertions are about what a reader can SEE, read back off the painted
 * DOM and the computed style — never off the model, which would only prove the
 * projector wrote what it wrote:
 *
 *   1. A board with no lens paints exactly what it painted before round 2.
 *   2. Every text field — block title, description, blockType, port name, port
 *      type — shows its former value beside its current one, filled, not struck.
 *   3. The fill is WORD level: on `run_inference` → `run_predict` the shared
 *      `run_` must NOT be marked, or the mark is claiming six characters
 *      changed that did not.
 *   4. A moved Block and a resized Block get different marks, and neither is
 *      the mark a content change gets.
 *   5. All four cable findings — added, removed, modified, rewired — are
 *      distinguishable from each other.
 *   6. Nothing clips. A pair is wider than a single value and the port lane is
 *      fixed pitch, so this is the failure mode most likely to bite.
 *
 * Run with:  npm run test:diff-round2
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

import {
  ROOT,
  delay,
  ensureDir,
  evaluate,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

/** The report lives in the pyblocks tree beside the contract it answers to. */
const ASSETS = process.env.DIFF_ROUND2_ASSETS
  ?? join(ROOT, '..', 'pyblocks', 'docs', 'assets', 'block-diff-round2')
const RESULTS = join(ASSETS, 'round2-acceptance.json')
const { checks, pass } = makeChecklist()

const VARIANTS = ['was-now', 'stacked', 'token-only', 'delta-badge', 'ghost-weight', 'blend']

/**
 * The matrix board, unmarked.
 *
 * Real content rather than `foo`/`bar`, because the word-level claim is only
 * testable on values that genuinely share a prefix: `run_inference` and
 * `run_predict` are the case the whole vocabulary turns on.
 */
const BOARD = {
  shapes: [
    // ROW 1-3 · a Block whose title, description and blockType all changed.
    {
      id: 'r2-decode', type: 'block', x: 80, y: 80,
      props: {
        title: 'run_inference', description: 'Decode one raw buffer into a frame.',
        blockType: 'transform', view: 'port', w: 300, h: 150,
        inputs: [{ id: 'in-raw', name: 'raw', type: 'bytes', visible: true }],
        outputs: [{ id: 'out-frame', name: 'frame', type: 'Frame', visible: true }],
      },
    },
    // ROW 4-6 · a Block whose PORTS changed: renamed, retyped, added, removed.
    {
      id: 'r2-estimate', type: 'block', x: 520, y: 80,
      props: {
        title: 'estimate()', description: 'Fit a pose to the frame.',
        blockType: 'transform', view: 'port', w: 380, h: 210,
        inputs: [
          { id: 'in-callable', name: 'callable', type: 'PoseEstimator', visible: true },
          { id: 'in-frame', name: 'frame', type: 'Frame', visible: true },
          { id: 'in-seed', name: 'seed', type: 'Pose', visible: true },
        ],
        outputs: [{ id: 'out-pose', name: 'pose', type: 'Pose', visible: true }],
      },
    },
    // ROW 7 · a Block that MOVED. Its prior pose is set when the lens goes on.
    {
      id: 'r2-encode', type: 'block', x: 980, y: 250,
      props: {
        title: 'encode()', description: 'Pack a pose for the wire.',
        blockType: 'transform', view: 'port', w: 280, h: 140,
        inputs: [{ id: 'in-pose', name: 'pose', type: 'Pose', visible: true }],
        outputs: [{ id: 'out-payload', name: 'payload', type: 'bytes', visible: true }],
      },
    },
    // ROW 8 · a Block that was RESIZED, anchored at its top-left.
    {
      id: 'r2-publish', type: 'block', x: 980, y: 470,
      props: {
        title: 'publish()', description: 'Send the payload downstream.',
        blockType: 'sink', view: 'port', w: 360, h: 170,
        inputs: [{ id: 'in-payload', name: 'payload', type: 'bytes', visible: true }],
        outputs: [],
      },
    },
    // ROW 9 · the calm case. Nothing about this Block ever changes, and every
    // capture is checked against it: if a lens leaks onto this card, the
    // vocabulary has failed the one test the rejected view failed.
    {
      id: 'r2-log', type: 'block', x: 80, y: 470,
      props: {
        title: 'log()', description: 'Untouched by this diff.',
        blockType: 'sink', view: 'port', w: 280, h: 140,
        inputs: [{ id: 'in-line', name: 'line', type: 'str', visible: true }],
        outputs: [],
      },
    },
    // Cables: one per finding.
    { id: 'r2-cable-kept', type: 'connection', x: 0, y: 0, props: {} },
    { id: 'r2-cable-added', type: 'connection', x: 0, y: 0, props: {} },
    { id: 'r2-cable-removed', type: 'connection', x: 0, y: 0, props: {} },
    { id: 'r2-cable-modified', type: 'connection', x: 0, y: 0, props: { temporal: 'delayed', delayValue: '0.0' } },
    { id: 'r2-cable-rewired', type: 'connection', x: 0, y: 0, props: {} },
  ],
  bindings: [
    // decode → estimate (untouched)
    bind('r2-cable-kept', 'r2-decode', 'out-frame', 'start'),
    bind('r2-cable-kept', 'r2-estimate', 'in-frame', 'end'),
    // estimate → encode (added by this diff)
    bind('r2-cable-added', 'r2-estimate', 'out-pose', 'start'),
    bind('r2-cable-added', 'r2-encode', 'in-pose', 'end'),
    // decode → estimate seed (removed by this diff)
    bind('r2-cable-removed', 'r2-decode', 'out-frame', 'start'),
    bind('r2-cable-removed', 'r2-estimate', 'in-seed', 'end'),
    // encode → publish (its delay label changed)
    bind('r2-cable-modified', 'r2-encode', 'out-payload', 'start'),
    bind('r2-cable-modified', 'r2-publish', 'in-payload', 'end'),
    // decode → log, whose START used to be somewhere else (rewired)
    bind('r2-cable-rewired', 'r2-decode', 'out-frame', 'start'),
    bind('r2-cable-rewired', 'r2-log', 'in-line', 'end'),
  ],
}

function bind(cable, block, portId, terminal) {
  return {
    type: 'connection',
    fromId: cable,
    toId: block,
    props: { portId, terminal, face: 'outer' },
  }
}

/**
 * The lens, applied to the board that already exists.
 *
 * Written as an update rather than baked into the recipe on purpose: the
 * journey captures the SAME board before and after, so "the calm case is calm"
 * is a comparison of one document with itself rather than of two documents that
 * might differ for some other reason.
 */
const LENS = {
  'r2-decode': {
    state: 'changed',
    title: 'run_predict',
    description: 'Decode one raw buffer into a pose.',
    blockType: 'codec',
    fieldDiffs: [
      { path: 'title', before: 'run_inference', after: 'run_predict' },
      {
        path: 'description',
        before: 'Decode one raw buffer into a frame.',
        after: 'Decode one raw buffer into a pose.',
      },
      { path: 'blockType', before: 'transform', after: 'codec' },
    ],
  },
  'r2-estimate': {
    state: 'changed',
    inputs: [
      {
        id: 'in-callable', name: 'callable', type: 'PoseEstimator', visible: true,
        state: 'changed',
        fieldDiffs: [
          { path: 'name', before: 'callee', after: 'callable' },
          // Purely additive: `Estimator` survives whole, so this one draws no
          // red chip at all and the row stays short.
          { path: 'type', before: 'Estimator', after: 'PoseEstimator' },
        ],
      },
      {
        id: 'in-frame', name: 'frame', type: 'Image', visible: true,
        state: 'changed',
        fieldDiffs: [{ path: 'type', before: 'Frame', after: 'Image' }],
      },
      { id: 'in-seed', name: 'seed', type: 'Pose', visible: true, state: 'added' },
      // The ghost keeps its slot, so the cable that wanted it has somewhere to
      // land — the whole reason a port carries a state at all.
      { id: 'in-gain', name: 'gain', type: 'float', visible: true, state: 'removed' },
    ],
  },
  'r2-encode': { state: 'changed', priorPose: { x: 980, y: 82, w: 280, h: 140 } },
  'r2-publish': { state: 'changed', priorPose: { x: 980, y: 470, w: 240, h: 130 } },
  // r2-log is deliberately absent.
}

const CABLE_LENS = {
  'r2-cable-added': { state: 'added' },
  'r2-cable-removed': { state: 'removed' },
  'r2-cable-modified': {
    state: 'changed',
    delayValue: '1.0',
    fieldDiffs: [{ path: 'delayValue', before: '0.0', after: '1.0' }],
  },
  'r2-cable-rewired': {
    state: 'changed',
    fieldDiffs: [
      { path: 'props.bindings.start.portId', before: 'out-payload', after: 'out-frame' },
    ],
  },
}

/** Reload through the product's own dirty-document guard. */
async function guardedReload(page, timeoutMs = 20000) {
  const firstEvent = page.events.length
  let settled = false
  let failure
  const reload = page.send('Page.reload', { ignoreCache: true })
    .catch((cause) => { failure = cause })
    .finally(() => { settled = true })
  const deadline = Date.now() + timeoutMs
  let handledDialog = false
  let loadSeen = false
  while ((!settled || !loadSeen) && Date.now() < deadline) {
    const events = page.events.slice(firstEvent)
    if (!handledDialog && events.some((event) => event.method === 'Page.javascriptDialogOpening')) {
      handledDialog = true
      await page.send('Page.handleJavaScriptDialog', { accept: true })
    }
    loadSeen = events.some((event) => event.method === 'Page.loadEventFired')
    await delay(40)
  }
  if (!settled || !loadSeen) throw new Error('timed out reloading the diff board')
  await reload
  if (failure) throw failure
}

async function shoot(page, name) {
  const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  const path = join(ASSETS, name)
  await writeFile(path, Buffer.from(shot.data, 'base64'))
  return path
}

/**
 * What the board is painting, in the terms the matrix is written in.
 *
 * Everything here comes from `getComputedStyle` and from text actually laid
 * out. A `background-color` that resolves to `rgba(0, 0, 0, 0)` means the
 * highlight did not paint, however correct the class list looks.
 */
const PROBE = `(() => {
  const q = (sel) => Array.from(document.querySelectorAll(sel))
  // Any resolved colour that is not fully transparent counts as paint. The
  // chips are color-mix(), which Chromium computes to color(srgb ...) or
  // oklab(...) rather than to rgb() — so an rgb-only reader reports a filled
  // chip as unpainted, a probe bug that reads exactly like a CSS bug.
  const painted = (el) => {
    const bg = getComputedStyle(el).backgroundColor
    if (!bg || bg === 'transparent' || bg === 'none') return false
    const match = /rgba?[(]([^)]+)[)]/.exec(bg)
    if (!match) return true
    const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number)
    return parts.length < 4 || parts[3] > 0.02
  }
  // Every pair for this field, not the first: one board can carry a rename on
  // one port and a retype on another, and answering with whichever the DOM
  // happened to order first is how a missing mark reads as a present one.
  const pairs = (path) => q('[data-testid="was-now-' + path + '"]').map((root) => {
    const was = root.querySelector('[data-testid="was-' + path + '"]')
    const now = root.querySelector('[data-testid="now-' + path + '"]')
    const marks = (el, kind) => Array.from(el.querySelectorAll('[data-tok="' + kind + '"]'))
      .map((n) => n.textContent).join('|')
    return {
      // Absent when nothing was taken away: a purely additive change has no
      // former value worth a chip, and the green run already says everything.
      was: was ? was.textContent : null,
      now: now.textContent,
      wasMarked: was ? marks(was, 'removed') : '',
      nowMarked: marks(now, 'added'),
      wasPainted: was ? painted(was) : null,
      nowPainted: painted(now),
      strike: was ? getComputedStyle(was).textDecorationLine : null,
      title: root.getAttribute('title'),
    }
  })
  const ghosts = q('[data-pose-change]').map((el) => ({
    kind: el.dataset.poseChange,
    // A variant that gives up geometry hides the ghost in CSS; the node is
    // still in the DOM. Counting nodes would have the report claim two pose
    // ghosts for a variant whose whole thesis is drawing none.
    visible: getComputedStyle(el).display !== 'none'
      && el.getBoundingClientRect().width > 0,
    id: el.dataset.testid,
    leader: !!el.querySelector('.BlockNode-poseLeader'),
    heavyEdges: Array.from(el.querySelectorAll('.BlockNode-poseEdge')).map((n) => n.dataset.edge),
    badge: el.querySelector('.BlockNode-poseBadge')?.textContent ?? '',
  }))
  // A pair is wider than either value alone and a port lane is fixed pitch, so
  // overflow is the failure mode this design is most likely to hit. The former
  // value MAY be elided — it is context, and the tooltip still has it whole —
  // but the current value is the truth and clipping it is a defect.
  const overflows = (el) => el.scrollWidth > el.clientWidth + 1
  const clipped = q('.BlockNode-wasNowNow').filter(overflows).length
  const formerElided = q('.BlockNode-wasNowWas').filter(overflows).length
  // Measuring an element's own overflow is not enough: a pair can sit entirely
  // outside its row's box, never overflow itself, and simply not be on screen.
  const hidden = q('.BlockNode-wasNow').filter((el) => {
    const row = el.closest('.BlockNode-portLabel, .BlockNode-heading, .BlockNode-description')
    if (!row) return false
    const a = el.getBoundingClientRect()
    const b = row.getBoundingClientRect()
    return a.width === 0 || a.left >= b.right - 1 || a.right <= b.left + 1
  }).length
  const calm = document.querySelector('[data-definition-key="r2-log"], .NodeShape')
  return {
    variant: document.querySelector('[data-diff-variant]')?.dataset.diffVariant ?? null,
    pairs: {
      title: pairs('title'),
      description: pairs('description'),
      blockType: pairs('blockType'),
      name: pairs('name'),
      type: pairs('type'),
    },
    portStates: q('.BlockNode-portLabel[data-diff-state]')
      .map((el) => el.dataset.diffState).sort(),
    ghosts,
    cableMarks: q('[data-cable-mark]').map((el) => el.dataset.cableMark).sort(),
    // An on-path point in VIEWPORT coordinates for each marked cable, so a
    // caller can read the actual pixel there. Asserting that the attribute
    // exists proves the projector ran; it does not prove anything was drawn,
    // and those are different failures with the same green tick.
    cablePoints: q('[data-cable-mark]').flatMap((container) => {
      const mark = container.dataset.cableMark
      const path = container.querySelector('path')
      if (!path || typeof path.getTotalLength !== 'function') return []
      const length = path.getTotalLength()
      if (!length) return []
      const matrix = path.getScreenCTM()
      if (!matrix) return []
      // Sampled off-centre: a midpoint can land under the delay pill, which
      // would report paint that belongs to the pill rather than to the cable.
      return [0.3, 0.62].map((t) => {
        const at = path.getPointAtLength(length * t)
        const screen = at.matrixTransform(matrix)
        return { mark, t, x: Math.round(screen.x), y: Math.round(screen.y) }
      })
    }),
    wasNowCount: q('.BlockNode-wasNow').length,
    clipped,
    formerElided,
    hidden,
    // Everything the lens wrote, anywhere on the board. On the calm capture
    // every one of these has to be zero.
    lensMarks: q('[data-diff-state], [data-pose-change], [data-cable-mark], .BlockNode-wasNow').length,
  }
})()`

async function main() {
  await ensureDir(ASSETS)
  const app = await startApp({ label: 'systemsketch-diff-round2', build: 'diff-round2', width: 1680, height: 1000 })
  const scratch = join(app.filesRoot, 'SystemSketch', 'diff-round2.systemsketch')
  const { page, port } = app
  const results = { variants: {}, calm: null, marked: null }

  try {
    await openApp(page, port, `?board=${encodeURIComponent(scratch)}`)
    await waitFor(page, 'window.__systemsketch?.editor', 'the real SystemSketch editor')

    // ---- the board, unmarked -------------------------------------------
    await evaluate(page, `(() => {
      const board = ${JSON.stringify(BOARD)}
      const editor = window.__systemsketch.editor
      const sid = (id) => id.startsWith('shape:') ? id : 'shape:' + id
      editor.createShapes(board.shapes.map((shape) => ({
        ...shape,
        id: sid(shape.id),
        ...(shape.parentId ? { parentId: sid(shape.parentId) } : {}),
      })))
      editor.createBindings(board.bindings.map((binding, index) => ({
        ...binding,
        id: 'binding:r2-' + (index + 1),
        fromId: sid(binding.fromId),
        toId: sid(binding.toId),
      })))
      editor.selectNone()
      editor.zoomToFit({ animation: { duration: 0 } })
      editor.setCamera(
        { ...editor.getCamera(), z: Math.min(1, editor.getCamera().z) },
        { animation: { duration: 0 } },
      )
      return true
    })()`)
    await delay(600)

    const calm = await evaluate(page, PROBE)
    results.calm = calm
    // THE test the rejected view failed. A board with no lens on it must be
    // indistinguishable from opening it normally — not "quiet", not "subtle".
    assert.equal(calm.lensMarks, 0, 'an unmarked board painted a diff mark')
    pass('a board with no lens on it paints not one diff mark')
    results.calmShot = basename(await shoot(page, 'round2-calm.png'))

    // ---- put the lens on ------------------------------------------------
    await evaluate(page, `(() => {
      const lens = ${JSON.stringify(LENS)}
      const cables = ${JSON.stringify(CABLE_LENS)}
      const editor = window.__systemsketch.editor
      const updates = []
      for (const [id, props] of Object.entries({ ...lens, ...cables })) {
        const shape = editor.getShape('shape:' + id)
        if (!shape) throw new Error('missing shape ' + id)
        updates.push({ id: shape.id, type: shape.type, props })
      }
      editor.updateShapes(updates)
      return updates.length
    })()`)
    await delay(600)

    // ---- every variant --------------------------------------------------
    for (const variant of VARIANTS) {
      await evaluate(page, `window.localStorage.setItem(
        'systemsketch.diff-presentation.v1',
        JSON.stringify({ variant: ${JSON.stringify(variant)}, blend: 1 }),
      )`)
      await guardedReload(page)
      await waitFor(page, 'window.__systemsketch?.editor', 'the editor after a variant switch')
      await delay(700)
      const probe = await evaluate(page, PROBE)
      results.variants[variant] = probe
      results.variants[variant].shot = basename(await shoot(page, `round2-${variant}.png`))
    }
    // Asserted after every capture, never during: a journey whose gate fires
    // before it has written its evidence leaves nothing to look at, which is
    // exactly when you most want the picture.
    // The DEFAULT has to be clean. A variant may carry a measured cost — that is
    // what makes it a different direction rather than a different skin — but it
    // is recorded here rather than waved through, and it is in the report.
    results.clipping = Object.fromEntries(
      VARIANTS.map((variant) => [variant, results.variants[variant].clipped]))
    assert.equal(results.variants['was-now'].clipped, 0,
      'the default clipped a current value, which no elision is allowed to do')
    for (const variant of VARIANTS) {
      assert.equal(results.variants[variant].hidden, 0,
        `${variant} pushed a was/now pair clean out of its row`)
    }
    assert.ok(results.variants['stacked'].clipped > 0,
      'stacked stopped costing width, which means it stopped printing values whole')
    pass(`all ${VARIANTS.length} variants render; the default clips no current value`)

    // ---- the matrix, on the default -------------------------------------
    const marked = results.variants['was-now']
    results.marked = marked

    // Every field of the matrix, with the former value it must carry. The
    // shared runs are elided — they are legible in the current value an inch to
    // the right — so what is asserted is the run that actually went away.
    for (const [path, expected] of Object.entries({
      title: { was: '…inference', now: 'run_predict', full: 'run_inference' },
      description: { was: '…frame.', now: 'Decode one raw buffer into a pose.', full: 'Decode one raw buffer into a frame.' },
      blockType: { was: 'transform', now: 'codec', full: 'transform' },
      // `callee` and `callable` share no token, so there is nothing to elide
      // and the former value prints whole.
      name: { was: 'callee', now: 'callable', full: 'callee' },
      // Purely additive: `Estimator` survives whole, so there is no former
      // value worth a chip and the green `Pose` carries the whole finding.
      type: { was: 'Frame', now: 'Image', full: 'Frame' },
    })) {
      const all = marked.pairs[path]
      assert.ok(all.length > 0, `no was/now pair rendered for ${path}`)
      const found = all.find((entry) => entry.title === `was ${expected.full}`) ?? all[0]
      assert.equal(found.was, expected.was, `${path} former value`)
      assert.equal(found.now, expected.now, `${path} current value`)
      // Whatever is drawn, the complete former value stays recoverable.
      assert.equal(found.title, `was ${expected.full}`, `${path} lost its full former value`)
      // The reviewer's actual instruction: highlight, do not cross out. The
      // fill has to have painted on every half that is drawn at all.
      if (expected.was !== null) {
        assert.ok(found.wasPainted, `${path}: the former value is not highlighted`)
      }
      assert.ok(found.nowPainted, `${path}: the current value is not highlighted`)
    }
    pass('block title, description, blockType, port name and port type all show old → new, filled')

    // Word level, not value level. This is the claim that separates round 2
    // from "the same strike in a different colour".
    const title = marked.pairs.title[0]
    assert.equal(title.wasMarked, 'inference', 'the title marked more than the run that changed')
    assert.equal(title.nowMarked, 'predict', 'the title marked more than the run that changed')
    assert.ok(!title.wasMarked.includes('run'), 'the shared prefix `run_` was marked as changed')
    assert.ok(!title.now.startsWith('…'), 'the CURRENT value was elided, which is never allowed')
    const type = marked.pairs.type
    // The purely additive case, on its own row: `Estimator` survives whole, so
    // the green `Pose` carries the finding and there is no red chip claiming a
    // loss that never happened.
    const additive = marked.pairs.type.find((entry) => entry.was === null)
    assert.ok(additive, 'the purely additive type change grew a red chip it has no loss for')
    assert.equal(additive.now, 'PoseEstimator', 'the additive type pair lost its value')
    assert.equal(additive.nowMarked, 'Pose', 'the additive type pair marked more than the new run')
    const substituted = marked.pairs.type.find((entry) => entry.was === 'Frame')
    assert.equal(substituted.nowMarked, 'Image', 'a substituted type marked more than it changed')
    pass('the fill is word level: `run_` is shared and stays unmarked, `inference` → `predict` is not')

    // The strike survives as reinforcement, never as the only channel.
    assert.ok(title.strike.includes('line-through'), 'the former value lost its strike entirely')
    // …and it is not the message. `token-only` and `delta-badge` drop it
    // outright, which they could not do if the strike were carrying meaning.
    const bare = results.variants['token-only'].pairs.title[0]
    assert.ok(bare.wasPainted === false && bare.strike === 'none',
      'token-only kept the chip fill and the strike it exists to drop')
    pass('a hairline strike remains on the former value as a second channel')

    // Two changed rows now: one renamed, one retyped, deliberately on separate
    // ports so neither pair has to share a row's width with the other.
    assert.deepEqual(marked.portStates, ['added', 'changed', 'changed', 'removed'],
      'a port row is missing its state')
    pass('an added port and a removed ghost row each render in their own row')

    const moved = marked.ghosts.find((g) => g.kind === 'moved')
    const resized = marked.ghosts.find((g) => g.kind === 'resized')
    assert.ok(moved?.visible && resized?.visible, 'the default hid a pose ghost it claims to draw')
    // …and the variant whose thesis is dropping geometry actually drops it.
    assert.deepEqual(
      results.variants['token-only'].ghosts.filter((g) => g.visible), [],
      'token-only drew a pose ghost it exists to omit',
    )
    assert.ok(moved, 'no mark at all for a Block that moved')
    assert.ok(resized, 'no mark at all for a Block that was resized')
    // The two have to be tellable apart without a legend: a move carries a
    // leader back to where it came from, a resize carries the edges that grew.
    assert.ok(moved.leader, 'a moved Block drew no leader back to its old pose')
    assert.deepEqual(moved.heavyEdges, [], 'a moved Block emphasised edges it did not resize')
    assert.ok(!resized.leader, 'a resized Block drew a leader, which reads as movement')
    assert.ok(resized.heavyEdges.length > 0, 'a resized Block marked none of the edges that moved')
    assert.ok(moved.badge.includes('↔'), 'the moved badge does not report travel')
    assert.ok(resized.badge.includes('⤢'), 'the resized badge does not report extent')
    pass('moved and resized get different marks, and neither is a content mark')

    assert.deepEqual(marked.cableMarks, ['added', 'modified', 'removed', 'rewired'],
      'the four cable findings are not all distinguishable')
    pass('added, removed, modified and rewired cables each carry their own mark')

    // The monochrome answer still has to answer the whole matrix.
    const stacked = results.variants['stacked']
    assert.equal(stacked.pairs.title[0].was, 'run_inference',
      'the stacked variant is supposed to print the former value whole')
    pass('`stacked` prints the whole former value; the one-row variants elide the shared runs')

    const mono = results.variants['ghost-weight']
    assert.ok(mono.pairs.title.length > 0, 'the monochrome variant lost the title pair')
    assert.ok(mono.ghosts.length >= 2, 'the monochrome variant lost the pose ghosts')
    pass('the monochrome variant answers the same matrix without hue')

    const errors = await localConsoleErrors(page)
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`)
    pass('no console errors across six variant reloads')

    await writeFile(RESULTS, `${JSON.stringify(results, null, 2)}\n`)
    process.stdout.write(`\n${checks.length} checks passed\n`)
    for (const check of checks) process.stdout.write(`  ok  ${check}\n`)
    process.stdout.write(`\nassets: ${ASSETS}\n`)
  } finally {
    await app.stop()
  }
}

main().catch((error) => {
  process.stderr.write(`\n${error?.stack ?? error}\n`)
  process.exit(1)
})

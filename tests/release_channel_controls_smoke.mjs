#!/usr/bin/env node
/**
 * Real-browser proof for the Preview → Stable channel controls.
 *
 * Three claims, none of which a component test can make:
 *
 *   1. Preview offers both exits side by side — return, or make this Stable.
 *   2. Making Stable is armed by the first click and only committed by the
 *      second, so the always-visible control cannot start a build by accident.
 *   3. The Dev panel stops calling out Latest Preview once you are already in
 *      it: in Preview it is inert state, in Stable it is still the offer.
 */
import assert from 'node:assert/strict'
import { readFile, utimes } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  key,
  localConsoleErrors,
  makeChecklist,
  openApp,
  startApp,
  waitFor,
} from './browser_harness.mjs'

const SHOT_PREVIEW = join(ROOT, 'docs', 'release-channel-preview-live-2026-09-01.png')
const SHOT_ARMED = join(ROOT, 'docs', 'release-channel-armed-live-2026-09-01.png')
const SHOT_STABLE = join(ROOT, 'docs', 'release-channel-stable-live-2026-09-01.png')
const SHOT_BUILDING = join(ROOT, 'docs', 'release-channel-building-live-2026-09-03.png')
const SHOT_PUBLISHED = join(ROOT, 'docs', 'release-channel-published-live-2026-09-01.png')

const BANNER = '[data-testid="systemsketch-preview-mode"]'
const DEV_TRIGGER = '.systemsketch-dev-trigger'
const CURRENT_CARD = '[data-testid="systemsketch-dev-current"]'

/** Count every POST the page actually sends to the release API. */
async function installReleasePostSpy(page) {
  await evaluate(page, `(() => {
    window.__releasePosts = []
    const original = window.fetch
    window.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input?.url ?? ''
      if (String(url).includes('/api/release') && (init?.method ?? 'GET') !== 'GET') {
        window.__releasePosts.push(String(init?.body ?? ''))
      }
      return original(input, init)
    }
    return true
  })()`)
}

const releasePosts = (page) => evaluate(page, 'window.__releasePosts.length')

/** What the channel controls say and how they are painted, wherever they are. */
async function channelActions(page, scope) {
  return JSON.parse(await evaluate(page, `(() => {
    const root = document.querySelector(${JSON.stringify(scope)})
    if (!root) return JSON.stringify(null)
    return JSON.stringify(Array.from(root.querySelectorAll('button')).map((button) => ({
      action: button.dataset.action ?? null,
      phase: button.dataset.phase ?? null,
      emphasis: button.dataset.emphasis ?? null,
      label: button.textContent.trim(),
      disabled: button.disabled,
      background: getComputedStyle(button).backgroundColor,
    })))
  })()`))
}

/**
 * Capture the frame plus the boxes of the chrome in it.
 *
 * The report crops these frames down to the marker and the Dev shelf. Those
 * bounds come from the browser that drew them, not from guessing at pixels.
 */
async function screenshot(page, path) {
  const { writeFile } = await import('node:fs/promises')
  const boxes = await evaluate(page, `(() => {
    const read = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const { x, y, width, height } = node.getBoundingClientRect()
      return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }
    }
    return JSON.stringify({
      marker: read('.systemsketch-preview-mode'),
      panel: read('.systemsketch-dev-panel'),
    })
  })()`)
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' })
  await writeFile(path, Buffer.from(data, 'base64'))
  await writeFile(path.replace(/\.png$/, '.boxes.json'), `${boxes}\n`)
}

const { checks, pass } = makeChecklist()

async function previewChannel() {
  const app = await startApp({ label: 'systemsketch-channel-preview', build: 'channel-preview-smoke' })
  const { page, port, filesRoot } = app

  try {
    const board = join(filesRoot, 'SystemSketch', 'channel-controls.tldr')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'product canvas')
    await waitFor(page, `document.querySelector('${BANNER}')`, 'Preview banner')
    await installReleasePostSpy(page)

    // --- 1. Both exits, at the top, in the always-visible banner ----------
    let banner = await channelActions(page, `${BANNER} .systemsketch-preview-mode__actions`)
    assert.deepEqual(banner.map((button) => button.label), ['Return to Stable', 'Make Preview Stable'])
    assert.deepEqual(banner.map((button) => button.action), ['return', 'make-stable'])
    assert.equal(banner[0].emphasis, 'secondary')
    assert.notEqual(banner[0].background, banner[1].background)
    pass('Preview shows Return to Stable and Make Preview Stable together, with the committing action emphasised')
    const idleMakeStableBackground = banner[1].background

    assert.equal(
      await evaluate(page, `document.querySelector('${BANNER} .systemsketch-preview-mode__detail').textContent.trim()`),
      'Live working copy · Stable stays unchanged')
    pass('the banner still says what Preview is without repeating the composition name')

    // --- 2. One click arms, it does not build ----------------------------
    await clickElement(page, `${BANNER} [data-action="make-stable"]`)
    banner = await channelActions(page, `${BANNER} .systemsketch-preview-mode__actions`)
    assert.equal(banner[1].phase, 'armed')
    assert.equal(banner[1].label, 'Confirm · replaces Stable')
    assert.notEqual(banner[1].background, idleMakeStableBackground)
    assert.equal(await releasePosts(page), 0)
    pass('the first click only arms the control: it restates the consequence and sends nothing')

    assert.match(
      await evaluate(page, `document.querySelector('${BANNER} .systemsketch-preview-mode__detail').textContent`),
      /uncommitted source changes are recorded/)
    pass('the banner detail line explains what confirming will do, in place')

    await screenshot(page, SHOT_ARMED)

    // Reaching for any other control is itself the cancel.
    await clickElement(page, DEV_TRIGGER)
    await waitFor(page, `document.querySelector('${CURRENT_CARD}')`, 'Dev panel')
    banner = await channelActions(page, `${BANNER} .systemsketch-preview-mode__actions`)
    assert.equal(banner[1].phase, 'idle')
    assert.equal(await releasePosts(page), 0)
    pass('clicking away disarms the confirm rather than leaving a live trigger behind')

    // Escape cancels the confirm without also closing the panel it came from.
    await clickElement(page, '.systemsketch-dev-actions [data-action="make-stable"]')
    assert.equal(
      (await channelActions(page, '.systemsketch-dev-actions'))[1].phase, 'armed')
    await key(page, 'Escape', 'Escape')
    assert.equal(await evaluate(page, `Boolean(document.querySelector('${CURRENT_CARD}'))`), true)
    assert.equal(
      (await channelActions(page, '.systemsketch-dev-actions'))[1].phase, 'idle')
    assert.equal(await releasePosts(page), 0)
    pass('Escape disarms the confirm without closing the panel it was armed from, and still sends nothing')

    // --- 3. Where you already are is state, not a call to action ---------
    const current = JSON.parse(await evaluate(page, `(() => {
      const card = document.querySelector('${CURRENT_CARD}')
      const style = getComputedStyle(card)
      return JSON.stringify({
        tag: card.tagName,
        background: style.backgroundImage,
        cursor: style.cursor,
        text: card.textContent.replace(/\\s+/g, ' ').trim(),
      })
    })()`))
    assert.equal(current.tag, 'DIV')
    assert.equal(current.background, 'none')
    assert.equal(current.cursor, 'default')
    assert.match(current.text, /^↯You are hereLatest PreviewLive working tree · full productCurrent$/)
    pass('the Latest Preview row in Dev drops its call-out gradient and is inert while Preview is what you are in')

    const panel = await channelActions(page, '.systemsketch-dev-actions')
    assert.deepEqual(panel.map((button) => button.label), ['Return to Stable', 'Make Preview Stable'])
    pass('the Dev panel carries the same two buttons at the top, not a buried Publish Preview row')

    assert.equal(
      await evaluate(page, `Array.from(document.querySelectorAll('.systemsketch-dev-panel button'))
        .some((button) => button.textContent.includes('Publish Preview'))`),
      false)
    pass('the old Publish Preview control is gone from the collapsed version details')

    await screenshot(page, SHOT_PREVIEW)
    assert.equal(await releasePosts(page), 0)

    const errors = localConsoleErrors(page)
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`)
    pass('no console errors while driving the channel controls')
  } finally {
    app.close()
  }
}

async function stableChannel() {
  const app = await startApp({ label: 'systemsketch-channel-stable', channel: 'stable' })
  const { page, port, filesRoot } = app

  try {
    const board = join(filesRoot, 'SystemSketch', 'channel-controls-stable.tldr')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `document.querySelector('[data-testid="systemsketch-app"] .tl-container')`, 'product canvas')
    await waitFor(page, `document.querySelector('${DEV_TRIGGER}')`, 'Dev trigger')
    await delay(500)

    assert.equal(await evaluate(page, `Boolean(document.querySelector('${BANNER}'))`), false)
    pass('Stable shows no Preview banner and therefore no channel buttons')

    await clickElement(page, DEV_TRIGGER)
    await waitFor(page, `document.querySelector('.systemsketch-dev-latest')`, 'Dev panel')

    const offer = JSON.parse(await evaluate(page, `(() => {
      const card = document.querySelector('.systemsketch-dev-latest')
      return JSON.stringify({
        tag: card.tagName,
        current: card.hasAttribute('data-current'),
        tinted: getComputedStyle(card).backgroundColor !== 'rgba(0, 0, 0, 0)',
        cursor: getComputedStyle(card).cursor,
        text: card.textContent.replace(/\\s+/g, ' ').trim(),
      })
    })()`))
    assert.equal(offer.tag, 'BUTTON')
    assert.equal(offer.current, false)
    assert.equal(offer.tinted, true)
    assert.equal(offer.cursor, 'pointer')
    assert.match(offer.text, /Open Latest Preview/)
    pass('from Stable the same row stays a tinted call-to-action, because there it really is the offer')

    assert.equal(await evaluate(page, `Boolean(document.querySelector('.systemsketch-dev-actions'))`), false)
    assert.equal(
      await evaluate(page, `document.body.textContent.includes('Make Preview Stable')`), false)
    pass('Make Preview Stable is absent from Stable, where there is no Preview to make Stable')

    // A newer working tree is the one thing that should raise the Dev dot.
    const now = new Date()
    await utimes(join(ROOT, 'package-lock.json'), now, now)
    await evaluate(page, `window.dispatchEvent(new Event('focus'))`)
    await waitFor(page, `document.querySelector('.systemsketch-preview-indicator')`, 'new-Preview indicator')
    assert.match(
      await evaluate(page, `document.querySelector('.systemsketch-dev-latest small').textContent`),
      /New Preview available/)
    pass('newer local work still raises the Dev indicator and relabels the offer, from Stable only')

    await screenshot(page, SHOT_STABLE)

    const errors = localConsoleErrors(page)
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`)
    pass('no console errors on the Stable channel')
  } finally {
    app.close()
  }
}

/**
 * The whole transition, for real: confirm, run the check suite and the
 * production build, and land on a Stable that points at this working tree.
 *
 * Opt-in because it is a full `npm run check` plus `vite build` — minutes, not
 * seconds. It is safe to run at any time: `startApp` gives the server a
 * throwaway release home, so the promote moves that Stable and not yours.
 */
async function publishFlow() {
  const app = await startApp({ label: 'systemsketch-channel-publish', build: 'channel-publish-smoke' })
  const { page, port, filesRoot, releaseHome } = app

  try {
    const board = join(filesRoot, 'SystemSketch', 'channel-publish.tldr')
    await openApp(page, port, `?board=${encodeURIComponent(board)}`)
    await waitFor(page, `document.querySelector('${BANNER}')`, 'Preview banner')

    await clickElement(page, `${BANNER} [data-action="make-stable"]`)
    await clickElement(page, `${BANNER} [data-action="make-stable"]`)

    await waitFor(page,
      `document.querySelector('${BANNER} [data-action="make-stable"]').dataset.phase === 'working'`,
      'the build starting', 5000)
    let banner = await channelActions(page, `${BANNER} .systemsketch-preview-mode__actions`)
    assert.equal(banner[1].label, 'Making Stable…')
    assert.equal(banner[0].disabled, true)
    pass('the second click starts the real build and locks both exits while it runs')

    const progress = JSON.parse(await evaluate(page, `(() => {
      const indicator = document.querySelector('${BANNER} [data-testid="systemsketch-build-progress"]')
      if (!indicator) return 'null'
      return JSON.stringify({
        role: indicator.getAttribute('role'),
        label: indicator.getAttribute('aria-label'),
        valueText: indicator.getAttribute('aria-valuetext'),
        animated: getComputedStyle(indicator.firstElementChild).animationName,
      })
    })()`))
    assert.deepEqual(progress, {
      role: 'progressbar',
      label: 'Building Stable release',
      valueText: 'Build in progress',
      animated: 'systemsketch-release-progress',
    })
    pass('the live banner shows an honest indeterminate progress indicator while Stable builds')
    await screenshot(page, SHOT_BUILDING)

    await waitFor(page,
      `document.querySelector('${BANNER} [data-action="make-stable"]').dataset.phase === 'published'`,
      'the promote finishing', 420_000)
    banner = await channelActions(page, `${BANNER} .systemsketch-preview-mode__actions`)
    assert.equal(banner[1].label, 'Stable updated')
    assert.equal(banner[1].disabled, true)
    assert.equal(banner[0].label, 'Open new Stable')
    assert.equal(banner[0].emphasis, 'primary')
    pass('a finished promote reports Stable updated and turns Return into the follow-through')
    assert.equal(
      await evaluate(page, `Boolean(document.querySelector('${BANNER} [data-testid="systemsketch-build-progress"]'))`),
      false)
    pass('the progress indicator clears once the build has finished')

    assert.match(
      await evaluate(page, `document.querySelector('${BANNER} .systemsketch-preview-mode__detail').textContent`),
      /Standalone Stable updated/)
    pass('the banner says Stable updated and names the next step instead of leaving the result implicit')

    await screenshot(page, SHOT_PUBLISHED)

    // The pointer really moved, in the throwaway release home and only there.
    const channels = JSON.parse(await readFile(join(releaseHome, 'channels.json'), 'utf8'))
    assert.equal(typeof channels.stable, 'string')
    assert.equal(channels.stable, channels.candidate)
    pass('the isolated release home now points Stable at the freshly built candidate')

    const manifest = JSON.parse(await readFile(join(releaseHome, 'releases', channels.stable, 'manifest.json'), 'utf8'))
    assert.equal(manifest.sourceDirty, true)
    pass('the live Preview working copy is explicitly marked dirty in the Stable manifest')

    const errors = localConsoleErrors(page)
    assert.deepEqual(errors, [], `console errors: ${errors.join(' | ')}`)
    pass('no console errors across the full publish')
  } finally {
    app.close()
  }
}

async function main() {
  await ensureDir(dirname(SHOT_PREVIEW))
  await previewChannel()
  await stableChannel()
  const shots = [SHOT_PREVIEW, SHOT_ARMED, SHOT_STABLE]
  if (process.env.SYSTEMSKETCH_PUBLISH_PROOF) {
    await publishFlow()
    shots.push(SHOT_BUILDING)
    shots.push(SHOT_PUBLISHED)
  } else {
    process.stdout.write('  SKIP  full publish (set SYSTEMSKETCH_PUBLISH_PROOF=1 — runs a real check + build)\n')
  }
  process.stdout.write(`\n${checks.length} checks passed\n`)
  for (const shot of shots) process.stdout.write(`  ${shot}\n`)
}

main().catch((error) => {
  process.stderr.write(`\nFAIL  ${error.message}\n`)
  process.exitCode = 1
})

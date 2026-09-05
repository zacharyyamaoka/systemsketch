#!/usr/bin/env node
/** Browser proof that all five Babble directions are present and their three-state stories are wired. */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  ROOT,
  clickElement,
  delay,
  ensureDir,
  evaluate,
  launchChrome,
  localConsoleErrors,
  openCdpPage,
  waitFor,
} from './browser_harness.mjs'

const REPORT = join(ROOT, 'docs', 'block-member-background-babble-2026-09-05.html')
const SHOT = join(ROOT, 'docs', 'assets', 'block-member-background-babble-grid-2026-09-05.png')

async function main() {
  const session = await launchChrome({ label: 'block-member-background-babble', width: 1600, height: 1100 })
  const page = await openCdpPage(await session.devToolsPort(), { width: 1600, height: 1100 })

  try {
    await page.send('Page.navigate', { url: pathToFileURL(REPORT).href })
    await waitFor(page, `document.readyState === 'complete'`, 'gallery load')
    await waitFor(page, `document.querySelectorAll('[data-variant]').length === 5`, 'five Babble variants')
    assert.equal(await evaluate(page, `document.querySelectorAll('[data-variant]').length`), 5)

    await clickElement(page, '[data-layout="grid"]')
    await waitFor(page, `!document.querySelector('#variant-grid').classList.contains('focus-layout')`, 'grid comparison layout')
    // The fixed decision dock is useful in the gallery, but it would cover the
    // visual-QA crops below. Hide it only for the screenshots, after proving
    // the real Grid control changed the layout.
    await evaluate(page, `document.querySelector('.decision-dock').style.display = 'none'`)

    for (const id of ['v1', 'v2', 'v3', 'v4', 'v5']) {
      for (const state of ['hidden', 'inset', 'edge']) {
        await evaluate(page,
          `document.querySelector('[data-variant="${id}"] [data-story-to="${state}"]').click()`)
        assert.equal(await evaluate(page,
          `document.querySelector('[data-variant="${id}"] .prototype')?.dataset.storyState`), state)
      }
      await evaluate(page, `(() => {
        const prototype = document.querySelector('[data-variant="${id}"] .prototype')
        window.scrollTo({ top: prototype.getBoundingClientRect().top + scrollY - 160, behavior: 'instant' })
      })()`)
      await delay(200)
      const crop = await page.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: false,
      })
      await ensureDir(join(ROOT, 'docs', 'assets'))
      await writeFile(
        join(ROOT, 'docs', 'assets', `block-member-background-${id}-2026-09-05.png`),
        Buffer.from(crop.data, 'base64'),
      )
    }

    const behavior = JSON.parse(await evaluate(page, `(() => {
      const card = document.querySelector('[data-variant="v4"]')
      const prototype = card.querySelector('.prototype')
      const footer = card.querySelector('.member-footer')
      const choices = [...card.querySelectorAll('[data-story-to]')]
      return JSON.stringify({
        story: prototype.dataset.storyState,
        selected: choices.filter((button) => getComputedStyle(button).backgroundColor === 'rgb(37, 41, 46)')
          .map((button) => button.dataset.storyTo),
        footerAtEdge: getComputedStyle(footer).display,
      })
    })()`))
    assert.deepEqual(behavior, { story: 'edge', selected: ['edge'], footerAtEdge: 'flex' })

    await evaluate(page, `document.querySelector('[data-variant="v4"] [data-story-to="hidden"]').click()`)
    assert.equal(await evaluate(page,
      `getComputedStyle(document.querySelector('[data-variant="v4"] .member-footer')).display`), 'none')
    await evaluate(page, `document.querySelector('[data-variant="v4"] [data-story-to="edge"]').click()`)

    await delay(200)
    await ensureDir(join(ROOT, 'docs', 'assets'))
    const shot = await page.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    await writeFile(SHOT, Buffer.from(shot.data, 'base64'))
    assert.deepEqual(await localConsoleErrors(page), [])
    process.stdout.write('PASS: exactly five variants; all 15 direct story-state controls synchronized; no console errors\n')
  } finally {
    page.close()
    session.kill()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

#!/usr/bin/env node
/**
 * Render a `docs/` report headlessly and write the pixels out, so it can be
 * looked at.
 *
 * `CLAUDE.md` requires every report to be "rendered headlessly and looked at
 * before you hand it over". Nothing in the repo could do that, so each agent
 * wrote its own Chrome-and-CDP script in a scratch directory, looked once, and
 * threw it away. This is the one command instead.
 *
 *   node tests/render_report.mjs docs/my-report.html /tmp/shots \
 *     facts=.facts scores=table.scores board1="figure:nth-of-type(1)"
 *
 * Writes `full.png` plus one PNG per `name=selector` clip, and prints a JSON
 * summary. The summary is the cheap sanity check worth having on a generated
 * page: sideways overflow, `undefined`/`NaN` left by a template, empty SVG
 * labels, and any error the page itself raised. A non-zero exit means the page
 * failed one of those or a named clip was missing — so a builder can gate on it.
 */
import { renderFile } from './cdp_kit.mjs'

function usage(message) {
  process.stderr.write(`${message}\n\n`
    + 'usage: node tests/render_report.mjs <file.html|url> <out-dir> [name=selector ...]\n'
    + '       --width=N --height=N --settle=MS --no-full --allow-holes\n')
  process.exit(2)
}

const args = process.argv.slice(2)
const flags = new Map(args.filter((a) => a.startsWith('--')).map((a) => {
  const [name, value = 'true'] = a.replace(/^--/, '').split('=')
  return [name, value]
}))
const positional = args.filter((a) => !a.startsWith('--'))
const [target, outDir, ...clipArgs] = positional
if (!target || !outDir) usage('A target and an output directory are required.')

const clips = {}
for (const pair of clipArgs) {
  const index = pair.indexOf('=')
  if (index < 1) usage(`Clip "${pair}" is not name=selector.`)
  clips[pair.slice(0, index)] = pair.slice(index + 1)
}

const result = await renderFile(target, outDir, {
  clips,
  width: Number(flags.get('width') ?? 1400),
  height: Number(flags.get('height') ?? 1100),
  settleMs: Number(flags.get('settle') ?? 600),
  full: flags.get('no-full') !== 'true',
  label: 'report-shot',
})

process.stdout.write(`${JSON.stringify(result, null, 1)}\n`)

const holes = result.metrics.templateHoles > 0 && flags.get('allow-holes') !== 'true'
const problems = [
  result.missing.length > 0 && `${result.missing.length} clip(s) not found`,
  holes && `${result.metrics.templateHoles} undefined/NaN in the text`,
  result.metrics.overflowsSideways && 'the page scrolls sideways',
  result.metrics.emptySvgText > 0 && `${result.metrics.emptySvgText} empty SVG label(s)`,
  result.consoleErrors.length > 0 && `${result.consoleErrors.length} console error(s)`,
].filter(Boolean)

if (problems.length) {
  process.stderr.write(`\nnot clean: ${problems.join(' · ')}\n`)
  process.exit(1)
}

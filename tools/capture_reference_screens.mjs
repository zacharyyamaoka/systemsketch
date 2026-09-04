/**
 * Capture reference screenshots from Enso, Nevalang and unit for a docs report.
 *
 * Prior-art claims in `docs/` are supposed to be looked at, not paraphrased, so
 * this drives a throwaway headless Chrome over the public sites and writes PNGs
 * into `docs/assets/`. It reuses `tests/browser_harness.mjs` so the capture path
 * is the same CDP client every journey already uses — the one difference is that
 * the host-resolver block is dropped, because these targets are on the public
 * internet rather than on 127.0.0.1.
 *
 * unit's editor (unit.land) never finishes booting under headless Chrome, so its
 * evidence comes from the project's own documented interaction recordings, laid
 * out on a local contact sheet and rendered by the same browser. Those are the
 * gestures the `Getting Started` doc actually specifies, which is the thing this
 * report makes claims about.
 *
 * Run:  node tools/capture_reference_screens.mjs
 * Gap-analysis sources only: node tools/capture_reference_screens.mjs --gap-analysis
 * Behavior-tree prior-art atlas: node tools/capture_reference_screens.mjs --behavior-tree-atlas
 */
import { spawn } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { ROOT, delay, findChrome, newPage, evaluate } from '../tests/browser_harness.mjs'

const ASSETS = join(ROOT, 'docs', 'assets')

async function waitForDevTools(profileDir, timeoutMs = 30000) {
  const portFile = join(profileDir, 'DevToolsActivePort')
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const [port] = (await readFile(portFile, 'utf8')).split('\n')
      if (port) return Number(port)
    } catch { /* not written yet */ }
    await delay(120)
  }
  throw new Error('Chrome never published a DevTools port')
}

async function launch({ width = 1440, height = 900, scale = 2 } = {}) {
  const chromePath = await findChrome()
  const profile = await mkdtemp(join(tmpdir(), 'ss-refshot-'))
  const env = { ...process.env }
  delete env.DISPLAY
  delete env.WAYLAND_DISPLAY
  const proc = spawn(chromePath, [
    '--headless=new', '--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--remote-allow-origins=*', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--hide-scrollbars', `--force-device-scale-factor=${scale}`,
    `--user-data-dir=${profile}`, `--window-size=${width},${height}`, 'about:blank',
  ], { stdio: 'ignore', env })
  const cdpPort = await waitForDevTools(profile)
  const page = await newPage(cdpPort)
  await page.send('Page.enable')
  await page.send('Runtime.enable')
  return { proc, page }
}

async function shoot(page, name, clip) {
  // A `clip` is in PAGE coordinates, so it must be paired with
  // captureBeyondViewport — scrolling first and clipping too double-counts the
  // offset and silently returns the neighbouring element.
  const params = { format: 'png', captureBeyondViewport: Boolean(clip) }
  if (clip) params.clip = { ...clip, scale: 2 }
  const { data } = await page.send('Page.captureScreenshot', params)
  const buffer = Buffer.from(data, 'base64')
  await writeFile(join(ASSETS, `${name}.png`), buffer)
  console.log(`  ${name}.png  ${(buffer.length / 1024).toFixed(0)} KB`)
  return { name, bytes: buffer.length }
}

/** Scroll sweeps of a marketing page: the product shot is rarely in the hero. */
async function sweep(page, url, prefix, { settle = 6000, stops = [0, 700, 1400, 2100, 2800] } = {}) {
  await page.send('Page.navigate', { url })
  await delay(settle)
  const written = []
  for (const [index, top] of stops.entries()) {
    await evaluate(page, `window.scrollTo({top:${top},behavior:'instant'})`)
    await delay(1400)
    written.push(await shoot(page, `${prefix}-${index}`))
  }
  return written
}

// These are primary-source screenshots for the vocabulary-and-controls
// dictionary.  The report intentionally captures a reference image per tool
// when a concept genuinely converges across tools: a tiny icon is still more
// honest than a redrawn stand-in, but prefer an actual block-diagram example.
// Keep the citation (the document URL) distinct from the image URL: vendor CDNs
// move more often than documentation routes.
const GAP_ANALYSIS_SOURCES = [
  {
    name: 'gap-labview-unbundle-by-name-2026-09-03',
    label: 'LabVIEW Unbundle By Name and named cluster elements',
    sourceDocument: 'https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/unbundle-by-name.html',
    imageUrl: 'https://ni.scene7.com/is/image/ni/bigPictureCluster?scl=1',
  },
  {
    name: 'gap-blueprint-split-struct-2026-09-03',
    label: 'Blueprint Split Struct Pin',
    sourceDocument: 'https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27',
    imageUrl: 'https://d1iv7db44yhgxn.cloudfront.net/documentation/images/6b12cf1c-5501-4e7b-acda-519023752226/splitstructpin.png',
  },
  {
    name: 'gap-simulink-bus-selector-2026-09-03',
    label: 'Simulink Bus Selector exposing named bus elements',
    sourceDocument: 'https://www.mathworks.com/help/simulink/slref/busselector.html',
    imageUrl: 'https://www.mathworks.com/help/examples/simulink/win64/SelectElementsFromBusExample_01.png',
  },
  {
    name: 'gap-labview-bundle-by-name-2026-09-03',
    label: 'LabVIEW Bundle By Name named cluster update',
    sourceDocument: 'https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/bundle-by-name.html',
    imageUrl: 'https://ni.scene7.com/is/image/ni/bundleByNameBD?scl=1',
  },
  {
    name: 'gap-blueprint-set-members-2026-09-03',
    label: 'Blueprint Set Members in Struct',
    sourceDocument: 'https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27',
    imageUrl: 'https://d1iv7db44yhgxn.cloudfront.net/documentation/images/7d61691d-620e-4269-9aa5-b1da2533eb15/setmembersinstruct.png',
  },
  {
    name: 'gap-simulink-bus-assignment-2026-09-03',
    label: 'Simulink Bus Assignment partial field update',
    sourceDocument: 'https://www.mathworks.com/help/simulink/slref/busassignment.html',
    imageUrl: 'https://www.mathworks.com/help/examples/simulink/win64/AssignSignalValuesToABusExample_01.png',
  },
  {
    name: 'gap-labview-select-2026-09-03',
    label: 'LabVIEW Select function',
    sourceDocument: 'https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/functions/select.html',
    imageUrl: 'https://docs-be.ni.com/bundle/labview-api-ref/page/functions/select.png?_LANG=enus',
  },
  {
    name: 'gap-simulink-switch-2026-09-03',
    label: 'Simulink Switch conditional value selection',
    sourceDocument: 'https://www.mathworks.com/help/simulink/slref/switch.html',
    // The published direct asset changes with each release. Capture the image
    // in its documented MathWorks context instead of hard-coding a guessed URL.
    imageUrl: 'https://www.mathworks.com/help/simulink/slref/switch.html',
    documentImageSelector: 'img[alt="Switch Block with a Boolean Control Port Example"]',
  },
  {
    name: 'gap-labview-error-wire-2026-09-03',
    label: 'LabVIEW error-cluster wire',
    sourceDocument: 'https://www.ni.com/docs/en-US/bundle/labview/page/handling-errors.html',
    imageUrl: 'https://docs-be.ni.com/bundle/labview/page/GUID-669CBB90-7118-40DA-9112-D33367A09DDD-a5.png?_LANG=enus',
  },
  {
    name: 'gap-labview-async-channel-2026-09-03',
    label: 'LabVIEW asynchronous channel wire',
    sourceDocument: 'https://www.ni.com/docs/en-US/bundle/labview/page/using-wires-to-link-block-diagram-objects.html',
    imageUrl: 'https://docs-be.ni.com/bundle/labview/page/GUID-4937B8CB-9D2E-42FF-800F-F48C82D6798D-a5.png?_LANG=enus',
  },
  {
    name: 'gap-simulink-function-call-2026-09-03',
    label: 'Simulink Model Reference function-call control events',
    sourceDocument: 'https://www.mathworks.com/help/simulink/slref/model-reference-function-call.html',
    imageUrl: 'https://www.mathworks.com/help/examples/simulink_features/win64/ModelReferenceFunctionCallExample_01.png',
  },
  {
    name: 'gap-labview-timed-loop-2026-09-04',
    label: 'LabVIEW Timed Loop with explicit timing terminals',
    sourceDocument: 'https://www.ni.com/en/shop/labview/timing-and-synchronization-in-ni-labview.html',
    imageUrl: 'https://ni.scene7.com/is/image/ni/TimedLoop?scl=1',
  },
  {
    name: 'gap-labview-event-structure-2026-09-03',
    label: 'LabVIEW user-event Event Structure',
    sourceDocument: 'https://www.ni.com/docs/en-US/bundle/labview-api-ref/page/structures/event-structure.html',
    imageUrl: 'https://docs-be.ni.com/bundle/labview/page/GUID-E80F75F1-9148-490F-8ECA-E24358FA3E89-a5.png?_LANG=enus',
  },
  {
    name: 'gap-blueprint-bind-dispatcher-2026-09-03',
    label: 'Blueprint Bind Event dispatcher node',
    sourceDocument: 'https://dev.epicgames.com/documentation/en-us/unreal-engine/binding-and-unbinding-events-in-unreal-engine?lang=en-US',
    imageUrl: 'https://d1iv7db44yhgxn.cloudfront.net/documentation/images/e26bd094-b429-4c21-bdbf-00e617f2dfa4/bind_node.png',
  },
  {
    name: 'gap-stateflow-event-2026-09-03',
    label: 'Stateflow events triggering transitions',
    sourceDocument: 'https://www.mathworks.com/help/stateflow/ug/control-state-execution-by-using-events.html',
    imageUrl: 'https://www.mathworks.com/help/stateflow/ug/event_example.png',
  },
  {
    name: 'gap-stateflow-modes-2026-09-03',
    label: 'Stateflow state hierarchy for operating modes',
    sourceDocument: 'https://www.mathworks.com/help/stateflow/ug/states.html',
    imageUrl: 'https://www.mathworks.com/help/stateflow/ug/sf_aircontrol-chart.png',
  },
  {
    name: 'gap-labview-connector-contract-2026-09-03',
    label: 'LabVIEW aligned connector-pane interface wiring',
    sourceDocument: 'https://www.ni.com/en/support/downloads/instrument-drivers/tools-resources/instrument-driver-guidelines/icon-and-connector-panes.html',
    imageUrl: 'https://ni.scene7.com/is/image/ni/icon_good_aligned_wiring_between_225x54?scl=1',
  },
  {
    name: 'gap-blueprint-function-call-2026-09-03',
    label: 'Blueprint function call with generated pins',
    sourceDocument: 'https://dev.epicgames.com/documentation/en-us/unreal-engine/functions?application_version=4.27',
    imageUrl: 'https://d1iv7db44yhgxn.cloudfront.net/documentation/images/e27b21de-0f1b-4417-8812-03ab857bcc59/function_call_with_pins.png',
  },
  {
    name: 'gap-simulink-function-caller-2026-09-03',
    label: 'Simulink Function Caller interface',
    sourceDocument: 'https://www.mathworks.com/help/simulink/slref/functioncaller.html',
    imageUrl: 'https://www.mathworks.com/help/simulink/slref/simulink_function_timestwo_model.png',
  },
  {
    name: 'gap-blueprint-struct-pins-2026-09-03',
    label: 'Blueprint hidden struct member pins',
    sourceDocument: 'https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27',
    imageUrl: 'https://d1iv7db44yhgxn.cloudfront.net/documentation/images/8011c704-700f-4540-a226-af85aa1b30e1/hideunconnectedpins.png',
  },
  {
    name: 'gap-blueprint-hidden-pins-2026-09-03',
    label: 'Blueprint Hide Unconnected Pins result',
    sourceDocument: 'https://dev.epicgames.com/documentation/en-us/unreal-engine/struct-variables-in-blueprints?application_version=4.27',
    imageUrl: 'https://d1iv7db44yhgxn.cloudfront.net/documentation/images/7e8c6375-0777-48e4-94c3-1456bb8dbfce/hiddenpins.png',
  },
  {
    name: 'gap-blueprint-cast-failure-2026-09-03',
    label: 'Blueprint Cast To node with success and Cast Failed paths',
    sourceDocument: 'https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-communications-in-unreal-engine',
    imageUrl: 'https://d1iv7db44yhgxn.cloudfront.net/documentation/images/aeac57a9-b724-400c-a843-c790a2fe9d08/othercasting.png',
  },
  {
    name: 'gap-stateflow-state-transition-2026-09-03',
    label: 'Stateflow states and transitions',
    sourceDocument: 'https://www.mathworks.com/help/stateflow/gs/get-started-introduction.html',
    imageUrl: 'https://www.mathworks.com/help/stateflow/gs/gearlogic-animation.gif',
    // MathWorks varies this asset by Origin, so preserve its same-origin
    // document context rather than treating a blocked data-URL embed as proof
    // that the primary image is inaccessible.
    documentImageSelector: 'img[src$="gearlogic-animation.gif"]',
    settle: 1800,
  },
  {
    name: 'gap-simulink-mask-dialog-2026-09-03',
    label: 'Simulink dynamic mask dialog',
    sourceDocument: 'https://www.mathworks.com/help/simulink/ug/create-dynamic-mask-dialog-boxes.html',
    imageUrl: 'https://www.mathworks.com/help/examples/simulink_masking/win64/DynamicMaskDialogBoxExample_01.png',
  },
  {
    name: 'gap-ui-labview-toolbar-2026-09-04',
    label: 'LabVIEW block-diagram toolbar with run and debugging controls',
    sourceDocument: 'https://www.ni.com/en/support/documentation/supplemental/08/labview-block-diagram-explained.html',
    imageUrl: 'https://ni.scene7.com/is/image/ni/block-diagram-bar?scl=1',
    // Keep the run/debug cluster readable in the report instead of shrinking
    // the complete 33:1 toolbar down to a decorative hairline.
    captureWidth: 350,
  },
  {
    name: 'gap-ui-labview-context-help-2026-09-04',
    label: 'LabVIEW Context Help window for a selected VI',
    sourceDocument: 'https://www.ni.com/en/support/documentation/supplemental/21/driver-and-vi-library-development-guidelines.html',
    imageUrl: 'https://ni.scene7.com/is/image/ni/fig-2-Context-Help-6395?scl=1',
  },
  {
    name: 'gap-ui-labview-project-explorer-2026-09-04',
    label: 'LabVIEW Project Explorer hierarchy',
    sourceDocument: 'https://www.ni.com/en/support/documentation/supplemental/08/best-practices-for-managing-ni-labview-applications-using-the-pr.html',
    imageUrl: 'https://ni.scene7.com/is/image/ni/proj?scl=1',
  },
  {
    name: 'gap-ui-labview-error-list-2026-09-04',
    label: 'LabVIEW Error List diagnostics window',
    sourceDocument: 'https://www.ni.com/en/support/documentation/supplemental/12/debugging-techniques-in-labview.html',
    imageUrl: 'https://ni.scene7.com/is/image/ni/Error%20List%20Dialog%20Box?scl=1',
  },
  {
    name: 'gap-ui-labview-debug-window-2026-09-04',
    label: 'LabVIEW Debug Window with probes and breakpoints',
    sourceDocument: 'https://www.ni.com/en/support/documentation/supplemental/12/debugging-techniques-in-labview.html',
    imageUrl: 'https://ni.scene7.com/is/image/ni/Debug_Window_ss?scl=1',
  },
  {
    name: 'gap-ui-labview-probe-watch-2026-09-04',
    label: 'LabVIEW Probe Watch window',
    sourceDocument: 'https://www.ni.com/en/support/documentation/supplemental/12/debugging-techniques-in-labview.html',
    imageUrl: 'https://ni.scene7.com/is/image/ni/Probe%20Watch%20Window?scl=1',
  },
  {
    name: 'gap-ui-labview-quick-drop-2026-09-04',
    label: 'LabVIEW Quick Drop command search',
    sourceDocument: 'https://www.ni.com/en/support/documentation/supplemental/08/boost-labview-productivity-with-quick-drop.html',
    imageUrl: 'https://ni.scene7.com/is/image/ni/fig%203%20quick%20drop%20search?scl=1',
  },
  {
    name: 'gap-ui-blueprint-toolbar-2026-09-04',
    label: 'Blueprint Editor toolbar with compile, search, play, and debug target controls',
    sourceDocument: 'https://dev.epicgames.com/documentation/en-us/unreal-engine/toolbar-in-the-blueprints-visual-scripting-editor-for-unreal-engine',
    imageUrl: 'https://d1iv7db44yhgxn.cloudfront.net/documentation/images/1eb2fd31-cd4e-490e-a505-f2841a144e32/toolbarbp.png',
  },
  {
    name: 'gap-ui-blueprint-find-results-2026-09-04',
    label: 'Blueprint semantic Find Results panel',
    sourceDocument: 'https://dev.epicgames.com/documentation/unreal-engine/find-result-panel?application_version=4.27',
    imageUrl: 'https://d1iv7db44yhgxn.cloudfront.net/documentation/images/9f3e32c3-ef14-4967-b81f-2d3bfdb1222d/findresults.png',
  },
  {
    name: 'gap-ui-blueprint-my-blueprint-2026-09-04',
    label: 'My Blueprint semantic outline panel',
    sourceDocument: 'https://dev.epicgames.com/documentation/unreal-engine/my-blueprint-panel-in-the-blueprints-visual-scripting-editor-for-unreal-engine?lang=en-US',
    imageUrl: 'https://d1iv7db44yhgxn.cloudfront.net/documentation/images/671e9734-93a1-4af0-9e47-fd06ffdb9cb0/myblueprintpane.png',
  },
  {
    name: 'gap-ui-blueprint-graph-editor-2026-09-04',
    label: 'Blueprint Graph Editor tabs, history, and breadcrumbs',
    sourceDocument: 'https://dev.epicgames.com/documentation/en-us/unreal-engine/graph-editor-for-the-blueprints-visual-scripting-editor-in-unreal-engine',
    imageUrl: 'https://d1iv7db44yhgxn.cloudfront.net/documentation/images/21cc21c0-522c-48da-943d-d48385cca894/grapheditor.png',
  },
  {
    name: 'gap-ui-blueprint-details-2026-09-04',
    label: 'Blueprint context-sensitive Details panel',
    sourceDocument: 'https://dev.epicgames.com/documentation/en-us/unreal-engine/details-panel-in-the-blueprints-visual-scriting-editor-for-unreal-engine',
    imageUrl: 'https://d1iv7db44yhgxn.cloudfront.net/documentation/images/789bcfe1-9faa-49d9-9603-6ba57afa681e/blueprintdetails2.png',
  },
  {
    name: 'gap-ui-blueprint-compiler-results-2026-09-04',
    label: 'Blueprint Compiler Results with jump-to-source messages',
    sourceDocument: 'https://dev.epicgames.com/documentation/unreal-engine/compiler-results?application_version=4.27',
    imageUrl: 'https://d1iv7db44yhgxn.cloudfront.net/documentation/images/c8c2c371-5aa5-49b9-8e41-45589c87f54b/compileresultsui.png',
  },
  {
    name: 'gap-ui-blueprint-bookmarks-2026-09-04',
    label: 'Blueprint graph bookmark menu',
    sourceDocument: 'https://dev.epicgames.com/documentation/en-us/unreal-engine/working-with-bookmarks-for-blueprint-graphs-in-unreal-engine',
    imageUrl: 'https://d1iv7db44yhgxn.cloudfront.net/documentation/images/90849468-0ffe-4057-bb9c-237387fa151b/blueprintbookmarks_using_02.png',
  },
  {
    name: 'gap-ui-blueprint-debugger-2026-09-04',
    label: 'Blueprint Debugger with trace and breakpoint surfaces',
    sourceDocument: 'https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-debugger-in-unreal-engine',
    imageUrl: 'https://d1iv7db44yhgxn.cloudfront.net/documentation/images/0054e46c-a09a-405a-aade-5eb5086583b5/blueprint_debugger.png',
  },
  {
    name: 'gap-ui-blueprint-watch-2026-09-04',
    label: 'Blueprint watched pin value',
    sourceDocument: 'https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-debugger-in-unreal-engine',
    imageUrl: 'https://d1iv7db44yhgxn.cloudfront.net/documentation/images/0c4529bc-765c-4137-afd7-1a85a655ca46/watchpin.png',
  },
  {
    name: 'gap-ui-simulink-editor-2026-09-04',
    label: 'Simulink Editor application chrome',
    sourceDocument: 'https://www.mathworks.com/help/simulink/slref/simulinkeditor.html',
    imageUrl: 'https://www.mathworks.com/help/simulink/slref/tool_simulink_editor.png',
  },
  {
    name: 'gap-ui-simulink-toolstrip-2026-09-04',
    label: 'Simulink workflow toolstrip tabs',
    sourceDocument: 'https://www.mathworks.com/help/simulink/slref/simulinkeditor.html',
    imageUrl: 'https://www.mathworks.com/help/simulink/slref/19b_simulink_toolstrip.png',
  },
  {
    name: 'gap-ui-simulink-run-controls-2026-09-04',
    label: 'Simulink Simulation tab and stop-time control',
    sourceDocument: 'https://www.mathworks.com/help/simulink/gs/create-a-simple-model.html',
    imageUrl: 'https://www.mathworks.com/help/simulink/gs/toolbar_stoptime.png',
  },
  {
    name: 'gap-ui-simulink-property-inspector-2026-09-04',
    label: 'Simulink selection-following Property Inspector',
    sourceDocument: 'https://www.mathworks.com/help/simulink/slref/propertyinspector.html',
    imageUrl: 'https://www.mathworks.com/help/simulink/slref/property_inspector.png',
  },
  {
    name: 'gap-ui-simulink-model-browser-2026-09-04',
    label: 'Simulink Model Browser hierarchy pane',
    sourceDocument: 'https://www.mathworks.com/help/simulink/slref/simulinkeditor.html',
    imageUrl: 'https://www.mathworks.com/help/simulink/slref/model_browser.png',
    // The published asset includes a tall empty dock below the hierarchy.
    // Crop only that empty tail; preserve the complete visible tree and tools.
    captureHeight: 180,
  },
  {
    name: 'gap-ui-simulink-diagnostic-viewer-2026-09-04',
    label: 'Simulink Diagnostic Viewer',
    sourceDocument: 'https://www.mathworks.com/help/simulink/slref/diagnosticviewer.html',
    imageUrl: 'https://www.mathworks.com/help/simulink/slref/diagnostic-viewer.png',
  },
  {
    name: 'gap-ui-simulink-data-inspector-2026-09-04',
    label: 'Simulink Simulation Data Inspector',
    sourceDocument: 'https://www.mathworks.com/help/simulink/gs/create-a-simple-model.html',
    imageUrl: 'https://www.mathworks.com/help/simulink/gs/sdi_car_position.png',
  },
  {
    name: 'gap-ui-simulink-viewmarks-2026-09-04',
    label: 'Simulink Viewmark Manager',
    sourceDocument: 'https://www.mathworks.com/help/simulink/ug/bookmark-your-place-in-models.html',
    imageUrl: 'https://www.mathworks.com/help/simulink/ug/viewmark_manager.png',
  },
  {
    name: 'gap-ui-simulink-component-interface-2026-09-04',
    label: 'Simulink Component Interface View',
    sourceDocument: 'https://www.mathworks.com/help/simulink/slref/componentinterfaceview.html',
    imageUrl: 'https://www.mathworks.com/help/simulink/slref/interface-view.png',
  },
  {
    name: 'gap-ui-simulink-signal-hierarchy-2026-09-04',
    label: 'Simulink Signal Hierarchy Viewer',
    sourceDocument: 'https://www.mathworks.com/help/simulink/slref/signalhierarchyviewer.html',
    imageUrl: 'https://www.mathworks.com/help/simulink/slref/signal_hierarchy_viewer_dialog.png',
  },
  {
    name: 'gap-ui-simulink-finder-2026-09-04',
    label: 'Simulink Finder structured results',
    sourceDocument: 'https://www.mathworks.com/help/simulink/slref/finder.html',
    imageUrl: 'https://www.mathworks.com/help/simulink/slref/tool_finder.png',
  },
  {
    name: 'gap-ui-simulink-model-data-editor-2026-09-04',
    label: 'Simulink Model Data Editor with column filtering',
    sourceDocument: 'https://www.mathworks.com/help/simulink/slref/modeldataeditor.html',
    imageUrl: 'https://www.mathworks.com/help/simulink/slref/mde_column_filter.png',
  },
  {
    name: 'gap-ui-simulink-breakpoints-2026-09-04',
    label: 'Simulink and Stateflow Breakpoints List',
    sourceDocument: 'https://www.mathworks.com/help/simulink/slref/breakpointslist.html',
    imageUrl: 'https://www.mathworks.com/help/simulink/slref/breakpoints-list-debug-simulink-stateflow.png',
  },
]

// Official documentation captures for the Behavior Tree prior-art atlas.  The
// report is intentionally a visual dictionary: every "copy/adapt" entry
// points at a real source-tool image, rather than asking a reader to trust a
// paraphrase or a SystemSketch redraw.  Capture the vendor asset on a blank
// page so it stays readable, but retain the documentation URL (not a fragile
// CDN URL) as the citation visible under the image.
const BEHAVIOR_TREE_ATLAS_SOURCES = [
  {
    name: 'bt-atlas-moveit-editor-2026-09-04',
    label: 'MoveIt Studio Pro Behavior Tree edit mode',
    sourceDocument: 'https://docs.picknik.ai/tutorials/quick_start_intro/',
    imageUrl: 'https://docs.picknik.ai/assets/images/edit_mode_bt-9441cfadcee0e05bdce63c97ca343499.png',
    captureWidth: 1180,
  },
  {
    name: 'bt-atlas-moveit-node-taxonomy-2026-09-04',
    label: 'MoveIt Studio Pro behavior-node categories',
    sourceDocument: 'https://docs.picknik.ai/concepts/behavior_trees/',
    imageUrl: 'https://docs.picknik.ai/assets/images/bt_node_types-2239365ddf130f7006482e751d49d978.png',
    captureWidth: 980,
  },
  {
    name: 'bt-atlas-moveit-control-2026-09-04',
    label: 'MoveIt Studio Pro control-node examples',
    sourceDocument: 'https://docs.picknik.ai/concepts/behavior_trees/',
    imageUrl: 'https://docs.picknik.ai/assets/images/control_nodes-885dfb6974c8e09a9262549d3bf363c0.png',
    captureWidth: 1180,
  },
  {
    name: 'bt-atlas-moveit-decorator-2026-09-04',
    label: 'MoveIt Studio Pro decorator-node examples',
    sourceDocument: 'https://docs.picknik.ai/concepts/behavior_trees/',
    imageUrl: 'https://docs.picknik.ai/assets/images/decorator_nodes-93186bd15977ca59d03a1b934de8cda0.png',
    captureWidth: 1180,
  },
  {
    name: 'bt-atlas-moveit-insert-2026-09-04',
    label: 'MoveIt Studio Pro contextual plus insertion control',
    sourceDocument: 'https://docs.picknik.ai/tutorials/quick_start_intro/',
    imageUrl: 'https://docs.picknik.ai/assets/images/plus_button-39ff7e041e72d1e6861fd6421ba386dc.png',
    captureWidth: 760,
  },
  {
    name: 'bt-atlas-moveit-search-2026-09-04',
    label: 'MoveIt Studio Pro searchable behavior picker',
    sourceDocument: 'https://docs.picknik.ai/tutorials/quick_start_intro/',
    imageUrl: 'https://docs.picknik.ai/assets/images/breakpoint_search-5056e9864427195d9b2baf8c0daaf4ec.png',
    captureWidth: 980,
  },
  {
    name: 'bt-atlas-moveit-inspector-2026-09-04',
    label: 'MoveIt Studio Pro behavior library sidebar',
    sourceDocument: 'https://docs.picknik.ai/tutorials/quick_start_intro/',
    imageUrl: 'https://docs.picknik.ai/assets/images/image10-3e5ebfeea3d084fd83f3cbed7dede0ab.png',
    captureWidth: 1080,
  },
  {
    name: 'bt-atlas-moveit-disabled-2026-09-04',
    label: 'MoveIt Studio Pro disabled behavior node',
    sourceDocument: 'https://docs.picknik.ai/tutorials/quick_start_intro/',
    imageUrl: 'https://docs.picknik.ai/assets/images/comment_out_disabled-05c372869619000ec1520c7e793cf3c6.png',
    captureWidth: 980,
  },
  {
    name: 'bt-atlas-moveit-subtree-extract-2026-09-04',
    label: 'MoveIt Studio Pro extract selection as a Subtree',
    sourceDocument: 'https://docs.picknik.ai/tutorials/perception_%26_machine_learning/',
    imageUrl: 'https://docs.picknik.ai/assets/images/convert_to_subtree_modal-b0f6d8360700616e8294087ebe6b68d2.png',
    captureWidth: 980,
  },
  {
    name: 'bt-atlas-moveit-subtree-port-2026-09-04',
    label: 'MoveIt Studio Pro Subtree port inspector',
    sourceDocument: 'https://docs.picknik.ai/tutorials/perception_%26_machine_learning/',
    imageUrl: 'https://docs.picknik.ai/assets/images/apriltag_subtree_port-e6251563e9b9f7b936094c1e19296665.png',
    captureWidth: 1080,
  },
  {
    name: 'bt-atlas-moveit-back-parent-2026-09-04',
    label: 'MoveIt Studio Pro return-to-parent Subtree navigation',
    sourceDocument: 'https://docs.picknik.ai/tutorials/perception_%26_machine_learning/',
    imageUrl: 'https://docs.picknik.ai/assets/images/back_to_parent_objective-162d1b580414b4b7bbfa11f336d8eddf.png',
    captureWidth: 1080,
  },
  {
    name: 'bt-atlas-moveit-breakpoint-2026-09-04',
    label: 'MoveIt Studio Pro placed breakpoint in a behavior tree',
    sourceDocument: 'https://docs.picknik.ai/tutorials/quick_start_intro/',
    imageUrl: 'https://docs.picknik.ai/assets/images/breakpoint_placed-6197e2a0439a2837b8c8060a90c31bf3.png',
    captureWidth: 1180,
  },
  {
    name: 'bt-atlas-moveit-blackboard-2026-09-04',
    label: 'MoveIt Studio Pro Blackboard pane',
    sourceDocument: 'https://docs.picknik.ai/tutorials/quick_start_intro/',
    imageUrl: 'https://docs.picknik.ai/assets/images/blackboard-96b2bac3bbfb272d3bcdb430834cf469.png',
    captureWidth: 920,
  },
  {
    name: 'bt-atlas-moveit-panes-2026-09-04',
    label: 'MoveIt Studio Pro configurable pane layout',
    sourceDocument: 'https://docs.picknik.ai/how_to/custom_view_panes/about_the_user_interface/',
    imageUrl: 'https://docs.picknik.ai/assets/images/high_level_ui_panes-6042425fa93b9f4d6166d2809506e422.jpg',
    captureWidth: 1240,
  },
  {
    name: 'bt-atlas-groot-model-2026-09-04',
    label: 'Groot2 TreeNodesModel with typed ports',
    sourceDocument: 'https://behaviortree.dev/docs/tutorial-basics/tutorial_11_groot2/',
    imageUrl: 'https://www.behaviortree.dev/assets/images/t12_groot_models-5f1f63eeae69454a87cb5f609c0865b6.png',
    captureWidth: 1180,
  },
  {
    name: 'bt-atlas-btcpp-explicit-ports-2026-09-04',
    label: 'BehaviorTree.CPP explicit ports make dataflow visible',
    sourceDocument: 'https://behaviortree.dev/docs/guides/ports_vs_blackboard/',
    imageUrl: 'https://www.behaviortree.dev/assets/images/with_ports_sequence-610186a2466dfe975d67c2fd03f3a031.png',
    captureWidth: 1180,
  },
  {
    name: 'bt-atlas-btcpp-subtree-2026-09-04',
    label: 'BehaviorTree.CPP reusable SubTree call',
    sourceDocument: 'https://behaviortree.dev/docs/tutorial-basics/tutorial_05_subtrees/',
    imageUrl: 'https://www.behaviortree.dev/assets/images/crossdoor_subtree-4f2304772a896359d3fc67c9802e0bef.svg',
    captureWidth: 980,
  },
  {
    name: 'bt-atlas-btcpp-port-remapping-2026-09-04',
    label: 'BehaviorTree.CPP explicit SubTree port remapping',
    sourceDocument: 'https://behaviortree.dev/docs/tutorial-basics/tutorial_06_subtree_ports/',
    imageUrl: 'https://www.behaviortree.dev/assets/images/port_remapping-e025094ce2207aef9dfda609fa10bae7.svg',
    captureWidth: 980,
  },
  {
    name: 'bt-atlas-btcpp-running-2026-09-04',
    label: 'BehaviorTree.CPP RUNNING state diagram',
    sourceDocument: 'https://behaviortree.dev/docs/guides/asynchronous_nodes/',
    imageUrl: 'https://www.behaviortree.dev/assets/images/RunningTree-6247b58f3119ffcc695094305dfd07c7.svg',
    captureWidth: 980,
  },
  {
    name: 'bt-atlas-btcpp-prepost-2026-09-04',
    label: 'BehaviorTree.CPP pre- and post-condition behavior',
    sourceDocument: 'https://behaviortree.dev/docs/guides/pre_post_conditions/',
    imageUrl: 'https://www.behaviortree.dev/assets/images/post_example-a0dd14431e604464b8bed24a2f411fc9.svg',
    captureWidth: 980,
  },
]

function sourceImagePage(entry) {
  // The raw assets are intentionally put on an otherwise-empty page. Capturing
  // the image element (not the browser chrome or a documentation page) gives
  // the report a sharp, portable PNG while retaining a URL-rich manifest.
  const html = `<!doctype html><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:#fff}
    #source{display:block;max-width:1520px;height:auto}
  </style><img id="source" src="${entry.imageUrl}" alt="${entry.label}">`
  return `data:text/html;base64,${Buffer.from(html, 'utf8').toString('base64')}`
}

async function loadedImageBox(page, label, selector = '#source', timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  let lastState = 'not evaluated'
  while (Date.now() < deadline) {
    const raw = await evaluate(page, `JSON.stringify((() => {
      const image = document.querySelector(${JSON.stringify(selector)})
      if (!image) return { state: 'missing image element' }
      const rect = image.getBoundingClientRect()
      return {
        state: image.complete ? 'complete' : 'loading',
        naturalWidth: image.naturalWidth,
        naturalHeight: image.naturalHeight,
        x: rect.x + window.scrollX,
        y: rect.y + window.scrollY,
        width: rect.width,
        height: rect.height,
      }
    })())`)
    const state = JSON.parse(raw)
    lastState = JSON.stringify(state)
    if (state.naturalWidth > 0 && state.naturalHeight > 0 && state.width > 0 && state.height > 0) {
      return state
    }
    await delay(120)
  }
  throw new Error(`Timed out loading ${label}: ${lastState}`)
}

async function captureGapSource(page, entry) {
  const startedAt = new Date().toISOString()
  const startedMs = Date.now()
  const isSameOriginCapture = Boolean(entry.documentImageSelector)
  await page.send('Page.navigate', { url: isSameOriginCapture ? entry.sourceDocument : sourceImagePage(entry) })
  const box = await loadedImageBox(page, entry.label, entry.documentImageSelector)
  if (entry.settle) await delay(entry.settle)
  const clip = {
    ...box,
    width: Math.min(entry.captureWidth ?? box.width, box.width),
    height: Math.min(entry.captureHeight ?? box.height, box.height),
  }
  const shot = await shoot(page, entry.name, clip)
  return {
    file: `${entry.name}.png`,
    bytes: shot.bytes,
    label: entry.label,
    sourceDocument: entry.sourceDocument,
    sourceImage: entry.imageUrl,
    capturedAt: new Date().toISOString(),
    startedAt,
    durationMs: Date.now() - startedMs,
    image: {
      naturalWidth: box.naturalWidth,
      naturalHeight: box.naturalHeight,
      capturedWidth: clip.width,
      capturedHeight: clip.height,
    },
    status: 'captured',
  }
}

async function captureCatalogSources({ entries, manifestName, capturedFor, label }) {
  await mkdir(ASSETS, { recursive: true })
  const manifest = {
    schemaVersion: 1,
    capturedFor,
    generatedAt: new Date().toISOString(),
    captures: [],
  }
  const { proc, page } = await launch({ width: 1600, height: 1200 })
  try {
    // MathWorks serves its public documentation to a normal Chrome identity but
    // replies with an Access Denied page to the literal HeadlessChrome token.
    // We still use the same disposable headless/CDP session; this only makes
    // the request look like the browser that a reader would actually use.
    await page.send('Emulation.setUserAgentOverride', {
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    })
    for (const entry of entries) {
      console.log(`→ ${entry.label}`)
      try {
        manifest.captures.push(await captureGapSource(page, entry))
      } catch (error) {
        // A missing image must be visible to the report author. Do not replace
        // it with a generic web screenshot that appears to be primary evidence.
        manifest.captures.push({
          file: `${entry.name}.png`,
          label: entry.label,
          sourceDocument: entry.sourceDocument,
          sourceImage: entry.imageUrl,
          capturedAt: new Date().toISOString(),
          status: 'failed',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  } finally {
    proc.kill('SIGKILL')
  }
  await writeFile(join(ASSETS, manifestName), `${JSON.stringify(manifest, null, 2)}\n`)
  const failures = manifest.captures.filter((capture) => capture.status === 'failed')
  console.log(`\n${manifest.captures.length - failures.length}/${manifest.captures.length} ${label} captures written to docs/assets/`)
  if (failures.length) {
    throw new Error(`${label} capture failures: ${failures.map(({ label: failedLabel }) => failedLabel).join(', ')}`)
  }
}

async function captureGapAnalysisSources() {
  return captureCatalogSources({
    entries: GAP_ANALYSIS_SOURCES,
    manifestName: 'gap-reference-captures-2026-09-03.json',
    capturedFor: 'docs/build_labview_blueprint_simulink_gap_analysis.py',
    label: 'gap-analysis',
  })
}

async function captureBehaviorTreeAtlasSources() {
  return captureCatalogSources({
    entries: BEHAVIOR_TREE_ATLAS_SOURCES,
    manifestName: 'behavior-tree-prior-art-captures-2026-09-04.json',
    capturedFor: 'docs/build_behavior_tree_moveit_groot_prior_art.py',
    label: 'behavior-tree prior-art',
  })
}

/** unit's own documented interaction recordings, on one page the browser renders. */
const UNIT_GIFS = [
  ['17', 'Connect — drop a node onto a compatible node'],
  ['31', 'Draw — a stroke out of the centre makes an output plug; inward makes an input'],
  ['33', 'Draw — a circle makes a unit, a rectangle makes a component'],
  ['42', 'Draw — a contour around nodes composes them'],
  ['34', 'Compose — long press on the background wraps the selection into a unit'],
  ['35', 'Explode — the same long press unwraps it again'],
  ['26', 'Enter / leave a graph with a long click'],
  ['25', 'Change mode — click an input to make it constant'],
  ['55', 'Change mode — click a graph input plug to make the input set functional'],
]

async function unitContactSheet(page) {
  const base = 'https://raw.githubusercontent.com/samuelmtimbo/unit/main/public/gif/start'
  const cards = UNIT_GIFS.map(([id, caption]) => `
    <figure><img src="${base}/${id}.gif" alt="unit gif ${id}"/>
    <figcaption><b>${id}.gif</b> — ${caption}</figcaption></figure>`).join('')
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#111;color:#eee;font:13px/1.45 ui-sans-serif,system-ui;padding:16px}
    .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
    figure{margin:0;background:#1b1b1b;border:1px solid #2d2d2d;border-radius:10px;overflow:hidden}
    img{width:100%;display:block;background:#000}
    figcaption{padding:8px 10px;color:#bdbdbd}
    b{color:#fff}
  </style><div class="grid">${cards}</div>`
  const dataUrl = `data:text/html;base64,${Buffer.from(html, 'utf8').toString('base64')}`
  await page.send('Page.navigate', { url: dataUrl })
  // Some of these recordings are ~2 MB; poll rather than guess a settle time.
  let loaded = 0
  for (let attempt = 0; attempt < 40; attempt += 1) {
    loaded = await evaluate(page, '[...document.images].filter(i=>i.complete&&i.naturalWidth>0).length')
    if (loaded === UNIT_GIFS.length) break
    await delay(1500)
  }
  console.log(`  unit recordings rendered: ${loaded}/${UNIT_GIFS.length}`)
  if (loaded < UNIT_GIFS.length) console.warn('  WARNING: not every recording rendered')
  const boxes = await evaluate(page, `JSON.stringify([...document.querySelectorAll('figure')].map(f=>{const r=f.getBoundingClientRect();return {x:r.x+window.scrollX,y:r.y+window.scrollY,width:r.width,height:r.height}}))`)
  return { loaded, boxes: JSON.parse(boxes) }
}

async function main() {
  if (process.argv.includes('--gap-analysis')) {
    await captureGapAnalysisSources()
    return
  }
  if (process.argv.includes('--behavior-tree-atlas')) {
    await captureBehaviorTreeAtlasSources()
    return
  }
  await mkdir(ASSETS, { recursive: true })
  const manifest = { capturedFor: 'docs/build_reference_learnings.py', shots: [] }

  {
    // enso.org is a 13,938px scroll story; the graph editor only appears in the
    // second half. These stops were found by sweeping the whole page and reading
    // the heading in view, so each one is a named section rather than a guess.
    console.log('→ enso.org sweep')
    const { proc, page } = await launch({ width: 1440, height: 900 })
    try {
      await page.send('Page.navigate', { url: 'https://enso.org/' })
      await delay(9000)
      const sections = [
        [5400, 'reshape', 'Clean and reshape. Ensure data quality.'],
        [6100, 'blend', 'Blend and process data in-database and in-memory.'],
        [7500, 'live', 'Live, interactive data processing — visualization under the node.'],
        [8200, 'custom', 'Build and share custom components.'],
        [10300, 'dual', 'No-code or full-code — the same workflow as graph and as text.'],
      ]
      for (const [top, slug, note] of sections) {
        await evaluate(page, `window.scrollTo({top:${top},behavior:'instant'})`)
        await delay(1500)
        const shot = await shoot(page, `ref-enso-${slug}`)
        manifest.shots.push({ ...shot, source: 'https://enso.org/', note })
      }
    } finally { proc.kill('SIGKILL') }
  }

  {
    console.log('→ nevalang.org sweep')
    const { proc, page } = await launch({ width: 1440, height: 900 })
    try {
      manifest.shots.push(...await sweep(page, 'https://nevalang.org/', 'ref-neva', {
        settle: 6000, stops: [0, 700, 1400],
      }))
    } finally { proc.kill('SIGKILL') }
  }

  {
    console.log('→ unit documented gestures')
    const { proc, page } = await launch({ width: 1200, height: 2400, scale: 1.5 })
    try {
      const { loaded, boxes } = await unitContactSheet(page)
      manifest.unitRecordingsLoaded = loaded
      // One tight crop per gesture, so the report can show a single claim at size.
      //
      // These are animations, so a single capture lands on an arbitrary frame —
      // often the blank canvas at the start of a loop, which then contradicts
      // the caption written about it. Sample a few frames and keep the busiest:
      // a frame with more drawn on it compresses larger, so PNG size is a good
      // enough proxy for "this frame actually shows the gesture".
      for (const [index, box] of boxes.entries()) {
        const id = UNIT_GIFS[index][0]
        let best = null
        for (let sample = 0; sample < 6; sample += 1) {
          const { data } = await page.send('Page.captureScreenshot', {
            format: 'png', captureBeyondViewport: true, clip: { ...box, scale: 2 },
          })
          const buffer = Buffer.from(data, 'base64')
          if (!best || buffer.length > best.length) best = buffer
          await delay(700)
        }
        await writeFile(join(ASSETS, `ref-unit-${id}.png`), best)
        console.log(`  ref-unit-${id}.png  ${(best.length / 1024).toFixed(0)} KB (best of 6 frames)`)
        manifest.shots.push({ name: `ref-unit-${id}`, bytes: best.length, frameSelection: 'best-of-6' })
      }
    } finally { proc.kill('SIGKILL') }
  }

  await writeFile(join(ASSETS, 'reference-capture-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`\n${manifest.shots.length} captures written to docs/assets/`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})

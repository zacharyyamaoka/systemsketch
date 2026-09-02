import {
  ArrowDownToolbarItem,
  ArrowLeftToolbarItem,
  ArrowRightToolbarItem,
  ArrowToolbarItem,
  ArrowUpToolbarItem,
  AssetToolbarItem,
  CheckBoxToolbarItem,
  CloudToolbarItem,
  DefaultToolbar,
  DiamondToolbarItem,
  DrawToolbarItem,
  EllipseToolbarItem,
  EraserToolbarItem,
  FrameToolbarItem,
  HandToolbarItem,
  HeartToolbarItem,
  HexagonToolbarItem,
  HighlightToolbarItem,
  LaserToolbarItem,
  LineToolbarItem,
  NoteToolbarItem,
  OvalToolbarItem,
  RectangleToolbarItem,
  RhombusToolbarItem,
  SelectToolbarItem,
  StarToolbarItem,
  TextToolbarItem,
  TldrawUiMenuItem,
  TriangleToolbarItem,
  XBoxToolbarItem,
  useEditor,
  useIsToolSelected,
  useTools,
  useValue,
  type TLUiOverrides,
} from 'tldraw'
import { useEffect, useRef, useState } from 'react'
import { BLOCK_TOOL_ID, PILL_TOOL_ID, getBlockInspectorContext, withBlockTool } from '../blocks'
import {
  EditorBlockInspector,
  EditorConnectionInspector,
  getConnectionInspectorContext,
  HitAreaOverlay,
  OnCanvasBlockPicker,
} from '../blocks/ui'
import { DepthStackNavigator } from '../depth/DepthStackNavigator'
import {
  DEVELOPMENT_PRESETS,
  developmentProfileLabel,
  resolveDevelopmentProfile,
} from '../developmentProfiles'
import { loadPreviewCloneFromCurrentUrl } from '../previewClone'
import { runReleaseAction } from '../releaseClient'
import './development-preview.css'

export const BLOCK_DEVELOPMENT_OVERRIDES: TLUiOverrides = {
  tools: (editor, tools) => withBlockTool(editor, tools),
}

function BlockDevelopmentToolbarItem() {
  const tools = useTools()
  const tool = tools[BLOCK_TOOL_ID]
  const isSelected = useIsToolSelected(tool)
  if (!tool) return null

  return (
    <TldrawUiMenuItem
      {...tool}
      isSelected={isSelected}
      data-testid="block-development-tool"
    />
  )
}

function PillDevelopmentToolbarItem() {
  const tools = useTools()
  const tool = tools[PILL_TOOL_ID]
  const isSelected = useIsToolSelected(tool)
  if (!tool) return null

  return (
    <TldrawUiMenuItem
      {...tool}
      isSelected={isSelected}
      data-testid="pill-development-tool"
    />
  )
}

/**
 * Stock tldraw toolbar with one additive seam: Block and Pill are visible in
 * slots 8 and 9. Asset moves to slot 10 and every remaining stock item keeps
 * its stock order in the overflow menu.
 */
export function BlockDevelopmentToolbar() {
  return (
    <DefaultToolbar maxItems={10}>
      <SelectToolbarItem />
      <HandToolbarItem />
      <DrawToolbarItem />
      <EraserToolbarItem />
      <ArrowToolbarItem />
      <TextToolbarItem />
      <NoteToolbarItem />
      <BlockDevelopmentToolbarItem />
      <PillDevelopmentToolbarItem />
      <AssetToolbarItem />

      <RectangleToolbarItem />
      <EllipseToolbarItem />
      <TriangleToolbarItem />
      <DiamondToolbarItem />

      <HexagonToolbarItem />
      <OvalToolbarItem />
      <RhombusToolbarItem />
      <StarToolbarItem />

      <CloudToolbarItem />
      <HeartToolbarItem />
      <XBoxToolbarItem />
      <CheckBoxToolbarItem />

      <ArrowLeftToolbarItem />
      <ArrowUpToolbarItem />
      <ArrowDownToolbarItem />
      <ArrowRightToolbarItem />

      <LineToolbarItem />
      <HighlightToolbarItem />
      <LaserToolbarItem />
      <FrameToolbarItem />
    </DefaultToolbar>
  )
}

/**
 * The block-dev lane owns one InFrontOfTheCanvas component. Preview identity
 * remains visible while the inspector is derived from editor state: active
 * Block tool, or exactly one selected Block. Merely rendering this surface has
 * no command path and therefore cannot write shape state.
 */
export function BlockDevelopmentPreviewChrome() {
  const editor = useEditor()
  const showInspector = useValue(
    'block development inspector visibility',
    () => getBlockInspectorContext(editor).kind !== 'empty',
    [editor],
  )
  // A selected cable is the dock's other subject. The Block lens wins when both
  // are somehow live, because a Block carries far more to edit.
  const showConnectionInspector = useValue(
    'connection inspector visibility',
    () => !showInspector && getConnectionInspectorContext(editor) !== null,
    [editor, showInspector],
  )

  return (
    <>
      <DevelopmentPreviewChrome />
      <DepthStackNavigator />
      <OnCanvasBlockPicker />
      <HitAreaOverlay />
      {showInspector || showConnectionInspector ? (
        <aside
          className="systemsketch-block-development-inspector"
          aria-label="Block development inspector"
          data-testid="block-development-inspector"
        >
          {showInspector
            ? <EditorBlockInspector editor={editor} />
            : <EditorConnectionInspector editor={editor} />}
        </aside>
      ) : null}
    </>
  )
}

export function DevelopmentPreviewChrome() {
  const editor = useEditor()
  const profile = resolveDevelopmentProfile(window.location.search)
  const preset = DEVELOPMENT_PRESETS.find((candidate) => candidate.id === profile)
  const importStarted = useRef(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (importStarted.current) return
    importStarted.current = true
    void loadPreviewCloneFromCurrentUrl(editor)
      .then((imported) => {
        if (imported) setMessage('Opened an independent duplicate of your Stable board.')
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
  }, [editor])

  const returnToStable = async () => {
    setBusy(true)
    setError(null)
    try {
      const next = await runReleaseAction('stable')
      window.location.assign(next.launchUrl ?? 'http://127.0.0.1:4321/')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy(false)
    }
  }

  return (
    <aside
      className="systemsketch-development-preview"
      aria-label={`${developmentProfileLabel(profile)} development composition`}
      data-testid="development-preview-identity"
    >
      <div className="systemsketch-development-preview__identity">
        <span><i aria-hidden="true" />Preview · {developmentProfileLabel(profile)}</span>
        <small>{preset?.description ?? 'Full product'} · Stable stays unchanged</small>
      </div>
      {message ? <p>{message}</p> : null}
      {error ? <p className="error">{error}</p> : null}
      <button type="button" disabled={busy} onClick={() => void returnToStable()}>
        {busy ? 'Returning…' : 'Return to Stable'}
      </button>
    </aside>
  )
}

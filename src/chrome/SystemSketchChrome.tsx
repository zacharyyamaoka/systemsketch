import {
  TldrawUiButton,
  TldrawUiToolbarButton,
  useActions,
  useDialogs,
  useEditor,
  usePassThroughWheelEvents,
  useRelevantStyles,
  useTldrawUiComponents,
  useToasts,
  useValue,
  type Editor,
  type TLShapeId,
} from 'tldraw'
import { cloneElement, isValidElement, useCallback, useEffect, useMemo, useRef } from 'react'
import type { ComponentType, ReactElement, ReactNode } from 'react'
import { AppearanceControls, hasAppearanceControls } from '../appearance/AppearanceControls'
import {
  AlignBottomIcon,
  AlignLeftIcon,
  AlignRightIcon,
  AlignTopIcon,
  BringForwardIcon,
  BringToFrontIcon,
  CenterHorizontallyIcon,
  CenterVerticallyIcon,
  DistributeHorizontallyIcon,
  DistributeVerticallyIcon,
  SendBackwardIcon,
  SendToBackIcon,
} from '../appearance/excalidrawIcons/icons'
import { ArrangeControls, type ArrangeAction } from '../contextualMenus/ArrangeControls'
import { OpacityControl } from '../contextualMenus/OpacityControl'
import { CompareTrigger } from '../compare'
import { usePillPresentation } from '../settings/pillPresentation'
import { PillPresentationChip } from './PillPresentationChip'
import { WrapSelectionControl } from '../frames/WrapSelectionControl'
import { canWrapSelection } from '../frames/wrapSelection'
import {
  BLOCK_TOOL_ID,
  PILL_TOOL_ID,
  TYPE_TOOL_ID,
  adoptConnectedPillType,
  canAdoptConnectedPillType,
  getBlockInspectorContext,
  getOnlySelectedBlock,
  selectionHasBlockStyles,
} from '../blocks'
import {
  FLOATING_PORT_TOOL_ID,
  FloatingPortInspector,
  getOnlySelectedFloatingPort,
} from '../floatingPort'
import { addTextTarget, selectionHasVisibleText } from '../appearance/textPresence'
import { describeResetEdgeRoutingOutcome, resetEdgeRouting } from '../blocks/connections/resetEdges'
import { describeTidyEdgesOutcome, tidyEdges } from '../blocks/connections/tidyEdges'
import { clearDiffStates } from '../diff/clearDiffStates'
import { describeOrganizeNodesOutcome, organizeNodes } from '../blocks/layout'
import {
  EditorBlockInspector,
  EditorBlockSelectionMiniMenu,
  BlockTitleFormattingControls,
  canShowBlockSelectionMiniMenu,
  EditorConnectionInspector,
  getConnectionInspectorContext,
  HitAreaOverlay,
  OnCanvasBlockPicker,
  TunnelLayerBar,
  getEditingBlockTitle,
} from '../blocks/ui'
import {
  BRANCH_TOOL_ID,
  EditorBranchInspector,
  EditorBranchSelectionMiniMenu,
  getOnlySelectedBranch,
} from '../branch'
import { EditorLoopInspector, getOnlySelectedLoop } from '../loop'
import { BehaviorTreeDndDragHost, BtRunOverlays, EditorBehaviorTreeInspector, EditorBehaviorTreeSelectionMiniMenu, getSelectedBehaviorTree, treeDragRefusalState } from '../behaviorTree'
import { BtDragModelSurface } from '../behaviorTree/BtDragModelSurface'
import { BtDragModelTunerPanel, dragModelTunerOpen } from '../behaviorTree/ui/BtDragModelTunerPanel'
import {
  CodeResizeIndicator,
  EditorCodeSelectionMiniMenu,
  getSelectedCodeShapes,
} from '../code'
import { DepthStackNavigator } from '../depth/DepthStackNavigator'
import { DraftsControl } from '../drafts/DraftsControl'
import {
  PropagationFocusControls,
  PropagationFocusDomLens,
  propagationSeedFromSelection,
  usePropagationFocus,
} from '../propagation'
import { PortableShareButton } from '../export/PortableShareButton'
import { ShapeLibraryBrowser } from '../library/ShapeLibraryBrowser'
// Imported by path rather than through `../behaviorTree`: the barrel is being
// edited by a concurrent session, and the panel has no other consumer.
import { BehaviorTreeLibraryPanel } from '../behaviorTree/ui/BehaviorTreeLibraryPanel'
import { PrimitiveSearch } from '../library/PrimitiveSearch'
import { BoardOverview } from './BoardOverview'
import { LocalCommentsPanel } from '../comments'
import { BoardDiagnosticsPanel } from '../diagnostics'
import { VariableRegistryPanel } from '../expression/VariableRegistryPanel'
import {
  SystemSketchCommandPalette,
  type CommandPaletteAction,
} from '../commands'
import { RecorderIndicator } from '../recorder/RecorderControls'
import { ShapeFactsPanel } from './ShapeFactsPanel'
import {
  inspectorSubjectOwnsHeader,
  inspectorSubjectTitle,
  readInspectorSubject,
  type InspectorSubject,
} from './inspectorSubject'
import { SystemSketchSettingsDialog } from '../settings/InterfaceSettings'
import { useChrome } from './ChromeProvider'
import { SelectionContextualMenu } from './SelectionContextualMenu'
import {
  getSelectionLayoutActionAvailability,
  SelectionLayoutActions,
} from './SelectionLayoutActions'
import { ContextualSurface } from '../contextualMenus/ContextualSurface'
import type { RightSurface } from './chromeState'
import { CommunicationPrototypeControls } from '../prototypes/communication/CommunicationPrototypeControls'
import { CommunicationPortDndHost } from '../blocks/ports/CommunicationPortDnd'
import './systemsketch-chrome.css'
import './rich-text-toolbar.css'

function PanelIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <rect x="3" y="3.5" width="14" height="13" rx="2" />
      <path d="M12 3.5v13" />
    </svg>
  )
}

export function SystemSketchMenuPanel() {
  const { MainMenu } = useTldrawUiComponents()
  const ref = useRef<HTMLElement>(null)
  usePassThroughWheelEvents(ref)
  return (
    <nav
      ref={ref}
      className="systemsketch-top-left-shell"
      aria-label="Board and depth navigation"
      data-testid="systemsketch-top-left-shell"
      data-systemsketch-chrome
    >
      {MainMenu ? <MainMenu /> : null}
      {/* Between the file identity and the breadcrumb — never after it. Zach's
          explicit requirement: the breadcrumb stays the rightmost element of
          this cluster, so Drafts goes here rather than appended below. */}
      <DraftsControl />
      <DepthStackNavigator placement="menu" />
    </nav>
  )
}

export function SystemSketchSharePanel() {
  const { rightSurface, toggleRight } = useChrome()
  const { addDialog } = useDialogs()
  const ref = useRef<HTMLElement>(null)
  usePassThroughWheelEvents(ref)

  return (
    <nav
      ref={ref}
      className="systemsketch-top-right-shell"
      aria-label="Collaboration and sharing"
      data-testid="systemsketch-top-right-shell"
      data-systemsketch-chrome
    >
      {/* There is no identity to show — SystemSketch is local and single-user —
          so this badge used to be a button labelled "Profile placeholder" that
          did nothing when pressed. A control in the chrome has to do the thing
          its shape promises, and the honest thing behind a profile badge in a
          local app is the preferences it would have opened: the same Settings
          dialog the main menu opens, at the same id so the two share one
          instance. */}
      <TldrawUiButton
        type="low"
        className="systemsketch-avatar-button"
        title="Settings — theme and interface scale"
        aria-label="Open settings"
        data-testid="systemsketch-avatar-button"
        /* Landing on Appearance rather than Interface: theme is the preference
           closest to what a profile badge implies, and it is the one a person
           reaches for first on a new machine. */
        onClick={() => addDialog({
          id: 'systemsketch-settings',
          component: (props) => <SystemSketchSettingsDialog {...props} category="appearance" />,
        })}
      >
        Z
      </TldrawUiButton>
      {/*
        Compare sits beside the panel toggle, not over the canvas.

        Both are "open a review surface", so they group; and this is the row a
        hand already goes to for global actions. Its old home was an absolutely
        positioned pill floating just below this shell, aligned to nothing —
        which is exactly what Zach called out. It renders nothing outside the
        product app, where no compare provider is mounted.
      */}
      <CompareTrigger />
      <TldrawUiButton
        type="icon"
        className="systemsketch-shell-icon-button"
        title="Comments and inspector"
        aria-expanded={rightSurface === 'comments'}
        aria-controls={rightSurface ? 'systemsketch-right-popout' : undefined}
        onClick={() => toggleRight('comments')}
      >
        <PanelIcon />
      </TldrawUiButton>
      {/* WHY the library and command launchers do not duplicate in this compact
          shell: the bottom toolbar owns Library and Ctrl/Cmd+P owns Commands.
          Keeping this row to collaboration, inspector, and sharing preserves
          the adjacent controls while removing two competing entry points. */}
      <PortableShareButton />
    </nav>
  )
}

function ShapesLibrary() {
  const { setLeft } = useChrome()
  return <ShapeLibraryBrowser autoFocus onCancel={() => setLeft(null)} onInserted={() => setLeft(null)} />
}

function RightSurfaceBody({
  surface,
  subject,
  onClose,
}: {
  surface: RightSurface
  subject: InspectorSubject
  onClose(): void
}) {
  const editor = useEditor()
  const readOnly = useValue(
    'SystemSketch comments read-only state',
    () => editor.getInstanceState().isReadonly,
    [editor],
  )
  if (surface === 'board-overview') {
    return <BoardOverview />
  }
  if (surface === 'diagnostics') {
    return <BoardDiagnosticsPanel editor={editor} />
  }
  if (surface === 'variable-registry') return <VariableRegistryPanel editor={editor} />
  if (surface === 'inspector') return <InspectorDock editor={editor} subject={subject} onClose={onClose} />
  return <LocalCommentsPanel editor={editor} readOnly={readOnly} />
}

/**
 * The dock's body for a resolved subject.
 *
 * Precedence and header ownership both live in `inspectorSubject.ts`; this only
 * maps a subject to its panel. The `shape` arm is the new one: `Inspect` is
 * offered for every selection, so an ordinary rectangle now lands on the facts
 * tldraw actually holds instead of on "Select a Block to inspect it."
 */
function InspectorDock({
  editor,
  subject,
  onClose,
}: {
  editor: Editor
  subject: InspectorSubject
  onClose(): void
}) {
  if (subject === 'branch') return <EditorBranchInspector editor={editor} onRequestClose={onClose} />
  if (subject === 'loop') return <EditorLoopInspector editor={editor} onRequestClose={onClose} />
  if (subject === 'port') return <FloatingPortInspector editor={editor} />
  if (subject === 'behaviorTree') return <EditorBehaviorTreeInspector editor={editor} onRequestClose={onClose} />
  if (subject === 'connection') return <EditorConnectionInspector editor={editor} />
  if (subject === 'shape') return <ShapeFactsPanel editor={editor} />
  if (subject === 'empty') return <InspectorEmptyState />
  return <EditorBlockInspector editor={editor} onRequestClose={onClose} />
}

/**
 * Nothing selected.
 *
 * The old empty state was a bare `<p>` centred in an otherwise blank 280px
 * column. Every other panel in this app already has a designed empty state —
 * glyph, heading, one sentence of guidance — and `.systemsketch-panel-empty` is
 * that pattern, so the dock uses it rather than a fourth look.
 */
function InspectorEmptyState() {
  return (
    <div className="systemsketch-panel-empty" data-testid="systemsketch-inspector-empty">
      <span aria-hidden="true">▣</span>
      <strong>Nothing selected</strong>
      <p>
        Select a Block, Port, Branch, Behavior Tree or cable to edit it here. Any other shape shows
        what the board knows about it.
      </p>
    </div>
  )
}

/**
 * Wrap a vendored Excalidraw glyph (a pre-built `<svg>` element — see
 * `createIcon.tsx`) as the `ComponentType<{ className }>` `ArrangeControls`
 * expects for its `icon` prop. `AppearanceGlyph.tsx` solves the same "a
 * `createIcon` result carries no width/height of its own" problem with a
 * wrapping `<span>`; this clones the class directly onto the vendored `<svg>`
 * instead, since `ArrangeControls` already owns the button's own layout and
 * only needs the icon to size itself.
 */
function excalidrawIcon(node: ReactNode): ComponentType<{ className?: string }> {
  return function ExcalidrawArrangeIcon({ className }: { className?: string }) {
    return isValidElement(node) ? cloneElement(node as ReactElement<{ className?: string }>, { className }) : null
  }
}

const ARRANGE_Z_ORDER: readonly ArrangeAction[] = [
  { id: 'sendToBack', label: 'Send to back', icon: excalidrawIcon(SendToBackIcon) },
  { id: 'sendBackward', label: 'Send backward', icon: excalidrawIcon(SendBackwardIcon) },
  { id: 'bringForward', label: 'Bring forward', icon: excalidrawIcon(BringForwardIcon) },
  { id: 'bringToFront', label: 'Bring to front', icon: excalidrawIcon(BringToFrontIcon) },
]

const ARRANGE_ALIGN: readonly ArrangeAction[] = [
  { id: 'left', label: 'Align left', icon: excalidrawIcon(AlignLeftIcon) },
  { id: 'center-horizontal', label: 'Align horizontal centers', icon: excalidrawIcon(CenterHorizontallyIcon) },
  { id: 'right', label: 'Align right', icon: excalidrawIcon(AlignRightIcon) },
  { id: 'top', label: 'Align top', icon: excalidrawIcon(AlignTopIcon) },
  { id: 'center-vertical', label: 'Align vertical centers', icon: excalidrawIcon(CenterVerticallyIcon) },
  { id: 'bottom', label: 'Align bottom', icon: excalidrawIcon(AlignBottomIcon) },
]

const ARRANGE_DISTRIBUTE: readonly ArrangeAction[] = [
  { id: 'distribute-horizontal', label: 'Distribute horizontally', icon: excalidrawIcon(DistributeHorizontallyIcon) },
  { id: 'distribute-vertical', label: 'Distribute vertically', icon: excalidrawIcon(DistributeVerticallyIcon) },
]

const ARRANGE_ALIGN_OPS = ['left', 'right', 'top', 'bottom', 'center-horizontal', 'center-vertical'] as const
type ArrangeAlignOp = (typeof ARRANGE_ALIGN_OPS)[number]
function isArrangeAlignOp(id: string): id is ArrangeAlignOp {
  return (ARRANGE_ALIGN_OPS as readonly string[]).includes(id)
}

/** Every z-order action a selection of any size can take, keyed by its id. */
const ARRANGE_Z_ORDER_HANDLERS: Readonly<Record<string, (editor: Editor, ids: TLShapeId[]) => void>> = {
  sendToBack: (editor, ids) => { editor.sendToBack(ids) },
  sendBackward: (editor, ids) => { editor.sendBackward(ids) },
  bringForward: (editor, ids) => { editor.bringForward(ids) },
  bringToFront: (editor, ids) => { editor.bringToFront(ids) },
}

/**
 * The Arrange cluster: z-order for any selection, align once 2+ shapes are
 * selected, distribute once 3+ are — exactly stock `Editor` calls
 * (`sendToBack`/`sendBackward`/`bringForward`/`bringToFront`/`alignShapes`/
 * `distributeShapes`), no new value model. `ArrangeControls` itself holds no
 * selection-count logic; this adapter is where that policy lives.
 */
function ArrangeAdapter() {
  const editor = useEditor()
  const selectionCount = useValue(
    'systemsketch arrange selection count',
    () => editor.getSelectedShapeIds().length,
    [editor],
  )
  if (selectionCount === 0) return null
  const align = selectionCount >= 2
    ? (selectionCount >= 3 ? [...ARRANGE_ALIGN, ...ARRANGE_DISTRIBUTE] : ARRANGE_ALIGN)
    : undefined
  const onAction = (id: string) => {
    const ids = editor.getSelectedShapeIds()
    if (ids.length === 0) return
    editor.markHistoryStoppingPoint('arrange')
    const zOrder = ARRANGE_Z_ORDER_HANDLERS[id]
    if (zOrder) { zOrder(editor, ids); return }
    if (isArrangeAlignOp(id)) { editor.alignShapes(ids, id); return }
    if (id === 'distribute-horizontal') { editor.distributeShapes(ids, 'horizontal'); return }
    if (id === 'distribute-vertical') { editor.distributeShapes(ids, 'vertical') }
  }
  return <ArrangeControls zOrder={ARRANGE_Z_ORDER} align={align} onAction={onAction} />
}

/**
 * The opacity slider: Excalidraw-parity 0-100 percent, read through
 * `editor.getSharedOpacity()` and written through
 * `editor.setOpacityForSelectedShapes()` — stock tldraw's own shared-style
 * plumbing, mapped onto the 0-100 scale `OpacityControl` speaks (see that
 * component's own doc for why the split).
 */
function OpacityAdapter() {
  const editor = useEditor()
  const hasSelection = useValue(
    'systemsketch opacity has selection',
    () => editor.getSelectedShapeIds().length > 0,
    [editor],
  )
  const shared = useValue('systemsketch opacity shared', () => editor.getSharedOpacity(), [editor])
  const value: number | 'mixed' | null = !hasSelection
    ? null
    : shared.type === 'mixed' ? 'mixed' : Math.round(shared.value * 100)
  // WHY a ref rather than marking a stopping point on every call: a slider
  // drag fires many `continuous` writes in one gesture (see
  // `OpacityControl.tsx`), and marking on each would make every tick its own
  // undo step. Marking ONCE at drag start — then not again until the next
  // gesture — is what coalesces the whole drag, continuous ticks and the
  // final settle alike, into one step a single undo reverts.
  const draggingRef = useRef(false)
  const handleChange = (percent: number, options?: { continuous?: boolean }) => {
    if (options?.continuous) {
      if (!draggingRef.current) {
        draggingRef.current = true
        editor.markHistoryStoppingPoint('opacity')
      }
    } else {
      draggingRef.current = false
    }
    editor.setOpacityForSelectedShapes(percent / 100)
  }
  return <OpacityControl value={value} onChange={handleChange} label="Opacity" />
}

function SelectionMiniMenu() {
  const editor = useEditor()
  const { addToast } = useToasts()
  const relevantStyles = useRelevantStyles()
  // Read unconditionally, ahead of this function's several early `return
  // null`s — a hook read after one of those fires on some renders and not
  // others, which is exactly what "Rendered more hooks than during the
  // previous render" means.
  const pillPresentation = usePillPresentation()
  const canShow = useValue(
    'systemsketch selection mini menu',
    () => (
      editor.getSelectedShapeIds().length > 0
      && editor.getEditingShapeId() === null
      && editor.getCurrentToolId() === 'select'
    ),
    [editor],
  )
  // A Block stays a Block selection as the user adds or removes peers. Keep a
  // selection-identity value so its batch controls refresh across those
  // transitions without narrating the selected count in the menu.
  const selectionKey = useValue(
    'systemsketch selection identity',
    () => Array.from(editor.getSelectedShapeIds()).sort().join(','),
    [editor],
  )
  // Any Block in the selection — one, nine, or nested inside a group — gets the
  // Block mini menu, because every control on it is now a batch style write.
  const hasBlocks = useValue(
    'systemsketch selection has Blocks',
    () => selectionHasBlockStyles(editor),
    [editor],
  )
  const hasBlockMiniMenu = useValue(
    'systemsketch selection has Block mini menu',
    () => canShowBlockSelectionMiniMenu(editor),
    [editor],
  )
  const hasBranch = useValue(
    'systemsketch selection is one Branch',
    () => getOnlySelectedBranch(editor) !== null,
    [editor],
  )
  const hasBehaviorTree = useValue(
    'systemsketch selection is a Behavior Tree',
    () => getSelectedBehaviorTree(editor) !== null,
    [editor],
  )
  const dragModelTunerIsOpen = useValue(
    'systemsketch drag model tuner open',
    () => dragModelTunerOpen.get(),
    [],
  )
  const hasCode = useValue(
    'systemsketch selection has Code blocks',
    () => getSelectedCodeShapes(editor).length > 0,
    [editor],
  )
  const layoutActions = useValue(
    'systemsketch selection layout actions',
    () => getSelectionLayoutActionAvailability(editor),
    [editor],
  )
  const hasAppearance = useValue(
    'systemsketch selection has appearance actions',
    () => hasAppearanceControls(
      relevantStyles,
      selectionHasVisibleText(editor),
      addTextTarget(editor),
    ),
    [editor, relevantStyles],
  )
  const canWrap = useValue(
    'systemsketch selection can wrap',
    () => canWrapSelection(editor),
    [editor],
  )
  const propagationSeed = useValue(
    'systemsketch propagation focus seed',
    () => propagationSeedFromSelection(editor),
    [editor],
  )
  const propagationFocus = usePropagationFocus(editor)
  const runTidyEdges = () => {
    const outcome = tidyEdges(editor)
    addToast({ title: describeTidyEdgesOutcome(outcome), severity: 'info' })
  }
  const runResetRouting = () => {
    const outcome = resetEdgeRouting(editor)
    addToast({ title: describeResetEdgeRoutingOutcome(outcome), severity: 'info' })
  }
  const runOrganizeNodes = async () => {
    const outcome = await organizeNodes(editor)
    addToast({ title: describeOrganizeNodesOutcome(outcome), severity: 'info' })
  }
  const hasVisibleActions = hasCode
    || hasBranch
    || hasBehaviorTree
    || hasBlockMiniMenu
    || hasCode
    || hasAppearance
    // Arrange's z-order actions (send to back / bring to front, etc.) apply
    // to ANY non-empty selection, so once `canShow` is true there is always
    // something the pill can show — a selection with no appearance controls,
    // no Block actions and nothing to wrap no longer hides it.
    || canShow
    || canWrap
    || propagationSeed !== null
    || layoutActions.tidyEdges
    || layoutActions.resetRouting
    || layoutActions.organizeNodes
  if (!canShow || !hasVisibleActions) return null

  if (propagationFocus.seedId !== null) {
    return (
      <SelectionContextualMenu
        className="systemsketch-selection-menu systemsketch-selection-menu--focus"
        label="Propagation focus controls"
      >
        <PropagationFocusControls />
      </SelectionContextualMenu>
    )
  }

  /*
   * The Drag Model Tuner suppresses this pill (Zach, 2026-09-06: it "sits on
   * top of and obstructs the overlay marks/labels").
   *
   * The pill floats over the selection, and the selection during tuning IS
   * the region the overlay is drawing on — so the one dock that must be
   * legible and the one dock that covers it are always in the same place.
   * Suppressed rather than nudged aside: anywhere it moves is still over the
   * model. `return null` and not a fall-through, because the registry pill
   * would take the same spot and obstruct the same marks. Its Auto layout
   * switch is not lost — the tuner carries one, and so does the inspector
   * dock on the opposite side. Restored the instant the tuner closes;
   * nothing here is persisted.
   */
  if (hasBehaviorTree && dragModelTunerIsOpen) return null

  const surface = hasBehaviorTree
    ? 'behavior-tree-selection'
    : hasBranch ? 'branch-selection'
      : hasBlocks ? 'block-selection' : 'shape-selection'
  // Phase 2 ink-pass, V3 "Figma Segmented": arrange is its own trailing
  // segment, set off by a divider — but it is a sibling item outside
  // `AppearanceControls`'s own composition, so its divider is drawn here
  // rather than by `ContextualControls`'s between-group separator.
  const pillLayout = pillPresentation.compare ? pillPresentation.layout : 'default'
  const items = {
    'behavior-tree-actions': <EditorBehaviorTreeSelectionMiniMenu editor={editor} />,
    'branch-actions': <EditorBranchSelectionMiniMenu editor={editor} />,
    'block-actions': <EditorBlockSelectionMiniMenu key={selectionKey} editor={editor} />,
    appearance: <AppearanceControls />,
    opacity: <OpacityAdapter />,
    arrange: pillLayout === 'v3'
      ? (
          <>
            <span className="systemsketch-appearance__separator" aria-hidden="true" />
            <ArrangeAdapter />
          </>
        )
      : <ArrangeAdapter />,
    // Code contributes ONLY what is unique to it (line numbers, the character
    // width) into this same pill — its language and text size are already
    // ordinary appearance rows above. One menu, never a second floating surface.
    'code-actions': hasCode ? <EditorCodeSelectionMiniMenu editor={editor} /> : null,
    wrap: <WrapSelectionControl />,
    layout: (
      <SelectionLayoutActions
        {...layoutActions}
        onTidyEdges={runTidyEdges}
        onResetRouting={runResetRouting}
        onOrganizeNodes={() => void runOrganizeNodes()}
      />
    ),
    'propagation-focus': <PropagationFocusControls />,
  }

  return (
    <SelectionContextualMenu
      className="systemsketch-selection-menu"
      label="Selection actions"
    >
      <ContextualSurface surface={surface} items={items} />
    </SelectionContextualMenu>
  )
}

/** The title formatter occupies the selection pill while its text is live. */
function EditingBlockTitleMenu() {
  const editor = useEditor()
  const isEditingTitle = useValue(
    'systemsketch editing Block title menu',
    () => getEditingBlockTitle(editor) !== null,
    [editor],
  )
  if (!isEditingTitle) return null
  return (
    <SelectionContextualMenu
      className="systemsketch-selection-menu systemsketch-title-formatting-menu"
      label="Block title formatting"
    >
      <ContextualSurface
        surface="block-title-editing"
        items={{ 'title-formatting': <BlockTitleFormattingControls /> }}
      />
    </SelectionContextualMenu>
  )
}

export function SystemSketchSurfaceHost() {
  const editor = useEditor()
  const actions = useActions()
  const { addToast } = useToasts()
  const {
    leftSurface,
    rightSurface,
    toolbarSurface,
    setLeft,
    setRight,
    setToolbar,
  } = useChrome()
  // A Tree view auto-layout drag that lands somewhere illegal (a cycle, a
  // full decorator, a leaf) has nothing else to say so — the preview just
  // freezes at the last legal slot. `installBehaviorTreeRegions.ts` writes
  // the refusal onto an editor-scoped atom (never the document; see
  // `treeDragRefusal.ts`), and this is the one place in the React tree with
  // both `useToasts()` and a reason to watch every region's drags at once.
  const dragRefusal = useValue('behavior tree drag refusal', () => treeDragRefusalState.get(editor), [editor])
  const lastShownRefusalAt = useRef<number | null>(null)
  useEffect(() => {
    if (!dragRefusal || dragRefusal.at === lastShownRefusalAt.current) return
    lastShownRefusalAt.current = dragRefusal.at
    addToast({ title: `Can't move it there — ${dragRefusal.reason}`, severity: 'warning' })
  }, [dragRefusal, addToast])
  /**
   * What the dock is currently about, as one comparable string.
   *
   * `null` means "nothing the dock can speak about", which is now only an empty
   * selection: the pill no longer carries an Inspect button, so the dock has to
   * follow the selection by itself for EVERY subject, an ordinary rectangle
   * included. A button that only ever meant "show me the panel for what I
   * already selected" was a step the selection had already taken.
   */
  const blockInspectorContextKey = useValue(
    'systemsketch Block inspector context',
    () => {
      const branch = getOnlySelectedBranch(editor)
      if (branch) return `branch:${branch.id}`
      // A region is a subject of this dock exactly as a Branch is. Without
      // this line the Loop's panel existed but no ordinary gesture reached it:
      // the dock only auto-opens when this key changes, and a Loop selection
      // never changed it.
      const loop = getOnlySelectedLoop(editor)
      if (loop) return `loop:${loop.id}`
      const port = getOnlySelectedFloatingPort(editor)
      if (port) return `port:${port.id}`
      const tree = getSelectedBehaviorTree(editor)
      if (tree) return `behaviorTree:${tree.region.id}:${tree.path ?? ''}`
      const context = getBlockInspectorContext(editor)
      if (context.kind === 'selected') return context.shape.id
      if (context.kind === 'multi') return `multi:${context.styles.blockCount}`
      if (context.kind === 'tool') return 'tool:block'
      // Selecting a cable opens the dock too — it is the panel's other subject.
      const connection = getConnectionInspectorContext(editor)
      if (connection) return `connection:${connection.count}`
      // Any other selection is the shape lens. Keyed on the ids themselves so
      // moving from one rectangle to another is a new context, exactly as it is
      // for one Block to another.
      const selected = editor.getSelectedShapeIds()
      if (selected.length > 0) return `shape:${[...selected].sort().join(',')}`
      return null
    },
    [editor],
  )
  const previousBlockInspectorContextKey = useRef<string | null>(null)
  /**
   * The context the user last dismissed the dock on.
   *
   * Without this, closing the inspector was undone by the next click: the
   * auto-open effect fires whenever the context key changes, so selecting a
   * second Block re-opened the panel the user had just closed. Remembering the
   * dismissal makes the close stick for the rest of that run of selections;
   * clearing the selection (key `null`) or opening the dock by hand releases it.
   */
  const dismissedInspectorContextKey = useRef<string | null>(null)
  const inspectorSubject = useValue(
    'systemsketch inspector subject',
    () => readInspectorSubject(editor, {
      getOnlySelectedBranch,
      getOnlySelectedLoop,
      getOnlySelectedFloatingPort,
      getSelectedBehaviorTree,
      getBlockInspectorContextKind: (target) => getBlockInspectorContext(target).kind,
      getConnectionInspectorContext,
    }),
    [editor],
  )

  /** Closing the dock records the dismissal; opening it by hand clears one. */
  const closeRightSurface = useCallback(() => {
    if (rightSurface === 'inspector') {
      dismissedInspectorContextKey.current = blockInspectorContextKey ?? 'dismissed'
    }
    setRight(null)
  }, [blockInspectorContextKey, rightSurface, setRight])
  const openInspector = useCallback(() => {
    dismissedInspectorContextKey.current = null
    setRight('inspector')
  }, [setRight])

  const commandActions = useMemo<CommandPaletteAction[]>(() => {
    const stock = (id: string) => actions[id]?.onSelect('menu')
    return [
      {
        id: 'find-board',
        label: 'Find and replace on board',
        description: 'Search editable text across the entire board',
        keywords: ['search', 'replace'],
        shortcut: 'Ctrl F',
        icon: '⌕',
        keepOpen: true,
        run: () => setToolbar('find-replace'),
      },
      {
        id: 'insert-block',
        label: 'Insert Block',
        description: 'Switch to the semantic Block tool',
        keywords: ['node'],
        icon: '▣',
        run: () => editor.setCurrentTool(BLOCK_TOOL_ID),
      },
      {
        id: 'insert-branch',
        label: 'Insert Branch',
        description: 'Switch to the semantic Branch region tool',
        keywords: ['conditional', 'region'],
        icon: '⑂',
        run: () => editor.setCurrentTool(BRANCH_TOOL_ID),
      },
      {
        id: 'insert-pill',
        label: 'Insert Pill',
        description: 'Switch to the literal Value Pill tool',
        keywords: ['value', 'literal', 'variable'],
        icon: '＝',
        run: () => editor.setCurrentTool(PILL_TOOL_ID),
      },
      {
        id: 'insert-floating-port',
        label: 'Insert Port',
        description: 'Switch to the free, wireable Port primitive',
        keywords: ['port', 'input', 'output', 'connector'],
        icon: '◉',
        run: () => editor.setCurrentTool(FLOATING_PORT_TOOL_ID),
      },
      {
        id: 'insert-type',
        label: 'Insert Type',
        description: 'Switch to the compact Type definition tool',
        keywords: ['class', 'record', 'namedtuple', 'attribute', 'domain model'],
        icon: '{}',
        run: () => editor.setCurrentTool(TYPE_TOOL_ID),
      },
      {
        // Taking the lens off is a safety property, not a convenience. A diff
        // or lint `state` is something a projector said ABOUT a board, and a
        // person can always open that board, like it, and start editing — at
        // which moment the marks are lying to them. This is the one action
        // that ends that, so it must be reachable rather than only tested.
        id: 'clear-diff-marks',
        label: 'Clear diff marks',
        description: 'Remove every diff and lint mark, and the ghosts, from this board',
        keywords: ['diff', 'lint', 'lens', 'ghost', 'state'],
        icon: '⊘',
        run: () => clearDiffStates(editor),
      },
      {
        id: 'shape-library',
        label: 'Open Shapes library',
        description: 'Browse searchable shape families',
        keywords: ['insert'],
        icon: '◇',
        run: () => setLeft('shapes'),
      },
      {
        id: 'behavior-library',
        label: 'Open Behaviors library',
        description: 'Browse skills, conditions, controls and decorators',
        keywords: ['insert', 'behavior', 'behaviour', 'tree', 'skill'],
        icon: '⌥',
        run: () => setLeft('behaviors'),
      },
      {
        id: 'show-problems',
        label: 'Show board Problems',
        description: 'List diagnostics and navigate to affected objects',
        keywords: ['lint', 'diagnostics'],
        icon: '⚠',
        run: () => setRight('diagnostics'),
      },
      {
        id: 'show-variable-registry',
        label: 'Show Variables',
        description: 'Board-wide named variables any property’s expression can reference',
        keywords: ['variable', 'registry', 'global', 'parameter', 'expression'],
        icon: '◆',
        run: () => setRight('variable-registry'),
      },
      {
        id: 'show-inspector',
        label: 'Show inspector',
        description: 'Open the panel for the current selection',
        keywords: ['inspect', 'properties', 'dock'],
        icon: '▤',
        run: () => openInspector(),
      },
      {
        id: 'show-comments',
        label: 'Show comments',
        description: 'Review local discussions attached to this board',
        icon: '◌',
        run: () => setRight('comments'),
      },
      {
        id: 'tidy-edges',
        label: 'Tidy edges',
        description: 'Route automatic elbows around Blocks, then separate their channels',
        keywords: ['nudge', 'cables', 'connections', 'layout'],
        icon: '≋',
        disabled: () => !getSelectionLayoutActionAvailability(editor).tidyEdges,
        run: () => {
          const outcome = tidyEdges(editor)
          addToast({ title: describeTidyEdgesOutcome(outcome), severity: 'info' })
        },
      },
      {
        id: 'reset-routing',
        label: 'Reset routing to automatic',
        description: 'Clear hand-routed rails and bends on edges — including edges Tidy leaves alone',
        keywords: ['reset', 'arrows', 'cables', 'connections', 'hand-routed', 'authored', 'straighten', 'layout'],
        icon: '↺',
        disabled: () => !getSelectionLayoutActionAvailability(editor).resetRouting,
        run: () => {
          const outcome = resetEdgeRouting(editor)
          addToast({ title: describeResetEdgeRoutingOutcome(outcome), severity: 'info' })
        },
      },
      {
        id: 'adopt-pill-cable-type',
        label: 'Adopt connected pill type',
        description: 'Explicitly copy the selected pill’s inlet-cable type; wiring remains manual by default',
        keywords: ['pill', 'value', 'calculate', 'derive', 'wire', 'manual'],
        icon: '⇢',
        disabled: () => {
          const selected = getOnlySelectedBlock(editor)
          return selected === null || !canAdoptConnectedPillType(editor, selected.id)
        },
        run: () => {
          const selected = getOnlySelectedBlock(editor)
          if (!selected) return
          const result = adoptConnectedPillType(editor, selected.id)
          if (result.ok) addToast({ title: `Adopted ${result.type} from inlet cable`, severity: 'info' })
        },
      },
      {
        id: 'organize-nodes',
        label: 'Organize nodes',
        description: 'Arrange Blocks left to right while preserving model order',
        keywords: ['tidy', 'blocks', 'auto layout', 'elk'],
        icon: '▦',
        disabled: () => !getSelectionLayoutActionAvailability(editor).organizeNodes,
        run: async () => {
          const outcome = await organizeNodes(editor)
          addToast({ title: describeOrganizeNodesOutcome(outcome), severity: 'info' })
        },
      },
      {
        id: 'select-all',
        label: 'Select all',
        shortcut: 'Ctrl A',
        icon: '◎',
        run: () => stock('select-all'),
      },
      {
        id: 'undo',
        label: 'Undo',
        shortcut: 'Ctrl Z',
        icon: '↶',
        disabled: () => !editor.getCanUndo(),
        run: () => stock('undo'),
      },
      {
        id: 'redo',
        label: 'Redo',
        shortcut: 'Ctrl Shift Z',
        icon: '↷',
        disabled: () => !editor.getCanRedo(),
        run: () => stock('redo'),
      },
      {
        id: 'zoom-to-fit',
        label: 'Zoom to fit',
        description: 'Show the whole board',
        shortcut: 'Shift 1',
        icon: '⌗',
        run: () => stock('zoom-to-fit'),
      },
    ]
  }, [actions, addToast, editor, openInspector, setLeft, setRight, setToolbar])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return
      const key = event.key.toLowerCase()
      if (key !== 'p' && key !== 'k' && key !== 'f') return
      event.preventDefault()
      event.stopPropagation()
      setToolbar(key === 'f' ? 'find-replace' : 'commands')
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [setToolbar])

  useEffect(() => {
    // An empty selection ends the run the dismissal applied to.
    if (blockInspectorContextKey === null) dismissedInspectorContextKey.current = null
    if (
      blockInspectorContextKey
      && blockInspectorContextKey !== previousBlockInspectorContextKey.current
      && dismissedInspectorContextKey.current === null
      && rightSurface !== 'board-overview'
      && rightSurface !== 'diagnostics'
    ) {
      setRight('inspector')
    }
    previousBlockInspectorContextKey.current = blockInspectorContextKey
  }, [blockInspectorContextKey, rightSurface, setRight])

  const rightTitle = rightSurface === 'board-overview'
    ? 'Frames'
    : rightSurface === 'diagnostics'
      ? 'Problems'
    : rightSurface === 'variable-registry'
      ? 'Variables'
    : rightSurface === 'inspector'
      ? inspectorSubjectTitle(inspectorSubject)
      : 'Comments'

  return (
    <div className="systemsketch-surface-host" data-testid="systemsketch-surface-host">
      {/* The Behavior Tree's conditional second drag system (dnd-kit), inert
          until its claim protocol fires — see treeDndDrag.tsx for the scoped
          exception it implements. */}
      <BehaviorTreeDndDragHost />
      {/* The drag-model debug overlay's own layer. It lives HERE, not inside
          the region, because a region's projected nodes are real shapes and
          would paint over anything drawn in the region's SVG — see
          BtDragModelSurface.tsx. Off by default; renders nothing when off. */}
      <BtDragModelSurface />
      {/* Its dev cockpit: overlay layers, live tuning knobs, measured swap
          costs — opened from Dev → Behavior Tree → Drag Model Tuner. */}
      <BtDragModelTunerPanel />
      <CommunicationPrototypeControls />
      <CommunicationPortDndHost />
      <PropagationFocusDomLens />
      <RecorderIndicator />
      <TunnelLayerBar />
      <OnCanvasBlockPicker />
      <HitAreaOverlay />
      <PrimitiveSearch />
      {leftSurface ? (() => {
        // `files` is declared on LeftSurface but never set; treat anything that
        // is not the Behaviors surface as Shapes rather than rendering nothing.
        const surface = leftSurface === 'behaviors' ? 'behaviors' : 'shapes'
        const title = surface === 'behaviors' ? 'Behaviors' : 'Shapes'
        return (
          <aside
            id="systemsketch-left-popout"
            className="systemsketch-popout systemsketch-popout--left"
            aria-label={`${title} library`}
            data-testid="systemsketch-left-popout"
            data-left-surface={surface}
            data-systemsketch-chrome
            onWheel={(event) => event.stopPropagation()}
          >
            <header className="systemsketch-popout__header">
              <div><span>Library</span><h2>{title}</h2></div>
              <button type="button" aria-label={`Close ${title.toLowerCase()} library`} onClick={() => setLeft(null)}>×</button>
            </header>
            {/* WHY the switcher sits below the header rather than inside it:
                `systemsketch-chrome.css` styles EVERY `button` in
                `.systemsketch-popout__header` as a 30×30 icon square, which
                would squash a labelled tab into an unreadable chip. */}
            <div className="systemsketch-popout__surfaces" role="tablist" aria-label="Library surface">
              <button
                type="button"
                role="tab"
                aria-selected={surface === 'shapes'}
                data-testid="systemsketch-left-surface-shapes"
                onClick={() => setLeft('shapes')}
              >
                Shapes
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={surface === 'behaviors'}
                data-testid="systemsketch-left-surface-behaviors"
                onClick={() => setLeft('behaviors')}
              >
                Behaviors
              </button>
            </div>
            {surface === 'behaviors' ? <BehaviorTreeLibraryPanel /> : <ShapesLibrary />}
          </aside>
        )
      })() : null}

      {rightSurface ? (
        <aside
          id="systemsketch-right-popout"
          className="systemsketch-popout systemsketch-popout--right"
          aria-label={rightTitle}
          data-testid="systemsketch-right-popout"
          data-surface={rightSurface}
          data-inspector-subject={rightSurface === 'inspector' ? inspectorSubject : undefined}
          /* Which element draws the header, and the stylesheet obeys it rather
             than repeating the list. `body` means the panel below supplies its
             own title and close button; `frame` means it does not, and the
             dock's header stays. Before this the inspector hid the header for
             every subject, which left a cable, an ordinary shape and an empty
             selection in a headerless column with no pointer way out. */
          data-inspector-header={rightSurface === 'inspector'
            ? (inspectorSubjectOwnsHeader(inspectorSubject) ? 'body' : 'frame')
            : undefined}
          data-systemsketch-chrome
          onWheel={(event) => event.stopPropagation()}
        >
          <header className="systemsketch-popout__header">
            <div><span>Right panel</span><h2>{rightTitle}</h2></div>
            <button
              type="button"
              aria-label={`Close ${rightTitle}`}
              data-testid="systemsketch-right-popout-close"
              onClick={closeRightSurface}
            >×</button>
          </header>
          <RightSurfaceBody
            surface={rightSurface}
            subject={inspectorSubject}
            onClose={closeRightSurface}
          />
        </aside>
      ) : null}

      {toolbarSurface ? (
        <SystemSketchCommandPalette
          initialMode={toolbarSurface}
          actions={commandActions}
          onModeChange={setToolbar}
          onClose={() => setToolbar(null)}
        />
      ) : null}

      <EditingBlockTitleMenu />
      <SelectionMiniMenu />
      <BtRunOverlays />
      <CodeResizeIndicator />
      <PillPresentationChip />
    </div>
  )
}

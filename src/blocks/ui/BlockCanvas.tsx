/**
 * The mature pyblocks Block face, adapted to SystemSketch's direct `block`
 * shape. Layout and bindings still come from the current frame-backed model;
 * this module owns only the HTML paint and its small canvas interactions.
 */
import {
  useCallback,
  useMemo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  HTMLContainer,
  TldrawUiButton,
  TldrawUiButtonLabel,
  TldrawUiDropdownMenuContent,
  TldrawUiDropdownMenuGroup,
  TldrawUiDropdownMenuItem,
  TldrawUiDropdownMenuRoot,
  TldrawUiDropdownMenuTrigger,
  useEditor,
  useValue,
} from 'tldraw'

import {
  HEADER_ROW,
  blockIcon,
  blockDiffState,
  blockPortStateCounts,
  hasAnyBlockState,
  expandedSectionWeights,
  isAccessorName,
  isBlockShape,
  isUnknownText,
  portDefaultValue,
  portInHeader,
  portMutates,
  portRow,
  portDiffState,
  type BlockPortSide,
  type BlockShape,
  type BlockState,
} from '../blockModel'
import { resolveBlockPortSemanticRole, roleLabel } from '../connections/semanticRoles'
import { getSemanticTagsVisible } from '../semanticTagVisibility'
import { effectTethers } from '../effectTether'
import { BlockInlineEditor } from '../BlockInlineEditor'
import { valueBlockExactText, valueBlockInlet, valueBlockLabel, valueBlockOutlet } from '../valueBlock'
import { getBlockPortConnections } from '../connections/blockPorts'
import {
  blockInlineFieldAttribute,
  parseBlockInlineFieldAttribute,
  rememberBlockInlineField,
  requestBlockInlineEdit,
} from '../inlineBlockEditing'
import {
	layoutBlock,
	type BlockDivider,
	type BlockHiddenPortSummary,
	type BlockRect,
  type LaidOutBlockPort,
} from '../layoutBlock'
import { insertBlockPortForInlineEditing } from '../commands/blockCommands'
import {
  blockHeaderPortAddAffordance,
  blockPortAddAffordance,
  getBlockPortDrag,
  type BlockPortAddAffordance,
  type BlockPortDragState,
} from '../ports'
import { BlockIconGlyph } from './blockIcons'
import { getActiveDepthScopeId, toggleDepthScope } from '../../depth/depthNavigation'
import { branchFadeOpacity } from '../../branch/branchScope'
import { countProducers, PortDot, usePortHintEligibility } from './PortDot'
import { definitionBadge } from '../definitions/definitionLinking'
import { stockBlockVisibleDescription } from '../stockBlocks'
import {
  describeDiffCounts,
  diffGutterGlyph,
  diffPresentation,
  diffVariantTraits,
} from '../../diff/diffPresentation'
import {
  classifyPoseChange,
  describePoseChange,
  fieldDiffPath,
  findFieldDiff,
  mergeLegacyNameDiff,
  movedEdges,
  poseWantsLeader,
  type FieldDiff,
} from '../../diff/fieldDiff'
import { compactFormerValue, wordDiff, type DiffToken } from '../../diff/wordDiff'
import './block-canvas.css'

const SIMPLE_ICON_PX = 40
const HEADER_ICON_PX = 22

const boxStyle = (box: BlockRect): CSSProperties => ({
  position: 'absolute',
  left: box.x,
  top: box.y,
  width: box.w,
  height: box.h,
})

interface DrawnPort {
  placed: LaidOutBlockPort
  connected: boolean
  hasDefault: boolean
  /** Cables landing on this port as a sink — two or more earn a count badge. */
  producers: number
}

/** Draw coincident Simple anchors once while retaining their union of states. */
function portsToDraw(
  placedPorts: readonly LaidOutBlockPort[],
  connectedIds: ReadonlySet<string>,
  producerCounts: ReadonlyMap<string, number>,
): DrawnPort[] {
  const byPoint = new Map<string, DrawnPort>()
  for (const placed of placedPorts) {
    const key = `${Math.round(placed.x * 1000)}:${Math.round(placed.y * 1000)}`
    const connected = connectedIds.has(placed.port.id)
    const hasDefault = placed.side === 'input' && portDefaultValue(placed.port) !== ''
    const producers = producerCounts.get(placed.port.id) ?? 0
    const current = byPoint.get(key)
    if (current) {
      current.connected ||= connected
      current.hasDefault ||= hasDefault
      current.producers = Math.max(current.producers, producers)
      continue
    }
    byPoint.set(key, { placed, connected, hasDefault, producers })
  }
  return [...byPoint.values()]
}

function BlockPortDot({
  shape,
  port,
  dragOffset,
}: {
  shape: BlockShape
  port: DrawnPort
  dragOffset: number | null
}) {
	const { placed, connected, hasDefault, producers } = port
	const portId = placed.port.id
	const semanticRole = resolveBlockPortSemanticRole(placed.port)
	const editor = useEditor()
	const semanticTagsVisible = useValue(
		'block semantic tag visibility',
		() => getSemanticTagsVisible(editor),
		[editor],
	)
  const { hinting, eligible } = usePortHintEligibility(shape.id, portId)

  // No pointer handler here on purpose. The capture listener in
  // `installConnections.ts` is the ONE authority for a press on a dot: it lets
  // tldraw take the press first, so a selected cable's terminal handle — which
  // sits exactly on this dot — becomes a handle drag, and only a press tldraw
  // did not claim becomes a new cable. A synchronous transition from this
  // element would run before tldraw's own handler and take that choice away.
  const extraClasses = [
    placed.subtle ? 'Port_subtle' : '',
    hasDefault ? 'Port_default' : '',
    dragOffset !== null ? 'Port_dragging' : '',
    // The hook is read off the signature, so it shows before any cable exists.
    portMutates(placed.port) ? 'Port_mutates' : '',
    // An effect output leaves by the top edge: the call gave its value no name,
    // so there is no right-hand port for it to use.
    placed.edge === 'top' ? 'Port_effect' : '',
		placed.port.variadic ? 'Port_variadic' : '',
		placed.port.variadic ? `Port_variadic--${placed.port.variadic.kind}` : '',
		placed.port.variadic?.bundled ? 'Port_variadic--bundled' : '',
		semanticTagsVisible && semanticRole.role !== 'data' ? `Port_semantic--${semanticRole.role}` : '',
  ].filter(Boolean).join(' ')
  // A ghost row is a port the target asserts and this board does not have. It
  // keeps its dot so a missing cable has somewhere to land, in the row it is
  // missing from — the whole reason a port carries a state at all.
  const diffState = portDiffState(placed.port)

  // A header dot carries no label, so its name rides the tooltip instead.
  const inHeader = placed.side === 'input' && portInHeader(placed.port)
  return (
    <PortDot
      portId={portId}
      side={placed.side}
      connected={connected}
      producers={producers}
      portType={placed.port.type}
      x={placed.x}
      y={placed.y}
      hinting={hinting}
      eligible={eligible}
		semanticLabel={semanticTagsVisible && semanticRole.role !== 'data' ? roleLabel(semanticRole.role) : undefined}
      className={extraClasses}
		title={[
			inHeader && !placed.subtle ? placed.port.name : '',
			semanticTagsVisible && semanticRole.role !== 'data' ? `${semanticRole.role} port${semanticRole.origin === 'derived' ? ' (derived)' : ''}` : '',
		].filter(Boolean).join(' · ') || undefined}
      attrs={{
        'data-block-port-edge': placed.edge,
        'data-block-port-row': String(portRow(placed.port)),
		'data-block-port-mutates': portMutates(placed.port) ? 'true' : undefined,
		'data-semantic-role': semanticTagsVisible && semanticRole.role !== 'data' ? semanticRole.role : undefined,
			'data-variadic-group': placed.port.variadic?.groupId,
			'data-variadic-bundled': placed.port.variadic?.bundled ? 'true' : undefined,
        'data-diff-state': diffState === 'normal' ? undefined : diffState,
      }}
      style={{
        // An effect port is not a value of its type leaving by a named port —
        // it is the mutation itself, so it wears the effect ink. Set here,
        // not in the stylesheet, because this inline variable would otherwise
        // win over any class rule.
        ...(placed.edge === 'top' ? { '--port-color': 'var(--ss-warning)' } as CSSProperties : null),
        ...(dragOffset !== null
          ? { transform: `translate(-50%, -50%) translateY(${dragOffset}px)` }
          : null),
      }}
    />
  )
}

/** A divider keeps the pair's total weight and never squeezes either section below its layout floor. */
function ExpandedDividerHandle({
  shape,
  divider,
}: {
  shape: BlockShape
  divider: BlockDivider
}) {
  const editor = useEditor()
  const adjust = divider.adjust
  if (!adjust) return null

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.stopPropagation()
    event.preventDefault()
    const {
      prevKey,
      nextKey,
      prevWeight,
      nextWeight,
      rangeTop,
      rangeBottom,
      prevMin,
      nextMin,
    } = adjust
    const pairWeight = prevWeight + nextWeight
    const range = rangeBottom - rangeTop
    if (range <= prevMin + nextMin || pairWeight <= 0) return

    editor.markHistoryStoppingPoint('adjust expanded section')
    const zoom = editor.getZoomLevel()
    const startClientY = event.clientY
    const startY = divider.y
    const ownerDocument = event.currentTarget.ownerDocument

    const onMove = (move: PointerEvent) => {
      const y = Math.min(
        rangeBottom - nextMin,
        Math.max(rangeTop + prevMin, startY + (move.clientY - startClientY) / zoom),
      )
      const previous = (pairWeight * (y - rangeTop)) / range
      const fresh = editor.getShape(shape.id)
      if (!isBlockShape(fresh)) return
      editor.updateShape<BlockShape>({
        id: fresh.id,
        type: fresh.type,
        props: {
          expandedWeights: {
            ...expandedSectionWeights(fresh.props),
            [prevKey]: previous,
            [nextKey]: pairWeight - previous,
          },
        },
      })
    }

    const onUp = () => {
      ownerDocument.removeEventListener('pointermove', onMove)
      ownerDocument.removeEventListener('pointerup', onUp)
      ownerDocument.removeEventListener('pointercancel', onUp)
    }
    ownerDocument.addEventListener('pointermove', onMove)
    ownerDocument.addEventListener('pointerup', onUp)
    ownerDocument.addEventListener('pointercancel', onUp)
  }

  return (
    <div
      className="BlockNode-dividerHandle"
      style={{ left: divider.x, top: divider.y - 4.5, width: divider.w }}
      onPointerDown={onPointerDown}
    />
  )
}

function BlockFooterMenu({ shape }: { shape: BlockShape }) {
  const editor = useEditor()
  const activeDepthScopeId = useValue(
    'SystemSketch Block footer depth action',
    () => getActiveDepthScopeId(editor),
    [editor],
  )
  const duplicate = useCallback(() => {
    editor.markHistoryStoppingPoint('duplicate block')
    editor.duplicateShapes([shape.id])
  }, [editor, shape.id])

  return (
    <div className="NodeFooterMenu" onPointerDown={(event) => event.stopPropagation()}>
      <TldrawUiDropdownMenuRoot id={`block-menu-${shape.id}`}>
        <TldrawUiDropdownMenuTrigger>
          <TldrawUiButton
            type="icon"
            title="More options"
            className="NodeFooterMenu-trigger"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <circle cx="6" cy="2" r="1.2" fill="currentColor" />
              <circle cx="6" cy="6" r="1.2" fill="currentColor" />
              <circle cx="6" cy="10" r="1.2" fill="currentColor" />
            </svg>
          </TldrawUiButton>
        </TldrawUiDropdownMenuTrigger>
        <TldrawUiDropdownMenuContent side="top" align="end" sideOffset={4}>
          <TldrawUiDropdownMenuGroup>
            {shape.props.view === 'expanded' ? (
              <TldrawUiDropdownMenuItem>
                <TldrawUiButton
                  type="menu"
                  onClick={() => void toggleDepthScope(editor, shape.id)}
                >
                  <TldrawUiButtonLabel>
                    {activeDepthScopeId === shape.id ? 'Step out' : 'Step into'}
                  </TldrawUiButtonLabel>
                </TldrawUiButton>
              </TldrawUiDropdownMenuItem>
            ) : null}
            <TldrawUiDropdownMenuItem>
              <TldrawUiButton type="menu" onClick={duplicate}>
                <TldrawUiButtonLabel>Duplicate</TldrawUiButtonLabel>
              </TldrawUiButton>
            </TldrawUiDropdownMenuItem>
          </TldrawUiDropdownMenuGroup>
        </TldrawUiDropdownMenuContent>
      </TldrawUiDropdownMenuRoot>
    </div>
  )
}

/**
 * The capsule: `= 2.0`, or `gain = 2.0` once named. The literal is the Block's
 * title and the name is its ports' name, so both are ordinary inline fields.
 * While unnamed, the `=` itself carries the name field — that is the click
 * that names a literal — and a folded literal keeps its full text in the
 * capsule's tooltip. A cable on the inlet is deliberately only a relationship:
 * the face remains editable and keeps showing what its author wrote.
 */
function ValueFace({
  shape,
  connectedIds,
  editing,
}: {
  shape: BlockShape
  connectedIds: ReadonlySet<string>
  editing: boolean
}) {
  const layout = layoutBlock(shape.props)
  const label = valueBlockLabel(shape.props)
  const outlet = valueBlockOutlet(shape.props)
  const inlet = valueBlockInlet(shape.props)
  const inletConnected = inlet !== null && connectedIds.has(inlet.id)
  const nameField = outlet
    ? blockInlineFieldAttribute({ kind: 'portName', side: 'outputs', portId: outlet.id })
    : undefined
  const typeField = outlet
    ? blockInlineFieldAttribute({ kind: 'portType', side: 'outputs', portId: outlet.id })
    : undefined
  const tooltip = [valueBlockExactText(label)]
  if (label.folded) tooltip.push('The capsule abbreviates this literal as …')
  if (inletConnected) tooltip.push('Connected on the inlet — this pill remains manual.')
  return layout.title ? (
    <div
      className="BlockNode-value"
      style={boxStyle(layout.title)}
      title={tooltip.join('\n')}
      data-testid="block-value"
      data-inline-editing={editing ? 'true' : undefined}
    >
      {label.name !== '' ? (
        <span className="BlockNode-valueDeclaration">
          <span
            className="BlockNode-valueName"
            data-pb-inline-field={nameField}
            data-testid="block-value-name"
          >
            {label.name}
          </span>
          {label.type !== '' ? (
            <>
              <span className="BlockNode-valueColon" data-pb-inline-field={nameField}>:</span>{' '}
              <span
                className="BlockNode-valueType"
                data-pb-inline-field={typeField}
                data-testid="block-value-type"
              >
                {label.type}
              </span>
            </>
          ) : null}
        </span>
      ) : null}
      <span
        className="BlockNode-valueEquals"
        data-pb-inline-field={label.name === '' ? nameField : undefined}
        title={label.name === '' ? 'Name this value' : undefined}
      >
        =
      </span>
      <span
        className="BlockNode-valueText"
        data-pb-inline-field={blockInlineFieldAttribute({ kind: 'title' })}
        data-testid="block-value-text"
      >
        {label.display}
      </span>
    </div>
  ) : null
}

/**
 * One field's former value and its current one, in the same bar.
 *
 * The markup is the same for every variant on purpose. `was-now` fills the two
 * chips, `token-only` drops the chip backgrounds and the arrow and leaves only
 * the changed runs inked, `stacked` turns the row into two lines, and
 * `delta-badge` hides the former value entirely — all of it in the stylesheet,
 * keyed off `data-diff-variant` on the card. That is what makes switching the
 * paint a repaint rather than a re-render, and it is why no variant can quietly
 * disagree with another about which runs of the string actually differ.
 *
 * The word-level marking is GitHub's mechanism, and it is the reason this is
 * legible at all: filling the whole former value red says "all of this is
 * wrong", which for `run_inference` → `run_predict` is a lie about six of the
 * thirteen characters.
 */
function WasNowTokens({ tokens, side }: { tokens: readonly DiffToken[]; side: 'was' | 'now' }) {
  return (
    <>
      {tokens.map((token, index) => (
        <span
          key={`${side}-${index}`}
          className="BlockNode-wasNowTok"
          data-tok={token.kind === 'same' ? undefined : token.kind}
        >
          {token.text}
        </span>
      ))}
    </>
  )
}

function WasNow({ diff }: { diff: FieldDiff }) {
  // Read before any early return, so the hook order never depends on whether
  // this particular field turned out to differ.
  const variant = useValue('diff variant', () => diffPresentation.get().variant, [])
  const words = wordDiff(diff.before, diff.after)
  const path = fieldDiffPath(diff.path)
  if (!words.changed) return <>{diff.after}</>
  // `stacked` gives each value a line of its own and can afford to print the
  // former value whole. Every other variant shares one fixed-pitch row with the
  // current value, where the runs the two have in common are redundant — they
  // are legible an inch to the right — and printing them anyway is what made
  // the title, the description and the port name overflow.
  const former = diffVariantTraits(variant).text === 'stacked'
    ? words.before
    : compactFormerValue(words.before)
  return (
    <span
      className="BlockNode-wasNow"
      data-diff-field={path}
      data-testid={`was-now-${path}`}
      // Both complete values remain available when the compact comparison
      // abbreviates its former side for geometry.
      title={`was ${diff.before}\nnow ${diff.after}`}
    >
      {/*
        Absent when nothing was taken away. A purely additive change —
        `Estimator` → `PoseEstimator` — has no former value worth a chip, and
        drawing a red one would claim a loss that never happened.
      */}
      {former.length > 0 ? (
        <>
          <span className="BlockNode-wasNowWas" data-testid={`was-${path}`}>
            <WasNowTokens tokens={former} side="was" />
          </span>
          {/*
            A real sibling rather than a `::after` on the former value. This was
            a round-1 bug worth not reintroducing: `text-decoration` propagates
            into inline descendants and a child cannot switch it off, so an
            arrow drawn inside the struck span is itself struck, and
            `callee → callable` renders as `callee ⇒`.
          */}
          <span className="BlockNode-wasNowArrow" aria-hidden="true">→</span>
        </>
      ) : null}
      <span className="BlockNode-wasNowNow" data-testid={`now-${path}`}>
        <WasNowTokens tokens={words.after} side="now" />
      </span>
    </span>
  )
}

/**
 * A field, drawn as itself or as a pair. Every text field on the card goes
 * through here, which is the coverage the reviewer asked for: a title, a
 * description, a blockType, a port's name and a port's type all get the same
 * treatment because they all ask the same question.
 */
function FieldValue({
  diffs,
  path,
  value,
}: {
  diffs: readonly FieldDiff[] | undefined
  path: string
  value: string
}) {
  const diff = findFieldDiff(diffs, path)
  // No pair means no lens on this field, and the markup stays exactly what it
  // was before the vocabulary existed — which is what keeps a calm board calm.
  if (!diff) return <>{value}</>
  return <WasNow diff={diff} />
}

/**
 * Where the Block used to be, and how big it used to be.
 *
 * Position and size are the two dimensions the code-diff paradigm has no answer
 * for — there is no text to tokenize — and no node-diagram tool ships a
 * convention to borrow. So this is drawn from the geometry itself: a dashed
 * outline at the former pose, joined to the live card by a leader when the
 * centre actually travelled.
 *
 * The two readings fall out of the drawing rather than out of a legend. A pure
 * move gives a congruent outline somewhere else, with a leader. A pure resize
 * gives an outline of a different size in about the same place, no leader, and
 * the edges that actually moved drawn heavier. A card that did both says both.
 *
 * Round 1 shipped `moved-ghost` as evidence for NOT drawing this, on the
 * grounds that a generator which relays out a board moves everything and the
 * churn is unreadable. That was true of tinting the cards; it is not true of an
 * outline, whose ink is one thin rectangle per moved Block rather than a wash
 * over the whole card, and which sits OUTSIDE the face so it never competes
 * with the content marks for the same pixels.
 */
function BlockPoseGhost({ shape }: { shape: BlockShape }) {
  const prior = shape.props.priorPose
  if (!prior) return null
  const change = classifyPoseChange(prior, {
    x: shape.x,
    y: shape.y,
    w: shape.props.w,
    h: shape.props.h,
  })
  if (change.kind === 'none') return null

  // Local coordinates: the card's own origin is (0, 0), and the ghost sits
  // wherever the before board put it. `overflow: visible` on the shape
  // container is what lets this draw outside the card without a second seam.
  const ghostX = prior.x - shape.x
  const ghostY = prior.y - shape.y
  const minX = Math.min(ghostX, 0)
  const minY = Math.min(ghostY, 0)
  const maxX = Math.max(ghostX + prior.w, shape.props.w)
  const maxY = Math.max(ghostY + prior.h, shape.props.h)
  const ox = -minX
  const oy = -minY
  const edges = movedEdges(change)
  const leader = poseWantsLeader(change)
    ? {
        x1: ghostX + prior.w / 2 + ox,
        y1: ghostY + prior.h / 2 + oy,
        x2: shape.props.w / 2 + ox,
        y2: shape.props.h / 2 + oy,
      }
    : null

  const edgeLine = (edge: 'left' | 'right' | 'top' | 'bottom') => {
    const left = ghostX + ox
    const top = ghostY + oy
    if (edge === 'left') return { x1: left, y1: top, x2: left, y2: top + prior.h }
    if (edge === 'right') return { x1: left + prior.w, y1: top, x2: left + prior.w, y2: top + prior.h }
    if (edge === 'top') return { x1: left, y1: top, x2: left + prior.w, y2: top }
    return { x1: left, y1: top + prior.h, x2: left + prior.w, y2: top + prior.h }
  }

  return (
    <div
      className="BlockNode-poseGhost"
      data-pose-change={change.kind}
      data-testid={`pose-ghost-${shape.id.replace('shape:', '')}`}
      aria-hidden="true"
      style={{ left: minX, top: minY, width: maxX - minX, height: maxY - minY }}
    >
      <svg width={maxX - minX} height={maxY - minY} overflow="visible">
        {leader ? (
          <line
            className="BlockNode-poseLeader"
            x1={leader.x1}
            y1={leader.y1}
            x2={leader.x2}
            y2={leader.y2}
          />
        ) : null}
        <rect
          className="BlockNode-poseOutline"
          x={ghostX + ox}
          y={ghostY + oy}
          width={prior.w}
          height={prior.h}
          rx={8}
        />
        {edges.map((edge) => {
          const line = edgeLine(edge)
          return (
            <line
              key={edge}
              className="BlockNode-poseEdge"
              data-edge={edge}
              x1={line.x1}
              y1={line.y1}
              x2={line.x2}
              y2={line.y2}
            />
          )
        })}
      </svg>
      <span
        className="BlockNode-poseBadge"
        data-testid={`pose-badge-${shape.id.replace('shape:', '')}`}
        style={{ left: ghostX + ox, top: ghostY + oy }}
      >
        {describePoseChange(change)}
      </span>
    </div>
  )
}

function SimpleFace({ shape }: { shape: BlockShape }) {
  const layout = layoutBlock(shape.props)
  const icon = blockIcon(shape.props)
  return (
    <>
      {layout.title ? (
        <div
          className="BlockNode-simpleTitle"
          style={boxStyle(layout.title)}
          data-pb-inline-field={blockInlineFieldAttribute({ kind: 'title' })}
        >
          {icon !== '' ? (
            <span
              className="BlockNode-simpleIcon"
              data-pb-inline-field={blockInlineFieldAttribute({ kind: 'icon' })}
            >
              <BlockIconGlyph name={icon} size={SIMPLE_ICON_PX} />
            </span>
          ) : null}
          <span
            className="BlockNode-simpleTitleText"
            data-pb-inline-field={blockInlineFieldAttribute({ kind: 'title' })}
            title={shape.props.title}
          >
            <FieldValue diffs={shape.props.fieldDiffs} path="title" value={shape.props.title} />
          </span>
        </div>
      ) : null}
      {layout.description ? (
        <div
          className="BlockNode-simpleDescription"
          style={boxStyle(layout.description)}
          data-pb-inline-field={blockInlineFieldAttribute({ kind: 'description' })}
          title={stockBlockVisibleDescription(shape.props)}
        >
          <FieldValue diffs={shape.props.fieldDiffs} path="description" value={stockBlockVisibleDescription(shape.props)} />
        </div>
      ) : null}
      {layout.typeLabel ? (
        <div
          className="BlockNode-simpleType"
          style={boxStyle(layout.typeLabel)}
          data-pb-inline-field={blockInlineFieldAttribute({ kind: 'blockType' })}
          title={shape.props.blockType}
        >
          <FieldValue diffs={shape.props.fieldDiffs} path="blockType" value={shape.props.blockType} />
        </div>
      ) : null}
    </>
  )
}

/**
 * What this Block's rows are saying, in the nouns a person uses.
 *
 * `+2 −1` on the heading, and the long form in the tooltip. This is the
 * per-Block half of "the headline counts blocks, ports and cables": a reader
 * who never opens an inspector should still be able to tell a card with two
 * missing ports from a card that merely moved.
 */
function BlockDiffBadge({ shape }: { shape: BlockShape }) {
  const counts = blockPortStateCounts(shape.props)
  const state = blockDiffState(shape.props)
  const parts = [
    counts.added ? `+${counts.added}` : '',
    counts.removed ? `−${counts.removed}` : '',
    counts.changed ? `~${counts.changed}` : '',
  ].filter(Boolean)
  if (parts.length === 0 && state === 'normal') return null
  const label = parts.length > 0 ? parts.join(' ') : diffGutterGlyph(state)
  if (label === '') return null
  return (
    <span
      className="BlockNode-diffBadge"
      data-diff-state={state === 'normal' ? 'changed' : state}
      data-testid={`block-diff-badge-${shape.id.replace('shape:', '')}`}
      title={describeDiffCounts(counts) || state}
    >
      {label}
    </span>
  )
}

/**
 * The change rail: one segment per stated row, at that row's own y.
 *
 * This is the only mark whose ink is proportional to the number of changed
 * ROWS rather than to the area of the changed cards. A tint has to cover a
 * whole Block to say one port is missing, so six changed Blocks tint half the
 * board; six rail segments are six 3px marks. That is the entire reason the
 * rail survives the density the tinted card does not.
 *
 * It reads `layout.ports` — the same laid-out rows the labels are drawn from —
 * so a segment cannot drift out of step with the row it is reporting on.
 */
function BlockDiffRail({ ports }: { ports: readonly LaidOutBlockPort[] }) {
  const segments = ports.flatMap((placed) => {
    if (!placed.label) return []
    const state = portDiffState(placed.port)
    if (state === 'normal') return []
    return [{ id: `${placed.side}:${placed.port.id}`, state, y: placed.label.y, h: placed.label.h }]
  })
  if (segments.length === 0) return null
  return (
    <div className="BlockNode-diffRail" aria-hidden="true" data-testid="block-diff-rail">
      {segments.map((segment) => (
        <span
          key={segment.id}
          className="BlockNode-diffRailMark"
          data-diff-state={segment.state}
          style={{ top: `${segment.y}px`, height: `${segment.h}px` }}
        />
      ))}
    </div>
  )
}

/**
 * V5 decoration is deliberately derived from ordinary input ports. The model
 * does not gain a collector, tray, or synthetic endpoint: each cable still
 * lands on its own honest source expression, while this quiet rail says which
 * ports share the callee's `*args` or `**kwargs` formal.
 */
function VariadicRuns({ ports }: { ports: readonly LaidOutBlockPort[] }) {
	type Run = { groupId: string; members: LaidOutBlockPort[] }
	const runs: Run[] = []
	for (const placed of ports) {
		if (placed.side !== 'input' || !placed.port.variadic || placed.subtle) continue
		const previous = runs.at(-1)
		if (previous?.groupId === placed.port.variadic.groupId) previous.members.push(placed)
		else runs.push({ groupId: placed.port.variadic.groupId, members: [placed] })
	}
	return (
		<>
			{runs.map((run) => {
				const first = run.members[0]
				const variadic = first?.port.variadic
				if (!first || !variadic) return null
				const top = Math.min(...run.members.map((member) => member.y)) - 8
				const bottom = Math.max(...run.members.map((member) => member.y)) + 8
				const type = run.members.every((member) => member.port.type === first.port.type)
					? first.port.type : ''
				return (
					<div
						key={`${run.groupId}:${first.port.id}`}
						className={`BlockNode-variadicRun BlockNode-variadicRun--${variadic.kind}`}
						data-testid={`variadic-run-${first.port.id}`}
						data-variadic-group={run.groupId}
						data-variadic-members={run.members.length}
						style={{ top, height: bottom - top }}
						aria-label={`${variadic.label}: ${run.members.length} call expression${run.members.length === 1 ? '' : 's'}`}
					>
						<span className="BlockNode-variadicBracket" aria-hidden="true" />
						<span className="BlockNode-variadicLabel">
							{variadic.label}
							{type !== '' ? <span className="BlockNode-variadicType">{type}</span> : null}
						</span>
					</div>
				)
			})}
		</>
	)
}

function DefinitionBadge({ shape }: { shape: BlockShape }) {
  const badge = definitionBadge(shape.props)
  return badge ? (
    <span className="BlockNode-definitionBadge" data-testid="block-definition-badge">
      {badge}
    </span>
  ) : null
}

function BlockHeading({ shape, height }: { shape: BlockShape; height: number }) {
  const icon = blockIcon(shape.props)
  return (
    <div className="NodeShape-heading" style={{ height }}>
      <div className="BlockNode-heading">
        {icon !== '' ? (
          <span
            className="BlockNode-headingIcon"
            data-pb-inline-field={blockInlineFieldAttribute({ kind: 'icon' })}
          >
            <BlockIconGlyph name={icon} size={HEADER_ICON_PX} />
          </span>
        ) : null}
        <span
          className="BlockNode-headingTitle"
          data-pb-inline-field={blockInlineFieldAttribute({ kind: 'title' })}
          title={shape.props.title}
        >
          <FieldValue diffs={shape.props.fieldDiffs} path="title" value={shape.props.title} />
        </span>
        <DefinitionBadge shape={shape} />
        <BlockDiffBadge shape={shape} />
        {shape.props.blockType !== '' ? (
          <span
            className="BlockNode-headingType"
            data-pb-inline-field={blockInlineFieldAttribute({ kind: 'blockType' })}
            title={shape.props.blockType}
          >
            <FieldValue diffs={shape.props.fieldDiffs} path="blockType" value={shape.props.blockType} />
          </span>
        ) : null}
      </div>
    </div>
  )
}

function PortLabels({
  ports,
  drag,
  connectedIds,
}: {
  ports: readonly LaidOutBlockPort[]
  drag: BlockPortDragState | null
  /** A wired input dims its definition-default chip: the cable overrides it. */
  connectedIds: ReadonlySet<string>
}) {
  return (
    <>
      {ports.map((placed) => {
        if (!placed.label) return null
			// One DEF-owned label per run. The individual source expressions are
			// still explicit as cable endpoints, just not redundantly named here.
			if (placed.side === 'input' && placed.port.variadic) return null
        const held = Boolean(
          drag
          && drag.portId === placed.port.id
          && drag.side === (placed.side === 'input' ? 'inputs' : 'outputs'),
        )
        const defaultValue = placed.side === 'input' ? portDefaultValue(placed.port) : ''
        // Both of the row's text fields, as pairs. Round 1 could only ever
        // speak for the name, via a single `stateBefore` string, which is read
        // here as the name pair it always was so no board already written loses
        // its rename.
        const portDiffs = mergeLegacyNameDiff(
          placed.port.fieldDiffs,
          placed.port.stateBefore,
          placed.port.name,
        )
        // `?` is the app's one token for "we looked and cannot tell", and it
        // must not read like an ordinary name or type: a reader who cannot see
        // the difference between a resolved row and an unresolved one is being
        // told something false at a glance.
        const nameClasses = [
          'BlockNode-portName',
          defaultValue !== '' ? 'BlockNode-portName--default' : '',
          isUnknownText(placed.port.name) ? 'BlockNode-portName--unknown' : '',
          isAccessorName(placed.port.name) ? 'BlockNode-portName--accessor' : '',
        ].filter(Boolean).join(' ')
        const name = (
          <span
            className={nameClasses}
            title={defaultValue !== ''
              ? `${placed.port.name}\ndefault = ${defaultValue}`
              : placed.port.name || undefined}
            data-pb-inline-field={blockInlineFieldAttribute({
              kind: 'portName',
              side: placed.side === 'input' ? 'inputs' : 'outputs',
              portId: placed.port.id,
            })}
          >
            <FieldValue diffs={portDiffs} path="name" value={placed.port.name} />
          </span>
        )
        const type = placed.port.type ? (
          <span
            className={isUnknownText(placed.port.type)
              ? 'BlockNode-portType BlockNode-portType--unknown'
              : 'BlockNode-portType'}
            title={placed.port.type}
            data-pb-inline-field={blockInlineFieldAttribute({
              kind: 'portType',
              side: placed.side === 'input' ? 'inputs' : 'outputs',
              portId: placed.port.id,
            })}
          >
            <FieldValue diffs={portDiffs} path="type" value={placed.port.type} />
          </span>
        ) : null
        const overridden = connectedIds.has(placed.port.id)
        const chip = defaultValue !== '' ? (
          <span
            className={overridden
              ? 'BlockNode-portDefault BlockNode-portDefault--overridden'
              : 'BlockNode-portDefault'}
            title={overridden ? `default = ${defaultValue}, overridden by the cable` : `= ${defaultValue}`}
          >
            = {defaultValue}
          </span>
        ) : null

        // The lens paints the ROW, not a label beside it: a port that is
        // missing keeps its slot so the cable that wanted it has somewhere to
        // land, and a port that was renamed says so inside its own name span
        // rather than growing a second element beside it.
        const diffState = portDiffState(placed.port)
        const gutter = diffGutterGlyph(diffState)

        return (
          <div
            key={`${placed.side}:${placed.port.id}`}
            className={[
              'BlockNode-portLabel',
              placed.side === 'input' ? 'BlockNode-portLabel--in' : 'BlockNode-portLabel--out',
              held ? 'BlockNode-portLabel--dragging' : '',
            ].filter(Boolean).join(' ')}
            data-diff-state={diffState === 'normal' ? undefined : diffState}
            data-testid={diffState === 'normal' ? undefined : `port-state-${placed.port.id}`}
            style={{
              ...boxStyle(placed.label),
              ...(held && drag ? { transform: `translateY(${drag.pointerY - placed.y}px)` } : null),
            }}
          >
            {gutter ? (
              <span className="BlockNode-portGutter" aria-hidden="true">{gutter}</span>
            ) : null}
            {placed.side === 'output' ? type : null}
            {name}
            {placed.side === 'input' ? type : null}
            {chip}
          </div>
        )
      })}
    </>
  )
}

/**
 * The face can omit individual ports without concealing the size of the
 * callable contract. This reads layout's projection of the stored flags, so
 * the count cannot drift into a second persisted display state.
 */
function HiddenPortSummaries({ summaries }: { summaries: readonly BlockHiddenPortSummary[] }) {
	return (
		<>
			{summaries.map((summary) => {
				const noun = `${summary.side} port${summary.count === 1 ? '' : 's'}`
				return (
					<span
						key={summary.side}
						className={`BlockNode-hiddenPorts BlockNode-hiddenPorts--${summary.side}`}
						data-testid={`block-hidden-${summary.side}-ports`}
						data-hidden-port-count={summary.count}
						style={boxStyle(summary.box)}
						aria-label={`${summary.count} hidden ${noun}`}
						title={`${summary.count} hidden ${noun} — manage ports in the inspector to show them`}
					>
						+{summary.count} more
					</span>
				)
			})}
		</>
	)
}

/**
 * The table-style "add one more" affordance, borrowed wholesale from a
 * spreadsheet's end-of-list gutter: hover the empty space under a lane and the
 * next row offers itself. Two of these exist per Block — inputs own the left
 * edge, outputs the right — which is what makes a single gesture unambiguous
 * about which lane it means.
 *
 * Strip and bead both sit on their lane's edge, in the column the dots occupy,
 * so the bead reads as the next port rather than as a button near one. The
 * dots keep the gesture: they paint above the strip, so a press on a real port
 * still starts a cable.
 */
function PortAddAffordance({
  shape,
  side,
  affordance,
  header = false,
}: {
  shape: BlockShape
  side: BlockPortSide
  affordance: BlockPortAddAffordance
  /** The heading's own gutter: the port is born in row 0. */
  header?: boolean
}) {
  const editor = useEditor()
  const lane = side === 'inputs' ? 'input' : 'output'
  const where = header ? 'header' : side

  const addPort = useCallback(() => {
    const result = insertBlockPortForInlineEditing(
      editor,
      shape.id,
      side,
      Number.MAX_SAFE_INTEGER,
      header ? { section: { row: HEADER_ROW, branch: 0 } } : {},
    )
    if (!result.ok) return
    requestBlockInlineEdit(editor, shape.id, { kind: 'portName', side, portId: result.port.id })
  }, [editor, header, shape.id, side])

  return (
    <div className={`BlockNode-portAdd BlockNode-portAdd--${header ? 'header' : lane}`}>
      <div
        className="BlockNode-portAddZone"
        data-testid={`block-port-add-zone-${where}`}
        style={boxStyle(affordance.zone)}
      />
      {/*
        The bead is named for the Block it belongs to. The docked inspector has
        its own "Add output port" button, and two live controls answering to one
        accessible name read as the same control repeated on a screen reader.
      */}
      <div
        role="button"
		aria-label={`Add ${header ? 'header' : lane} port to ${shape.props.title === '' ? 'this Block' : shape.props.title} on canvas`}
        title={header ? 'Add header port' : `Add ${lane} port`}
        className="BlockNode-portAddBead"
        data-testid={`block-port-add-${where}`}
        style={{ left: affordance.x, top: affordance.y }}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={addPort}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          {/* 2px matches the selection line that lands on the vertical stroke,
              so the crossing reads as one continuous stroke, not a seam. */}
          <path d="M6 2.4v7.2M2.4 6h7.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}

/** The held row's grip and the rule marking where releasing would drop it. */
function PortDragOverlay({
  drag,
  width,
}: {
  drag: BlockPortDragState
  width: number
}) {
  const inputs = drag.side === 'inputs'
  const { drop } = drag
  return (
    <>
      {/* The band the port would join is tinted, so crossing a line reads as
          arriving somewhere, not merely as a rule that moved. */}
      <div
        className={`BlockNode-portDropBand${drop.row === HEADER_ROW ? ' BlockNode-portDropBand--header' : ''}`}
        data-testid="block-port-drop-band"
        data-drop-row={drop.row}
        data-drop-branch={drop.branch}
        style={{
          left: inputs ? 0 : width / 2,
          top: drop.band.top,
          width: width / 2,
          height: Math.max(0, drop.band.bottom - drop.band.top),
        }}
      />
      <div
        className="BlockNode-portDropRule"
        data-testid="block-port-drop-rule"
        style={{
          left: inputs ? 0 : width / 2,
          top: drop.indicatorY,
          width: width / 2,
        }}
      />
      <div
        className={`BlockNode-portGrip BlockNode-portGrip--${inputs ? 'in' : 'out'}`}
        data-testid="block-port-grip"
        style={{ left: inputs ? 0 : width, top: drag.pointerY }}
      >
        <svg viewBox="0 0 10 14" aria-hidden="true">
          {[3, 7, 11].map((y) => (
            <g key={y}>
              <circle cx="3.5" cy={y} r="1.05" fill="currentColor" />
              <circle cx="6.5" cy={y} r="1.05" fill="currentColor" />
            </g>
          ))}
        </svg>
      </div>
    </>
  )
}

export interface BlockCanvasProps {
  shape: BlockShape
}

/**
 * Canvas-only Block renderer. `BlockShapeUtil` remains the authority for frame
 * geometry, containment, clipping, resize, export and connection routing.
 */
export function BlockCanvas({ shape }: BlockCanvasProps) {
  const editor = useEditor()
  const layout = layoutBlock(shape.props)
  // A cable on either face of a port fills its dot: the dot is the port, and
  // the faces are the two sides of the boundary it sits on. The wiring table
  // keeps its identity while its entries do, so a Block that merely moved —
  // whose record changed but whose cables did not — does not repaint here.
  const connections = useValue(
    'Block port connections',
    () => getBlockPortConnections(editor, shape.id),
    [editor, shape.id],
  )
  const connectedIds = useMemo(
    () => new Set(connections.map((connection) => connection.ownPortId)),
    [connections],
  )
  const producerCounts = useMemo(() => countProducers(connections), [connections])
  const drawnPorts = portsToDraw(layout.ports, connectedIds, producerCounts)
  // Which argument each effect port belongs to, drawn once as geometry. Pure
  // and cheap, so it rides the layout rather than earning its own subscription.
  const tethers = effectTethers(layout)
  const simple = layout.view === 'simple'
  const value = layout.view === 'value'
  // The two faces without a heading, rows, footer or add gutters.
  const plain = simple || value
  const isEditing = useValue(
    'editing Block',
    () => editor.getEditingShapeId() === shape.id,
    [editor, shape.id],
  )
  const isSelected = useValue(
    'selected Block',
    () => editor.getSelectedShapeIds().includes(shape.id),
    [editor, shape.id],
  )
  const drag = useValue('block port drag', () => getBlockPortDrag(editor), [editor])
  // A lens somebody put on this document, and how it is painted. Both are read
  // here so that a board with no lens on it renders exactly the markup it
  // rendered before the vocabulary existed: `normal` writes no attribute.
  const diffState: BlockState = blockDiffState(shape.props)
  const diffVariant = useValue('diff variant', () => diffPresentation.get().variant, [])
  // Read unconditionally so the hook order never depends on the lens, and
  // published as a custom property so the blend ramp is one repaint, not a
  // re-render per row.
  const diffBlend = useValue('diff blend', () => diffPresentation.get().blend, [])
  // One predicate, shared with `clear diff marks`, so the paint and the escape
  // hatch can never disagree about whether this card is wearing a lens.
  const stated = hasAnyBlockState(shape.props)
  const heldPort = drag?.shapeId === shape.id ? drag : null
  // Inside a Branch, a Block in a non-active arm paints faded with its arm.
  const fade = useValue('Block branch fade', () => branchFadeOpacity(editor, shape.id), [editor, shape.id])
  // The add gutters are a selection affordance, exactly as the brief asks: they
  // exist for the Block you are working on and nowhere else, so a busy canvas
  // never sprouts a plus under every lane.
  const addAffordances = !plain && isSelected && !isEditing && !heldPort
    ? (['inputs', 'outputs'] as const).flatMap((side) => {
        const affordance = blockPortAddAffordance(shape.props, side)
        return affordance ? [{ side, affordance }] : []
      })
    : []
  const headerAffordance = !simple && isSelected && !isEditing && !heldPort
    ? blockHeaderPortAddAffordance(shape.props)
    : null

  return (
    <HTMLContainer
      className={`NodeShape systemsketch-block-canvas${simple ? ' NodeShape_plain' : ''}${value ? ' NodeShape_value' : ''}`}
      data-block-view={layout.view}
      data-diff-state={diffState === 'normal' ? undefined : diffState}
      data-diff-variant={stated ? diffVariant : undefined}
		data-definition-id={value ? undefined : shape.props.definitionId || undefined}
		data-definition-key={value ? undefined : shape.props.definitionKey || undefined}
		data-draft-ordinal={value ? undefined : shape.props.draftOrdinal}
      style={{
        ...(fade < 1 ? { opacity: fade } : null),
        ...(stated && diffVariant === 'blend'
          ? ({ '--diff-blend': diffBlend } as CSSProperties)
          : null),
      }}
      onPointerDownCapture={(event) => {
        // The painted element is the most exact answer available, and it is only
        // available here. A miss is left alone rather than reset to the title:
        // the pointer may be on the space beside the text, which the layout
        // boxes still resolve, or on a port dot, which is not an edit at all.
        const target = event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-pb-inline-field]')
          : null
        const field = target && event.currentTarget.contains(target)
          ? parseBlockInlineFieldAttribute(target.dataset.pbInlineField)
          : null
        if (field) rememberBlockInlineField(editor, shape.id, field)
      }}
    >
      <div className="BlockNode-layer">
        {simple
          ? <SimpleFace shape={shape} />
          : value
            ? <ValueFace shape={shape} connectedIds={connectedIds} editing={isEditing} />
            : <BlockHeading shape={shape} height={layout.headerHeight} />}
        {simple ? <DefinitionBadge shape={shape} /> : null}
        {simple ? <BlockDiffBadge shape={shape} /> : null}
        {stated ? <BlockDiffRail ports={layout.ports} /> : null}
        {/* Outside the face, so a card that moved AND was renamed shows both
            without the two marks competing for the same pixels. */}
        <BlockPoseGhost shape={shape} />

        {!plain ? (
          <>
            {layout.dividers.map((divider, index) => (
              <div
                key={`divider-${index}`}
                className={divider.kind === 'branch'
                  ? 'BlockNode-divider BlockNode-divider--branch'
                  : 'BlockNode-divider'}
                style={{ left: divider.x, top: divider.y, width: divider.w }}
              />
            ))}
            {layout.view === 'expanded'
              ? layout.dividers.map((divider, index) => divider.adjust ? (
                  <ExpandedDividerHandle
                    key={`divider-handle-${index}`}
                    shape={shape}
                    divider={divider}
                  />
                ) : null)
              : null}
	            <PortLabels ports={layout.ports} drag={heldPort} connectedIds={connectedIds} />
						<HiddenPortSummaries summaries={layout.hiddenPortSummaries} />
						<VariadicRuns ports={layout.ports} />
            {layout.description ? (
              <div
                className="BlockNode-description"
                style={boxStyle(layout.description)}
                data-pb-inline-field={blockInlineFieldAttribute({ kind: 'description' })}
                title={stockBlockVisibleDescription(shape.props)}
              >
                <FieldValue
                  diffs={shape.props.fieldDiffs}
                  path="description"
                  value={stockBlockVisibleDescription(shape.props)}
                />
              </div>
            ) : null}
          </>
        ) : null}

        {/* Render only, Port view only — `effectTethers` returns nothing in any
            other view. It sits under the dots and takes no pointer events, so it
            can never swallow a click meant for a port, a label or the block. */}
        {tethers.length > 0 ? (
          <svg
            className="BlockNode-tethers"
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-hidden="true"
          >
            {tethers.map((tether) => (
              <path key={tether.portId} className="BlockNode-tether" d={tether.d} />
            ))}
          </svg>
        ) : null}

        {drawnPorts.map((port) => (
          <BlockPortDot
            key={`${port.placed.side}:${port.placed.port.id}`}
            shape={shape}
            port={port}
            dragOffset={
              heldPort
              && heldPort.portId === port.placed.port.id
              && heldPort.side === (port.placed.side === 'input' ? 'inputs' : 'outputs')
                ? heldPort.pointerY - port.placed.y
                : null
            }
          />
        ))}
        {heldPort ? <PortDragOverlay drag={heldPort} width={layout.width} /> : null}
        {addAffordances.map(({ side, affordance }) => (
          <PortAddAffordance
            key={`port-add-${side}`}
            shape={shape}
            side={side}
            affordance={affordance}
          />
        ))}
        {headerAffordance ? (
          <PortAddAffordance
            shape={shape}
            side="inputs"
            affordance={headerAffordance}
            header
          />
        ) : null}
        {isEditing ? <BlockInlineEditor shape={shape} /> : null}
      </div>

      {layout.footer ? (
        <div className="NodeShape-footer" style={boxStyle(layout.footer)}>
          <BlockFooterMenu shape={shape} />
        </div>
      ) : null}
    </HTMLContainer>
  )
}

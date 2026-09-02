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
  blockIcon,
  expandedSectionWeights,
  isBlockShape,
  portDefaultValue,
  type BlockPortSide,
  type BlockShape,
} from '../blockModel'
import { BlockInlineEditor } from '../BlockInlineEditor'
import { getBlockPortConnections } from '../connections/blockPorts'
import { judgeConnection } from '../connections/connectionRules'
import {
  blockInlineFieldAttribute,
  parseBlockInlineFieldAttribute,
  rememberBlockInlineField,
  requestBlockInlineEdit,
} from '../inlineBlockEditing'
import {
  layoutBlock,
  type BlockDivider,
  type BlockRect,
  type LaidOutBlockPort,
} from '../layoutBlock'
import { insertBlockPortForInlineEditing } from '../commands/blockCommands'
import {
  blockPortAddAffordance,
  getBlockPortDrag,
  getEligiblePorts,
  portState,
  type BlockPortAddAffordance,
  type BlockPortDragState,
} from '../ports'
import { BlockIconGlyph } from './blockIcons'
import { stepIntoDepthScope } from '../../depth/depthNavigation'
import { branchFadeOpacity } from '../../branch/branchScope'
import { portColor } from './portPalette'
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

/** How many cables land on each port as a sink: the count a many-to-one port shows. */
export function countProducers(connections: readonly { ownPortId: string; ownPolarity: string }[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const connection of connections) {
    if (connection.ownPolarity !== 'sink') continue
    counts.set(connection.ownPortId, (counts.get(connection.ownPortId) ?? 0) + 1)
  }
  return counts
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
  const editor = useEditor()
  const { placed, connected, hasDefault, producers } = port
  const portId = placed.port.id

  const isHinting = useValue(
    'port hinting',
    () => {
      const { hintingPort } = portState.get(editor)
      return hintingPort?.shapeId === shape.id && hintingPort.portId === portId
    },
    [editor, shape.id, portId],
  )

  // The dot asks the same rules the drop will: may a cable from the anchored
  // end land here? Either face of this dot may be the answer, and the rules
  // pick the one the two Blocks' places in the tree allow.
  const isEligible = useValue(
    'port eligible',
    () => {
      const eligiblePorts = getEligiblePorts(editor)
      if (!eligiblePorts) return false
      return judgeConnection(
        editor,
        eligiblePorts.anchor,
        { shapeId: shape.id, portId },
        { excludeBlocks: eligiblePorts.excludeBlocks, connectionId: eligiblePorts.connectionId },
      ).ok
    },
    [editor, shape.id, portId],
  )

  // No pointer handler here on purpose. The capture listener in
  // `installConnections.ts` is the ONE authority for a press on a dot: it lets
  // tldraw take the press first, so a selected cable's terminal handle — which
  // sits exactly on this dot — becomes a handle drag, and only a press tldraw
  // did not claim becomes a new cable. A synchronous transition from this
  // element would run before tldraw's own handler and take that choice away.
  const classes = [
    'Port',
    placed.side === 'input' ? 'Port_end' : 'Port_start',
    placed.subtle ? 'Port_subtle' : '',
    hasDefault ? 'Port_default' : '',
    connected ? 'Port_connected' : '',
    dragOffset !== null ? 'Port_dragging' : '',
    isHinting ? 'Port_hinting' : isEligible ? 'Port_eligible' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      className={classes}
      data-block-port-id={portId}
      data-block-port-side={placed.side}
      style={{
        '--port-color': portColor(placed.port.type),
        left: placed.x,
        top: placed.y,
        ...(dragOffset !== null
          ? { transform: `translate(-50%, -50%) translateY(${dragOffset}px)` }
          : null),
      } as CSSProperties}
    >
      {producers >= 2 ? <PortCountBadge portId={portId} count={producers} /> : null}
    </div>
  )
}

/**
 * Many-to-one, shown as a count. A port with two or more producers wears a
 * muted pill beside its dot — the inspector's count-chip idiom — and nothing
 * else: which producer is live is the Branch fade's job, not the cable's.
 */
export function PortCountBadge({ portId, count }: { portId: string; count: number }) {
  return (
    <span className="Port-count" data-testid={`port-count-${portId}`} aria-label={`${count} cables into this port`}>
      {count}
    </span>
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
                  onClick={() => void stepIntoDepthScope(editor, shape.id)}
                >
                  <TldrawUiButtonLabel>Step into</TldrawUiButtonLabel>
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
          >
            {shape.props.title}
          </span>
        </div>
      ) : null}
      {layout.description ? (
        <div
          className="BlockNode-simpleDescription"
          style={boxStyle(layout.description)}
          data-pb-inline-field={blockInlineFieldAttribute({ kind: 'description' })}
        >
          {shape.props.description}
        </div>
      ) : null}
      {layout.typeLabel ? (
        <div
          className="BlockNode-simpleType"
          style={boxStyle(layout.typeLabel)}
          data-pb-inline-field={blockInlineFieldAttribute({ kind: 'blockType' })}
        >
          {shape.props.blockType}
        </div>
      ) : null}
    </>
  )
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
        >
          {shape.props.title}
        </span>
        {shape.props.blockType !== '' ? (
          <span
            className="BlockNode-headingType"
            data-pb-inline-field={blockInlineFieldAttribute({ kind: 'blockType' })}
          >
            {shape.props.blockType}
          </span>
        ) : null}
      </div>
    </div>
  )
}

function PortLabels({
  ports,
  drag,
}: {
  ports: readonly LaidOutBlockPort[]
  drag: BlockPortDragState | null
}) {
  return (
    <>
      {ports.map((placed) => {
        if (!placed.label) return null
        const held = Boolean(
          drag
          && drag.portId === placed.port.id
          && drag.side === (placed.side === 'input' ? 'inputs' : 'outputs'),
        )
        const defaultValue = placed.side === 'input' ? portDefaultValue(placed.port) : ''
        const name = (
          <span
            className={defaultValue !== ''
              ? 'BlockNode-portName BlockNode-portName--default'
              : 'BlockNode-portName'}
            title={defaultValue !== '' ? `= ${defaultValue}` : undefined}
            data-pb-inline-field={blockInlineFieldAttribute({
              kind: 'portName',
              side: placed.side === 'input' ? 'inputs' : 'outputs',
              portId: placed.port.id,
            })}
          >
            {placed.port.name}
          </span>
        )
        const type = placed.port.type ? (
          <span
            className="BlockNode-portType"
            data-pb-inline-field={blockInlineFieldAttribute({
              kind: 'portType',
              side: placed.side === 'input' ? 'inputs' : 'outputs',
              portId: placed.port.id,
            })}
          >
            {placed.port.type}
          </span>
        ) : null
        const chip = defaultValue !== '' ? (
          <span className="BlockNode-portDefault" title={`= ${defaultValue}`}>
            = {defaultValue}
          </span>
        ) : null

        return (
          <div
            key={`${placed.side}:${placed.port.id}`}
            className={[
              'BlockNode-portLabel',
              placed.side === 'input' ? 'BlockNode-portLabel--in' : 'BlockNode-portLabel--out',
              held ? 'BlockNode-portLabel--dragging' : '',
            ].filter(Boolean).join(' ')}
            style={{
              ...boxStyle(placed.label),
              ...(held && drag ? { transform: `translateY(${drag.pointerY - placed.y}px)` } : null),
            }}
          >
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
}: {
  shape: BlockShape
  side: BlockPortSide
  affordance: BlockPortAddAffordance
}) {
  const editor = useEditor()
  const lane = side === 'inputs' ? 'input' : 'output'

  const addPort = useCallback(() => {
    const result = insertBlockPortForInlineEditing(
      editor,
      shape.id,
      side,
      Number.MAX_SAFE_INTEGER,
    )
    if (!result.ok) return
    requestBlockInlineEdit(editor, shape.id, { kind: 'portName', side, portId: result.port.id })
  }, [editor, shape.id, side])

  return (
    <div className={`BlockNode-portAdd BlockNode-portAdd--${lane}`}>
      <div
        className="BlockNode-portAddZone"
        data-testid={`block-port-add-zone-${side}`}
        style={boxStyle(affordance.zone)}
      />
      {/*
        The bead is named for the Block it belongs to. The docked inspector has
        its own "Add output port" button, and two live controls answering to one
        accessible name read as the same control repeated on a screen reader.
      */}
      <div
        role="button"
        aria-label={`Add ${lane} port to ${shape.props.title.trim() || 'this Block'} on canvas`}
        title={`Add ${lane} port`}
        className="BlockNode-portAddBead"
        data-testid={`block-port-add-${side}`}
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
  return (
    <>
      <div
        className="BlockNode-portDropRule"
        data-testid="block-port-drop-rule"
        style={{
          left: inputs ? 0 : width / 2,
          top: drag.indicatorY,
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
  const simple = layout.view === 'simple'
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
  const heldPort = drag?.shapeId === shape.id ? drag : null
  // Inside a Branch, a Block in a non-active arm paints faded with its arm.
  const fade = useValue('Block branch fade', () => branchFadeOpacity(editor, shape.id), [editor, shape.id])
  // The add gutters are a selection affordance, exactly as the brief asks: they
  // exist for the Block you are working on and nowhere else, so a busy canvas
  // never sprouts a plus under every lane.
  const addAffordances = !simple && isSelected && !isEditing && !heldPort
    ? (['inputs', 'outputs'] as const).flatMap((side) => {
        const affordance = blockPortAddAffordance(shape.props, side)
        return affordance ? [{ side, affordance }] : []
      })
    : []

  return (
    <HTMLContainer
      className={`NodeShape systemsketch-block-canvas${simple ? ' NodeShape_plain' : ''}`}
      data-block-view={layout.view}
      style={fade < 1 ? { opacity: fade } : undefined}
      onContextMenu={(event) => {
        const target = event.target instanceof Element
          ? event.target.closest('input, textarea, select')
          : null
        if (target && event.currentTarget.contains(target)) event.stopPropagation()
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
        {simple ? <SimpleFace shape={shape} /> : <BlockHeading shape={shape} height={layout.headerHeight} />}

        {!simple ? (
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
            <PortLabels ports={layout.ports} drag={heldPort} />
            {layout.description ? (
              <div
                className="BlockNode-description"
                style={boxStyle(layout.description)}
                data-pb-inline-field={blockInlineFieldAttribute({ kind: 'description' })}
              >
                {shape.props.description}
              </div>
            ) : null}
          </>
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
        {isEditing ? <BlockInlineEditor shape={shape} /> : null}
      </div>

      {!simple ? (
        <div
          className="NodeShape-footer"
          style={{ top: layout.footerTop, height: Math.max(0, layout.bounds.h - layout.footerTop) }}
        >
          <BlockFooterMenu shape={shape} />
        </div>
      ) : null}
    </HTMLContainer>
  )
}

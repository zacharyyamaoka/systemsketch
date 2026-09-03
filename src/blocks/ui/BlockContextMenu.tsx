/**
 * SystemSketch's semantic right-click surface, adapted from pyblocks' mature
 * whiteboard-first menu. The menu creates or chooses structure; the existing
 * Block command and inline-edit seams remain the only writers.
 */
import {
  DefaultContextMenuContent,
  TldrawUiMenuCheckboxItem,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  TldrawUiMenuSubmenu,
  useEditor,
  useToasts,
  useValue,
  type TLUiContextMenuProps,
} from 'tldraw'
import { ReliableContextMenu } from './ReliableContextMenu'

import {
  BLOCK_VIEWS,
  HEADER_ROW,
  PORT_LAYOUTS,
  blockIcon,
  isBlockShape,
  portInHeader,
  portRow,
  type BlockPortSide,
  type BlockShape,
} from '../blockModel'
import {
  appendBlockPortForInlineEditing,
  blockPortIndex,
  blockPortRowCount,
  insertBlockPortForInlineEditing,
  moveBlockPort,
  moveBlockPortToSection,
  removeBlockPort,
  startBlockPortSection,
  updateBlockDetails,
} from '../commands/blockCommands'
import { detachSelectedBlocks, rebuildSelectedBlocks, selectedBlockIds, selectedDetachedGroupIds } from '../detach'
import { getBlockPortMenuTarget, type BlockPortRef } from '../ports'
import {
  getBlockSelectionStyles,
  getSelectedConnectionCount,
  getSharedStyleForSelection,
  isSharedStyleValue,
  setBlockPortLayoutForSelection,
  setBlockViewForSelection,
  setConnectionRoutingForSelection,
  setConnectionTemporalForSelection,
} from '../commands/blockStyleCommands'
import {
  CONNECTION_ROUTING_KINDS,
  CONNECTION_TEMPORAL_KINDS,
  ConnectionRoutingStyle,
  ConnectionTemporalStyle,
  type ConnectionRoutingKind,
  type ConnectionTemporalKind,
} from '../connections/connectionModel'
import { describeTidyEdgesOutcome, getTidyEdgesSelection, tidyEdges } from '../connections/tidyEdges'
import { describeOrganizeNodesOutcome, organizeNodes } from '../layout'
import {
  requestBlockInlineEdit,
  type BlockInlineField,
} from '../inlineBlockEditing'
import { stepIntoDepthScope } from '../../depth/depthNavigation'
import {
  duplicateBlockUnlinked,
  linkedBlockOccurrences,
  unlinkBlockDefinition,
} from '../definitions/definitionLinking'

function onlySelectedBlock(editor: ReturnType<typeof useEditor>): BlockShape | null {
  const selected = editor.getSelectedShapes()
  return selected.length === 1 && isBlockShape(selected[0]) ? selected[0] : null
}

/** The live index of a menu target, so Move up/down disable at the ends. */
function blockPortIndexOf(editor: ReturnType<typeof useEditor>, target: BlockPortRef): number {
  const shape = editor.getShape(target.shapeId)
  return isBlockShape(shape) ? blockPortIndex(shape.props, target.side, target.portId) : 0
}

function labelFor(value: string): string {
  return value[0].toUpperCase() + value.slice(1)
}

/**
 * Menus that write a style are gated on the selection, not on a single shape.
 *
 * A checkbox is checked only when tldraw reports the whole selection as
 * sharing that value; a mixed selection shows every option unchecked and one
 * click resolves it, which is how the stock style menus already behave.
 */
function batchSuffix(count: number): string {
  return count > 1 ? ` (${count})` : ''
}

/**
 * The stock root wraps the canvas: `DefaultContextMenu` renders `<Canvas />`
 * inside its trigger. So this component subscribes to nothing that changes
 * while a shape moves — every one of its re-renders is a re-render of the
 * whole canvas tree, measured as O(shapes) of React work per drag frame. The
 * items below read the selection, and they mount only while the menu is open.
 */
export function BlockContextMenu(props: TLUiContextMenuProps) {
  return (
    <ReliableContextMenu {...props}>
      <BlockContextMenuItems />
    </ReliableContextMenu>
  )
}

function BlockContextMenuItems() {
  const editor = useEditor()
  const { addToast } = useToasts()
  // Detach and its inverse are counts, not one-Block commands: a sweep over a
  // multi-selection is the normal case, and the label says how many.
  const detachableCount = useValue(
    'context-menu detachable Blocks',
    () => selectedBlockIds(editor).length,
    [editor],
  )
  const rebuildableCount = useValue(
    'context-menu rebuildable groups',
    () => selectedDetachedGroupIds(editor).length,
    [editor],
  )
  // Structural commands (Add, Step into) still need one unambiguous Block:
  // they create identity and open an inline editor on it.
  const selectedBlock = useValue(
    'context-menu selected Block',
    () => onlySelectedBlock(editor),
    [editor],
  )
  const linkedOccurrenceCount = useValue(
    'selected Block linked occurrence count',
    () => selectedBlock ? linkedBlockOccurrences(editor, selectedBlock).length : 0,
    [editor, selectedBlock?.id],
  )
  const blockStyles = useValue(
    'context-menu Block selection styles',
    () => getBlockSelectionStyles(editor),
    [editor],
  )
  const connectionRouting = useValue(
    'context-menu connection routing',
    () => getSharedStyleForSelection(editor, ConnectionRoutingStyle),
    [editor],
  )
  const connectionTemporal = useValue(
    'context-menu connection temporal',
    () => getSharedStyleForSelection(editor, ConnectionTemporalStyle),
    [editor],
  )
  const connectionCount = useValue(
    'context-menu connection count',
    () => getSelectedConnectionCount(editor),
    [editor],
  )
  const layoutSelection = useValue(
    'context-menu selected layout subjects',
    () => ({
      blocks: editor.getSelectedShapes().filter((shape) => shape.type === 'block').length,
      edges: getTidyEdgesSelection(editor).length,
    }),
    [editor],
  )
  // Same menu, different subject. The right-click that opened it recorded the
  // port it landed on, so the commands at the top are about that port while the
  // rest of the menu stays exactly what it always was.
  const portTarget = useValue(
    'context-menu port target',
    () => {
      const target = getBlockPortMenuTarget(editor)
      if (!target) return null
      const shape = editor.getShape(target.shapeId)
      if (!isBlockShape(shape) || shape.isLocked) return null
      const lane = shape.props[target.side]
      const port = lane.find((candidate) => candidate.id === target.portId)
      return port
        ? {
          target,
          count: lane.length,
          row: portRow(port),
          inHeader: portInHeader(port),
          rowCount: blockPortRowCount(shape.props),
        }
        : null
    },
    [editor],
  )

  const editField = (
    field: BlockInlineField,
    patch?: Partial<Pick<BlockShape['props'], 'showDescription'>>,
  ) => {
    if (!selectedBlock) return
    if (patch) updateBlockDetails(editor, selectedBlock.id, patch)
    requestBlockInlineEdit(editor, selectedBlock.id, field)
  }

  const addPort = (side: BlockPortSide) => {
    if (!selectedBlock) return
    const result = appendBlockPortForInlineEditing(editor, selectedBlock.id, side)
    if (!result.ok) return
    requestBlockInlineEdit(editor, selectedBlock.id, {
      kind: 'portName',
      side,
      portId: result.port.id,
    })
  }

  const setRouting = (routing: ConnectionRoutingKind) => {
    setConnectionRoutingForSelection(editor, routing)
  }

  const setTemporal = (temporal: ConnectionTemporalKind) => {
    setConnectionTemporalForSelection(editor, temporal)
  }

  const runTidyEdges = () => {
    const outcome = tidyEdges(editor)
    addToast({ title: describeTidyEdgesOutcome(outcome), severity: 'info' })
  }

  const runOrganizeNodes = async () => {
    const outcome = await organizeNodes(editor)
    addToast({ title: describeOrganizeNodesOutcome(outcome), severity: 'info' })
  }

  // The new port joins its subject's row and arm, so "add below" a header
  // port is another header port.
  const addPortAt = (target: BlockPortRef, offset: 0 | 1) => {
    const index = blockPortIndexOf(editor, target) + offset
    const result = insertBlockPortForInlineEditing(editor, target.shapeId, target.side, index, {
      like: target.portId,
    })
    if (!result.ok) return
    requestBlockInlineEdit(editor, target.shapeId, {
      kind: 'portName',
      side: target.side,
      portId: result.port.id,
    })
  }

  // One visual step: within a row the neighbours swap, at a row's edge the
  // port crosses the line, and an input stepping up out of the first body row
  // lifts into the heading.
  const movePort = (target: BlockPortRef, delta: -1 | 1) => {
    moveBlockPort(editor, target.shapeId, target.side, target.portId, delta)
  }

  const moveToRow = (target: BlockPortRef, row: number) => {
    moveBlockPortToSection(editor, target.shapeId, target.side, target.portId, {
      row,
      branch: 0,
      before: null,
    })
  }

  return (
    <>
      {portTarget ? (
        <TldrawUiMenuGroup id="systemsketch-block-port">
          <TldrawUiMenuItem
            id="block-port-add-above"
            label="Add port above"
            onSelect={() => addPortAt(portTarget.target, 0)}
          />
          <TldrawUiMenuItem
            id="block-port-add-below"
            label="Add port below"
            onSelect={() => addPortAt(portTarget.target, 1)}
          />
          <TldrawUiMenuItem
            id="block-port-move-up"
            label="Move up"
            disabled={blockPortIndexOf(editor, portTarget.target) === 0
              && (portTarget.target.side === 'outputs' || portTarget.inHeader)}
            onSelect={() => movePort(portTarget.target, -1)}
          />
          <TldrawUiMenuItem
            id="block-port-move-down"
            label="Move down"
            disabled={blockPortIndexOf(editor, portTarget.target) >= portTarget.count - 1}
            onSelect={() => movePort(portTarget.target, 1)}
          />
          {/* The header is a row like any other here: the one an input's
              control-flow data lives in. */}
          <TldrawUiMenuSubmenu id="block-port-row" label="Move to">
            <TldrawUiMenuGroup id="block-port-row-options">
              {portTarget.target.side === 'inputs' ? (
                <TldrawUiMenuCheckboxItem
                  id="block-port-row-header"
                  label="Header"
                  checked={portTarget.inHeader}
                  onSelect={() => moveToRow(portTarget.target, HEADER_ROW)}
                />
              ) : null}
              {Array.from({ length: portTarget.rowCount }, (_, index) => index + 1).map((row) => (
                <TldrawUiMenuCheckboxItem
                  key={row}
                  id={`block-port-row-${row}`}
                  label={`Row ${row}`}
                  checked={portTarget.row === row}
                  onSelect={() => moveToRow(portTarget.target, row)}
                />
              ))}
            </TldrawUiMenuGroup>
            <TldrawUiMenuGroup id="block-port-row-new">
              <TldrawUiMenuItem
                id="block-port-new-row"
                label="New row below"
                onSelect={() => void startBlockPortSection(
                  editor,
                  portTarget.target.shapeId,
                  portTarget.target.side,
                  portTarget.target.portId,
                  'row',
                )}
              />
              {portTarget.target.side === 'outputs' ? (
                <TldrawUiMenuItem
                  id="block-port-new-branch"
                  label="New branch below"
                  onSelect={() => void startBlockPortSection(
                    editor,
                    portTarget.target.shapeId,
                    portTarget.target.side,
                    portTarget.target.portId,
                    'branch',
                  )}
                />
              ) : null}
            </TldrawUiMenuGroup>
          </TldrawUiMenuSubmenu>
          <TldrawUiMenuItem
            id="block-port-delete"
            label="Delete port"
            onSelect={() => void removeBlockPort(
              editor,
              portTarget.target.shapeId,
              portTarget.target.side,
              portTarget.target.portId,
            )}
          />
        </TldrawUiMenuGroup>
      ) : null}

      {blockStyles.blockCount > 0 ? (
        <TldrawUiMenuGroup id="systemsketch-block-authoring">
          <TldrawUiMenuSubmenu
            id="block-view"
            label={`Block view${batchSuffix(blockStyles.blockCount)}`}
          >
            <TldrawUiMenuGroup id="block-view-options">
              {BLOCK_VIEWS.map((view) => (
                <TldrawUiMenuCheckboxItem
                  key={view}
                  id={`block-view-${view}`}
                  label={labelFor(view)}
                  checked={isSharedStyleValue(blockStyles.view, view)}
                  onSelect={() => void setBlockViewForSelection(editor, view)}
                />
              ))}
            </TldrawUiMenuGroup>
          </TldrawUiMenuSubmenu>

          {selectedBlock ? (
          <TldrawUiMenuSubmenu id="block-add" label="Add">
            <TldrawUiMenuGroup id="block-add-ports">
              <TldrawUiMenuItem
                id="block-add-input-port"
                label="Input port"
                onSelect={() => addPort('inputs')}
              />
              <TldrawUiMenuItem
                id="block-add-output-port"
                label="Output port"
                onSelect={() => addPort('outputs')}
              />
            </TldrawUiMenuGroup>
            <TldrawUiMenuGroup id="block-add-fields">
              {blockIcon(selectedBlock.props) === '' ? (
                <TldrawUiMenuItem
                  id="block-add-icon"
                  label="Icon…"
                  onSelect={() => editField({ kind: 'icon' })}
                />
              ) : null}
              {selectedBlock.props.description.trim() === '' ? (
                <TldrawUiMenuItem
                  id="block-add-description"
                  label="Description…"
                  onSelect={() => editField({ kind: 'description' }, { showDescription: true })}
                />
              ) : null}
              {selectedBlock.props.blockType.trim() === '' ? (
                <TldrawUiMenuItem
                  id="block-add-type"
                  label="Type…"
                  onSelect={() => editField({ kind: 'blockType' })}
                />
              ) : null}
            </TldrawUiMenuGroup>
          </TldrawUiMenuSubmenu>
          ) : null}

          <TldrawUiMenuSubmenu
            id="block-ports"
            label={`Ports${batchSuffix(blockStyles.blockCount)}`}
          >
            <TldrawUiMenuGroup id="block-port-layout">
              {PORT_LAYOUTS.map((layout) => (
                <TldrawUiMenuCheckboxItem
                  key={layout}
                  id={`block-port-layout-${layout}`}
                  label={layout === 'inline' ? 'Aligned' : 'Offset'}
                  checked={isSharedStyleValue(blockStyles.portLayout, layout)}
                  onSelect={() => void setBlockPortLayoutForSelection(editor, layout)}
                />
              ))}
            </TldrawUiMenuGroup>
          </TldrawUiMenuSubmenu>

          {selectedBlock?.props.view === 'expanded' ? (
            <TldrawUiMenuSubmenu id="block-advanced" label="Advanced">
              <TldrawUiMenuGroup id="block-advanced-depth">
                <TldrawUiMenuItem
                  id="block-step-into"
                  label="Step into"
                  onSelect={() => selectedBlock && void stepIntoDepthScope(editor, selectedBlock.id)}
                />
              </TldrawUiMenuGroup>
            </TldrawUiMenuSubmenu>
          ) : null}
        </TldrawUiMenuGroup>
      ) : null}

      {selectedBlock ? (
        <TldrawUiMenuGroup id="systemsketch-block-definition">
          <TldrawUiMenuItem
            id="block-duplicate-unlinked"
            label="Duplicate unlinked"
            onSelect={() => void duplicateBlockUnlinked(editor, selectedBlock.id)}
          />
          {linkedOccurrenceCount > 1 ? (
            <TldrawUiMenuItem
              id="block-unlink-definition"
              label="Unlink"
              onSelect={() => void unlinkBlockDefinition(editor, selectedBlock.id)}
            />
          ) : null}
        </TldrawUiMenuGroup>
      ) : null}

      {detachableCount > 0 || rebuildableCount > 0 ? (
        <TldrawUiMenuGroup id="systemsketch-block-detach">
          {detachableCount > 0 ? (
            <TldrawUiMenuItem
              id="block-detach-to-primitives"
              label={`Detach to primitives${batchSuffix(detachableCount)}`}
              onSelect={() => void detachSelectedBlocks(editor)}
            />
          ) : null}
          {rebuildableCount > 0 ? (
            <TldrawUiMenuItem
              id="block-rebuild-from-primitives"
              label={`Rebuild Block${rebuildableCount > 1 ? 's' : ''} from primitives${batchSuffix(rebuildableCount)}`}
              onSelect={() => void rebuildSelectedBlocks(editor)}
            />
          ) : null}
        </TldrawUiMenuGroup>
      ) : null}

      {connectionCount > 0 && connectionRouting ? (
        <TldrawUiMenuGroup id="systemsketch-connection-routing">
          <TldrawUiMenuSubmenu
            id="connection-routing"
            label={`Routing${batchSuffix(connectionCount)}`}
          >
            <TldrawUiMenuGroup id="connection-routing-options">
              {CONNECTION_ROUTING_KINDS.map((routing) => (
                <TldrawUiMenuCheckboxItem
                  key={routing}
                  id={`connection-routing-${routing}`}
                  label={labelFor(routing)}
                  checked={isSharedStyleValue(connectionRouting, routing)}
                  onSelect={() => setRouting(routing)}
                />
              ))}
            </TldrawUiMenuGroup>
          </TldrawUiMenuSubmenu>
        </TldrawUiMenuGroup>
      ) : null}

      {connectionCount > 0 && connectionTemporal ? (
        <TldrawUiMenuGroup id="systemsketch-connection-temporal">
          <TldrawUiMenuSubmenu
            id="connection-temporal"
            label={`Edge type${batchSuffix(connectionCount)}`}
          >
            <TldrawUiMenuGroup id="connection-temporal-options">
              {CONNECTION_TEMPORAL_KINDS.map((temporal) => (
                <TldrawUiMenuCheckboxItem
                  key={temporal}
                  id={`connection-temporal-${temporal}`}
                  label={temporal === 'delayed' ? 'Delayed (z⁻¹)' : labelFor(temporal)}
                  checked={isSharedStyleValue(connectionTemporal, temporal)}
                  onSelect={() => setTemporal(temporal)}
                />
              ))}
            </TldrawUiMenuGroup>
          </TldrawUiMenuSubmenu>
        </TldrawUiMenuGroup>
      ) : null}

      {layoutSelection.blocks > 0 || layoutSelection.edges > 0 ? (
        <TldrawUiMenuGroup id="systemsketch-layout">
          <TldrawUiMenuItem
            id="tidy-edges"
            label="Tidy edges"
            disabled={layoutSelection.edges === 0}
            onSelect={runTidyEdges}
          />
          <TldrawUiMenuItem
            id="organize-nodes"
            label="Organize nodes"
            disabled={layoutSelection.blocks < 2}
            onSelect={() => void runOrganizeNodes()}
          />
        </TldrawUiMenuGroup>
      ) : null}

      <DefaultContextMenuContent />
    </>
  )
}

/**
 * SystemSketch's semantic right-click surface, adapted from pyblocks' mature
 * whiteboard-first menu. The menu creates or chooses structure; the existing
 * Block command and inline-edit seams remain the only writers.
 */
import {
  DefaultContextMenu,
  DefaultContextMenuContent,
  TldrawUiMenuCheckboxItem,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  TldrawUiMenuSubmenu,
  useEditor,
  useValue,
  type TLUiContextMenuProps,
} from 'tldraw'

import {
  BLOCK_VIEWS,
  PORT_LAYOUTS,
  blockIcon,
  isBlockShape,
  type BlockPortSide,
  type BlockShape,
} from '../blockModel'
import {
  appendBlockPortForInlineEditing,
  blockPortIndex,
  insertBlockPortForInlineEditing,
  moveBlockPortToIndex,
  removeBlockPort,
  updateBlockDetails,
} from '../commands/blockCommands'
import { getBlockPortMenuTarget, type BlockPortRef } from '../ports'
import {
  getBlockSelectionStyles,
  getSelectedConnectionCount,
  getSharedStyleForSelection,
  isSharedStyleValue,
  setBlockPortLayoutForSelection,
  setBlockViewForSelection,
  setConnectionRoutingForSelection,
} from '../commands/blockStyleCommands'
import {
  CONNECTION_ROUTING_KINDS,
  ConnectionRoutingStyle,
  type ConnectionRoutingKind,
} from '../connections/connectionModel'
import {
  requestBlockInlineEdit,
  type BlockInlineField,
} from '../inlineBlockEditing'
import { stepIntoDepthScope } from '../../depth/depthNavigation'
import { useStockContextMenuRootEpoch } from './stockContextMenuRoot'

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

export function BlockContextMenu(props: TLUiContextMenuProps) {
  const editor = useEditor()
  // Remounts the stock root when Radix's uncontrolled `open` gets stranded,
  // which otherwise makes every right-click after the first one a no-op.
  const stockRootEpoch = useStockContextMenuRootEpoch(editor)
  // Structural commands (Add, Step into) still need one unambiguous Block:
  // they create identity and open an inline editor on it.
  const selectedBlock = useValue(
    'context-menu selected Block',
    () => onlySelectedBlock(editor),
    [editor],
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
  const connectionCount = useValue(
    'context-menu connection count',
    () => getSelectedConnectionCount(editor),
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
      return lane.some((port) => port.id === target.portId)
        ? { target, count: lane.length }
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

  const addPortAt = (target: BlockPortRef, offset: 0 | 1) => {
    const index = blockPortIndexOf(editor, target) + offset
    const result = insertBlockPortForInlineEditing(editor, target.shapeId, target.side, index)
    if (!result.ok) return
    requestBlockInlineEdit(editor, target.shapeId, {
      kind: 'portName',
      side: target.side,
      portId: result.port.id,
    })
  }

  // An insertion index is measured against the lane as it stands before the
  // move, so stepping down has to clear the neighbour it swaps with.
  const movePort = (target: BlockPortRef, delta: -1 | 1) => {
    const index = blockPortIndexOf(editor, target)
    moveBlockPortToIndex(
      editor,
      target.shapeId,
      target.side,
      target.portId,
      delta < 0 ? index - 1 : index + 2,
    )
  }

  return (
    <DefaultContextMenu key={stockRootEpoch} {...props}>
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
            disabled={blockPortIndexOf(editor, portTarget.target) === 0}
            onSelect={() => movePort(portTarget.target, -1)}
          />
          <TldrawUiMenuItem
            id="block-port-move-down"
            label="Move down"
            disabled={blockPortIndexOf(editor, portTarget.target) >= portTarget.count - 1}
            onSelect={() => movePort(portTarget.target, 1)}
          />
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

      <DefaultContextMenuContent />
    </DefaultContextMenu>
  )
}

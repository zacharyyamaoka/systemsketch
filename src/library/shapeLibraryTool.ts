import type {
  TLGeoShape,
  TLUiEventSource,
  TLUiToolsContextType,
} from 'tldraw'

import {
  selectShapeFamilyTool,
} from '../toolbar/toolbarIntegration'
import type { ShapeFamilyTool } from '../toolbar/toolbarModel'
import {
  rememberShapeLibraryItem,
  type ShapeLibraryItem,
  type ShapeLibraryStorage,
} from './shapeLibraryModel'

export type ShapeLibraryToolId = ShapeFamilyTool | TLGeoShape['props']['geo']

export function shapeLibraryToolId(item: ShapeLibraryItem): ShapeLibraryToolId {
  if (item.kind === 'geo') return item.geo
  if (item.arrowKind === 'elbow') return 'arrow-elbow'
  return Math.abs(item.bend) > 0.001 ? 'arrow-curve' : 'arrow-straight'
}

/**
 * Choose the exact tldraw tool represented by one library result.
 *
 * WHY: search chooses what the hand will draw; it does not choose where the
 * object goes. Dispatching through the toolbar's real tool items keeps the
 * next canvas click/drag in charge of geometry, snapping, cancellation, and
 * undo, exactly as if the matching toolbar icon had been pressed.
 */
export function activateShapeLibraryTool(
  tools: TLUiToolsContextType,
  item: ShapeLibraryItem,
  storage?: ShapeLibraryStorage,
  source: TLUiEventSource = 'toolbar',
): ShapeLibraryToolId {
  const toolId = shapeLibraryToolId(item)
  if (item.kind === 'arrow') {
    selectShapeFamilyTool(tools, toolId as ShapeFamilyTool, source)
  } else {
    tools[toolId]?.onSelect(source)
  }
  rememberShapeLibraryItem(item.id, storage)
  return toolId
}

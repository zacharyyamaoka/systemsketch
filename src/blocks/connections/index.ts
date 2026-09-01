export * from './connectionModel'
export * from './connectionRouting'
export * from './connectionHit'
export * from './connectionProximity'
export * from './elbowAuthoredRoute'
export * from './insertBlockWithinConnection'
export * from './keepConnectionsAtBottom'
export * from './ConnectionInsertHandleOverlayUtil'
export * from './blockPicker'
export * from './blockPorts'
export * from './ConnectionBindingUtil'
export * from './ConnectionShapeUtil'
export * from './PointingBlockPort'
export * from './installConnections'
export * from './connectionCommands'

import { ConnectionBindingUtil } from './ConnectionBindingUtil'
import { ConnectionInsertHandleOverlayUtil } from './ConnectionInsertHandleOverlayUtil'
import { ConnectionShapeUtil } from './ConnectionShapeUtil'

/** Registration arrays for direct composition into `<Tldraw>`. */
export const blockConnectionShapeUtils = [ConnectionShapeUtil]
export const blockConnectionBindingUtils = [ConnectionBindingUtil]
export const blockConnectionOverlayUtils = [ConnectionInsertHandleOverlayUtil]

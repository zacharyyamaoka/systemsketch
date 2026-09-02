export * from './connectionModel'
export * from './connectionScope'
export * from './connectionRules'
export * from './connectionRouting'
export * from './connectionHit'
export * from './connectionProximity'
export * from './connectionRevealArea'
export * from './ConnectionControlPointOverlayUtil'
export * from './elbowAuthoredRoute'
export * from './keepConnectionsAtBottom'
export * from './blockPicker'
export * from './blockPorts'
export * from './ConnectionBindingUtil'
export * from './ConnectionShapeUtil'
export * from './PointingBlockPort'
export * from './installConnections'
export * from './connectionCommands'

import { ConnectionBindingUtil } from './ConnectionBindingUtil'
import { ConnectionControlPointOverlayUtil } from './ConnectionControlPointOverlayUtil'
import { ConnectionShapeUtil } from './ConnectionShapeUtil'

/** Registration arrays for direct composition into `<Tldraw>`. */
export const blockConnectionShapeUtils = [ConnectionShapeUtil]
export const blockConnectionBindingUtils = [ConnectionBindingUtil]
export const blockConnectionOverlayUtils = [ConnectionControlPointOverlayUtil]

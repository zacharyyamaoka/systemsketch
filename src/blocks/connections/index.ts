export * from './connectionModel'
export * from './connectionScope'
export * from './connectionRules'
export * from './connectionRouting'
export * from './connectionHit'
export * from './elbowAuthoredRoute'
export * from './keepConnectionsAtBottom'
export * from './blockPicker'
export * from './blockPorts'
export * from './ConnectionBindingUtil'
export * from './ConnectionShapeUtil'
export * from './PointingBlockPort'
export * from './installConnections'
export * from './connectionCommands'
export * from './connectionPresentation'
export * from './tidyEdges'

import { ConnectionBindingUtil } from './ConnectionBindingUtil'
import { ConnectionShapeUtil } from './ConnectionShapeUtil'

/** Registration arrays for direct composition into `<Tldraw>`. */
export const blockConnectionShapeUtils = [ConnectionShapeUtil]
export const blockConnectionBindingUtils = [ConnectionBindingUtil]

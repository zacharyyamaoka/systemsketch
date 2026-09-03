export type LeftSurface = 'shapes' | 'files'
export type RightSurface = 'comments' | 'inspector' | 'board-overview' | 'diagnostics'
export type ToolbarSurface = 'commands' | 'find-replace'

export type ChromeSurfaceId =
  | `left:${LeftSurface}`
  | `right:${RightSurface}`
  | `toolbar:${ToolbarSurface}`

export interface ChromeState {
  leftSurface: LeftSurface | null
  rightSurface: RightSurface | null
  toolbarSurface: ToolbarSurface | null
  /** Narrow canvases have room for one side sheet, not two overlapping ones. */
  compactSidePanels: boolean
  openOrder: ChromeSurfaceId[]
}

export const INITIAL_CHROME_STATE: ChromeState = {
  leftSurface: null,
  rightSurface: null,
  toolbarSurface: null,
  compactSidePanels: false,
  openOrder: [],
}

export type ChromeAction =
  | { type: 'set-left'; surface: LeftSurface | null }
  | { type: 'set-right'; surface: RightSurface | null }
  | { type: 'set-toolbar'; surface: ToolbarSurface | null }
  | { type: 'set-compact-side-panels'; compact: boolean }
  | { type: 'close-latest' }
  | { type: 'close-all' }

function withoutZone(openOrder: ChromeSurfaceId[], zone: 'left' | 'right' | 'toolbar') {
  return openOrder.filter((surface) => !surface.startsWith(`${zone}:`))
}

function activate(
  openOrder: ChromeSurfaceId[],
  zone: 'left' | 'right' | 'toolbar',
  surface: ChromeSurfaceId | null,
) {
  const next = withoutZone(openOrder, zone)
  return surface ? [...next, surface] : next
}

function latestSideZone(openOrder: ChromeSurfaceId[]): 'left' | 'right' | null {
  for (let index = openOrder.length - 1; index >= 0; index -= 1) {
    const surface = openOrder[index]
    if (surface.startsWith('left:')) return 'left'
    if (surface.startsWith('right:')) return 'right'
  }
  return null
}

export function reduceChromeState(state: ChromeState, action: ChromeAction): ChromeState {
  switch (action.type) {
    case 'set-left':
      if (state.compactSidePanels && action.surface) {
        return {
          ...state,
          leftSurface: action.surface,
          rightSurface: null,
          openOrder: activate(withoutZone(state.openOrder, 'right'), 'left', `left:${action.surface}`),
        }
      }
      return {
        ...state,
        leftSurface: action.surface,
        openOrder: activate(
          state.openOrder,
          'left',
          action.surface ? `left:${action.surface}` : null,
        ),
      }
    case 'set-right':
      if (state.compactSidePanels && action.surface) {
        return {
          ...state,
          leftSurface: null,
          rightSurface: action.surface,
          openOrder: activate(withoutZone(state.openOrder, 'left'), 'right', `right:${action.surface}`),
        }
      }
      return {
        ...state,
        rightSurface: action.surface,
        openOrder: activate(
          state.openOrder,
          'right',
          action.surface ? `right:${action.surface}` : null,
        ),
      }
    case 'set-toolbar':
      return {
        ...state,
        toolbarSurface: action.surface,
        openOrder: activate(
          state.openOrder,
          'toolbar',
          action.surface ? `toolbar:${action.surface}` : null,
        ),
      }
    case 'set-compact-side-panels': {
      if (action.compact === state.compactSidePanels) return state
      if (!action.compact || !state.leftSurface || !state.rightSurface) {
        return { ...state, compactSidePanels: action.compact }
      }
      const keep = latestSideZone(state.openOrder) ?? 'right'
      const discard = keep === 'left' ? 'right' : 'left'
      return {
        ...state,
        leftSurface: keep === 'left' ? state.leftSurface : null,
        rightSurface: keep === 'right' ? state.rightSurface : null,
        compactSidePanels: true,
        openOrder: withoutZone(state.openOrder, discard),
      }
    }
    case 'close-latest': {
      const latest = state.openOrder.at(-1)
      if (!latest) return state
      const [zone] = latest.split(':')
      return {
        ...state,
        leftSurface: zone === 'left' ? null : state.leftSurface,
        rightSurface: zone === 'right' ? null : state.rightSurface,
        toolbarSurface: zone === 'toolbar' ? null : state.toolbarSurface,
        openOrder: state.openOrder.slice(0, -1),
      }
    }
    case 'close-all':
      return { ...INITIAL_CHROME_STATE, compactSidePanels: state.compactSidePanels }
  }
}

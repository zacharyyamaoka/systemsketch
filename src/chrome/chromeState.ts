export type LeftSurface = 'shapes' | 'files'
export type RightSurface = 'comments' | 'inspector' | 'board-overview'
export type ToolbarSurface = 'commands'

export type ChromeSurfaceId =
  | `left:${LeftSurface}`
  | `right:${RightSurface}`
  | `toolbar:${ToolbarSurface}`

export interface ChromeState {
  leftSurface: LeftSurface | null
  rightSurface: RightSurface | null
  toolbarSurface: ToolbarSurface | null
  openOrder: ChromeSurfaceId[]
}

export const INITIAL_CHROME_STATE: ChromeState = {
  leftSurface: null,
  rightSurface: null,
  toolbarSurface: null,
  openOrder: [],
}

export type ChromeAction =
  | { type: 'set-left'; surface: LeftSurface | null }
  | { type: 'set-right'; surface: RightSurface | null }
  | { type: 'set-toolbar'; surface: ToolbarSurface | null }
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

export function reduceChromeState(state: ChromeState, action: ChromeAction): ChromeState {
  switch (action.type) {
    case 'set-left':
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
      return INITIAL_CHROME_STATE
  }
}


import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from 'react'
import {
  INITIAL_CHROME_STATE,
  reduceChromeState,
  type ChromeState,
  type LeftSurface,
  type RightSurface,
  type ToolbarSurface,
} from './chromeState'
import { emitRecorderDiagnostic } from '../recorder/recorderEvents'
import { normalizeInterfaceScale, useInterfaceScale } from '../settings/interfaceScale'

interface ChromeController extends ChromeState {
  setLeft(surface: LeftSurface | null): void
  toggleLeft(surface: LeftSurface): void
  setRight(surface: RightSurface | null): void
  toggleRight(surface: RightSurface): void
  setToolbar(surface: ToolbarSurface | null): void
  toggleToolbar(surface: ToolbarSurface): void
  closeLatest(): void
  closeAll(): void
}

const ChromeContext = createContext<ChromeController | null>(null)
const COMPACT_SIDE_PANELS_BASE_WIDTH = 820

/**
 * CSS `zoom` makes a panel consume more physical viewport pixels without
 * changing media-query coordinates. Scale the breakpoint by the same factor
 * so the one-sheet rule still protects users who enlarge the interface.
 */
export function compactSidePanelsQuery(interfaceScale: number): string {
  const scaledWidth = Math.round(
    COMPACT_SIDE_PANELS_BASE_WIDTH * normalizeInterfaceScale(interfaceScale) / 100,
  )
  return `(max-width: ${scaledWidth}px)`
}

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduceChromeState, INITIAL_CHROME_STATE)
  const interfaceScale = useInterfaceScale()

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const media = window.matchMedia(compactSidePanelsQuery(interfaceScale))
    const sync = () => dispatch({ type: 'set-compact-side-panels', compact: media.matches })
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [interfaceScale])

  const setLeft = useCallback((surface: LeftSurface | null) => {
    emitRecorderDiagnostic({ lane: 'action', name: 'chrome-left', summary: surface ? `opened ${surface}` : 'closed left panel', detail: { zone: 'left', surface } })
    dispatch({ type: 'set-left', surface })
  }, [])
  const toggleLeft = useCallback((surface: LeftSurface) => {
    const next = state.leftSurface === surface ? null : surface
    emitRecorderDiagnostic({ lane: 'action', name: 'chrome-left', summary: next ? `opened ${next}` : 'closed left panel', detail: { zone: 'left', surface: next, toggle: true } })
    dispatch({
      type: 'set-left',
      surface: next,
    })
  }, [state.leftSurface])
  const setRight = useCallback((surface: RightSurface | null) => {
    emitRecorderDiagnostic({ lane: 'action', name: 'chrome-right', summary: surface ? `opened ${surface}` : 'closed right panel', detail: { zone: 'right', surface } })
    dispatch({ type: 'set-right', surface })
  }, [])
  const toggleRight = useCallback((surface: RightSurface) => {
    const next = state.rightSurface === surface ? null : surface
    emitRecorderDiagnostic({ lane: 'action', name: 'chrome-right', summary: next ? `opened ${next}` : 'closed right panel', detail: { zone: 'right', surface: next, toggle: true } })
    dispatch({
      type: 'set-right',
      surface: next,
    })
  }, [state.rightSurface])
  const setToolbar = useCallback((surface: ToolbarSurface | null) => {
    emitRecorderDiagnostic({ lane: 'action', name: 'chrome-toolbar', summary: surface ? `opened ${surface}` : 'closed command surface', detail: { zone: 'toolbar', surface } })
    dispatch({ type: 'set-toolbar', surface })
  }, [])
  const toggleToolbar = useCallback((surface: ToolbarSurface) => {
    const next = state.toolbarSurface === surface ? null : surface
    emitRecorderDiagnostic({ lane: 'action', name: 'chrome-toolbar', summary: next ? `opened ${next}` : 'closed command surface', detail: { zone: 'toolbar', surface: next, toggle: true } })
    dispatch({
      type: 'set-toolbar',
      surface: next,
    })
  }, [state.toolbarSurface])
  const closeLatest = useCallback(() => {
    emitRecorderDiagnostic({ lane: 'action', name: 'chrome-close-latest', summary: 'closed latest app surface' })
    dispatch({ type: 'close-latest' })
  }, [])
  const closeAll = useCallback(() => {
    emitRecorderDiagnostic({ lane: 'action', name: 'chrome-close-all', summary: 'closed all app surfaces' })
    dispatch({ type: 'close-all' })
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || state.openOrder.length === 0) return
      // The command dialog owns focus restoration and Escape while it is open.
      if (state.openOrder.at(-1)?.startsWith('toolbar:')) return
      event.preventDefault()
      event.stopPropagation()
      closeLatest()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [closeLatest, state.openOrder.length])

  const value = useMemo<ChromeController>(() => ({
    ...state,
    setLeft,
    toggleLeft,
    setRight,
    toggleRight,
    setToolbar,
    toggleToolbar,
    closeLatest,
    closeAll,
  }), [
    closeAll,
    closeLatest,
    setLeft,
    setRight,
    setToolbar,
    state,
    toggleLeft,
    toggleRight,
    toggleToolbar,
  ])

  return <ChromeContext.Provider value={value}>{children}</ChromeContext.Provider>
}

export function useChrome(): ChromeController {
  const chrome = useContext(ChromeContext)
  if (!chrome) throw new Error('SystemSketch chrome controls require ChromeProvider')
  return chrome
}

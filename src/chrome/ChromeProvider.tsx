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

export function ChromeProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduceChromeState, INITIAL_CHROME_STATE)

  const setLeft = useCallback((surface: LeftSurface | null) => {
    dispatch({ type: 'set-left', surface })
  }, [])
  const toggleLeft = useCallback((surface: LeftSurface) => {
    dispatch({
      type: 'set-left',
      surface: state.leftSurface === surface ? null : surface,
    })
  }, [state.leftSurface])
  const setRight = useCallback((surface: RightSurface | null) => {
    dispatch({ type: 'set-right', surface })
  }, [])
  const toggleRight = useCallback((surface: RightSurface) => {
    dispatch({
      type: 'set-right',
      surface: state.rightSurface === surface ? null : surface,
    })
  }, [state.rightSurface])
  const setToolbar = useCallback((surface: ToolbarSurface | null) => {
    dispatch({ type: 'set-toolbar', surface })
  }, [])
  const toggleToolbar = useCallback((surface: ToolbarSurface) => {
    dispatch({
      type: 'set-toolbar',
      surface: state.toolbarSurface === surface ? null : surface,
    })
  }, [state.toolbarSurface])
  const closeLatest = useCallback(() => dispatch({ type: 'close-latest' }), [])
  const closeAll = useCallback(() => dispatch({ type: 'close-all' }), [])

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

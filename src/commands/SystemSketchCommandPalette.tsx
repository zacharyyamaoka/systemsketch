import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react'
import { EditorPortal, useEditor, useValue } from 'tldraw'

import {
  boardSearchFieldLabel,
  boardSearchMatchSnippet,
  focusBoardSearchMatch,
  replaceAllBoardMatches,
  replaceBoardMatch,
  searchBoard,
  type BoardSearchMatch,
  type BoardSearchOptions,
} from './boardSearch'
import {
  commandPaletteActionDisabled,
  filterCommandPaletteActions,
  nextPaletteIndex,
  type CommandPaletteAction,
  type CommandPaletteMode,
} from './commandModel'
import './commands.css'
import { recordSemanticAction } from '../recorder/recorderEvents'

export interface SystemSketchCommandPaletteProps {
  actions?: readonly CommandPaletteAction[]
  initialMode?: CommandPaletteMode
  readOnly?: boolean
  onClose(): void
  onModeChange?(mode: CommandPaletteMode): void
  onError?(error: unknown): void
}

/** The tabs, in the order the arrow keys walk them. */
const PALETTE_MODES: ReadonlyArray<{ mode: CommandPaletteMode; label: string }> = [
  { mode: 'commands', label: 'Commands' },
  { mode: 'find-replace', label: 'Find' },
]

function focusableElements(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  )].filter((element) =>
    element.tabIndex >= 0
    && !element.hidden
    && element.getAttribute('aria-hidden') !== 'true',
  )
}

function replacementBlockerLabel(match: BoardSearchMatch): string | null {
  switch (match.replaceBlocker) {
    case 'locked': return 'Locked shape'
    case 'unsupported-field': return 'This shape exposes search, but not safe replacement'
    case 'format-boundary': return 'Match crosses formatting; replacement is disabled'
    default: return null
  }
}

function MatchText({ match }: { match: BoardSearchMatch }) {
  const snippet = boardSearchMatchSnippet(match)
  return (
    <span className="systemsketch-command-palette__snippet">
      {snippet.before}<mark>{snippet.found}</mark>{snippet.after}
    </span>
  )
}

export function SystemSketchCommandPalette({
  actions = [],
  initialMode = 'commands',
  readOnly,
  onClose,
  onModeChange,
  onError,
}: SystemSketchCommandPaletteProps) {
  const editor = useEditor()
  const [mode, setMode] = useState<CommandPaletteMode>(initialMode)
  const [commandQuery, setCommandQuery] = useState('')
  const [findQuery, setFindQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [options, setOptions] = useState<BoardSearchOptions>({})
  const [activeIndex, setActiveIndex] = useState(0)
  const [status, setStatus] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const queryRef = useRef<HTMLInputElement>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const listboxId = useId()
  const headingId = useId()
  const panelId = useId()
  const modeRefs = useRef<Partial<Record<CommandPaletteMode, HTMLButtonElement | null>>>({})

  const filteredActions = useMemo(
    () => filterCommandPaletteActions(actions, commandQuery),
    [actions, commandQuery],
  )
  const matches = useValue(
    'SystemSketch board find results',
    () => searchBoard(editor, findQuery, options),
    [editor, findQuery, options.matchCase, options.wholeWord],
  )
  const editorIsReadOnly = useValue(
    'SystemSketch command palette read-only state',
    () => readOnly ?? editor.getIsReadonly(),
    [editor, readOnly],
  )
  const visibleItems = mode === 'commands' ? filteredActions : matches
  const activeItem = visibleItems[activeIndex]

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const keepFocusInside = (event: FocusEvent) => {
      const root = rootRef.current
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        queryRef.current?.focus()
      }
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onCloseRef.current()
    }
    window.addEventListener('focusin', keepFocusInside, true)
    window.addEventListener('keydown', closeOnEscape, true)
    queryRef.current?.focus()
    return () => {
      window.removeEventListener('focusin', keepFocusInside, true)
      window.removeEventListener('keydown', closeOnEscape, true)
      previouslyFocused?.focus()
    }
  }, [])

  useEffect(() => {
    setMode(initialMode)
    setActiveIndex(0)
    setStatus('')
    queueMicrotask(() => {
      // The host's mode prop changes for two reasons: it opened the palette in
      // a mode, or the palette told it the mode moved. In the first case the
      // query field should take focus; in the second, focus is already
      // somewhere deliberate — on the tab the arrow keys are walking — and
      // yanking it into the input is what broke keyboard operation of the
      // tablist.
      if (document.activeElement?.closest('[role="tablist"]')) return
      queryRef.current?.focus()
    })
  }, [initialMode])

  useEffect(() => {
    setActiveIndex((current) => {
      if (visibleItems.length === 0) return -1
      return Math.max(0, Math.min(current, visibleItems.length - 1))
    })
  }, [visibleItems.length, mode, commandQuery, findQuery])

  /**
   * Left/Right (and Home/End) walk the tablist, which is what an ARIA tablist
   * promises and what this one did not do. Selection follows focus, the
   * pattern for a two-tab group whose panels are cheap to render.
   */
  const onModeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const index = PALETTE_MODES.findIndex((candidate) => candidate.mode === mode)
    let next = index
    if (event.key === 'ArrowLeft') next = (index - 1 + PALETTE_MODES.length) % PALETTE_MODES.length
    else if (event.key === 'ArrowRight') next = (index + 1) % PALETTE_MODES.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = PALETTE_MODES.length - 1
    else return
    event.preventDefault()
    event.stopPropagation()
    const target = PALETTE_MODES[next].mode
    setMode(target)
    setActiveIndex(0)
    setStatus('')
    onModeChange?.(target)
    // Focus stays on the tablist so the arrows keep working; the query input
    // is reached with Tab, unlike a click, which is a deliberate reach for it.
    queueMicrotask(() => modeRefs.current[target]?.focus())
  }

  const switchMode = (next: CommandPaletteMode) => {
    setMode(next)
    setActiveIndex(0)
    setStatus('')
    onModeChange?.(next)
    queueMicrotask(() => queryRef.current?.focus())
  }

  const runAction = async (action: CommandPaletteAction) => {
    if (commandPaletteActionDisabled(editor, action)) return
    try {
      await recordSemanticAction(action.id, action.label, () => action.run(editor), {
        surface: 'command-palette',
        selection: editor.getSelectedShapeIds(),
        tool: editor.getCurrentToolId(),
      })
      if (!action.keepOpen) onClose()
    } catch (error) {
      setStatus(`Could not run ${action.label}.`)
      onError?.(error)
    }
  }

  const navigateToMatch = (match: BoardSearchMatch) => {
    if (focusBoardSearchMatch(editor, match)) {
      setStatus('Selected result on the board.')
    } else {
      setStatus('That result is no longer on the board.')
    }
  }

  const replaceMatch = (match: BoardSearchMatch) => {
    if (editorIsReadOnly) return
    const result = replaceBoardMatch(editor, match, replacement)
    setStatus(result.ok ? 'Replaced 1 match.' : 'That match could not be replaced safely.')
  }

  const replaceAll = () => {
    if (editorIsReadOnly) return
    const result = replaceAllBoardMatches(editor, findQuery, replacement, options)
    setStatus(result.replacedCount > 0
      ? `Replaced ${result.replacedCount} ${result.replacedCount === 1 ? 'match' : 'matches'}${result.skippedCount ? `; skipped ${result.skippedCount}` : ''}.`
      : 'No matches changed.')
    // Replace All can disable the button that owns focus. Return focus to the
    // query before the browser falls back to the page behind this modal.
    queueMicrotask(() => queryRef.current?.focus())
  }

  const activateCurrent = () => {
    if (!activeItem) return
    if (mode === 'commands') {
      void runAction(activeItem as CommandPaletteAction)
    } else {
      navigateToMatch(activeItem as BoardSearchMatch)
    }
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key === 'Tab') {
      const root = rootRef.current
      if (!root) return
      const focusable = focusableElements(root)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const target = event.target as HTMLElement
      if (target.tagName !== 'INPUT' || target === queryRef.current) {
        event.preventDefault()
        setActiveIndex((current) => nextPaletteIndex(
          current,
          event.key === 'ArrowDown' ? 1 : -1,
          visibleItems.length,
        ))
      }
      return
    }
    if (event.key === 'Enter' && event.target === queryRef.current) {
      event.preventDefault()
      activateCurrent()
    }
  }

  const dismissBackdrop = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  const query = mode === 'commands' ? commandQuery : findQuery
  const activeDescendant = activeItem
    ? `${listboxId}-${mode === 'commands' ? (activeItem as CommandPaletteAction).id : (activeItem as BoardSearchMatch).id}`
    : undefined
  const replaceableCount = matches.filter((match) => match.replaceable).length

  return (
    // InFrontOfTheCanvas is a fixed stacking context below tldraw's panels.
    // A full-surface modal must use the stock portal seam to cover app chrome.
    <EditorPortal>
      <div
        ref={rootRef}
        className="systemsketch-command-palette__backdrop"
        data-testid="systemsketch-command-palette"
        onMouseDown={dismissBackdrop}
        onKeyDown={onKeyDown}
      >
      <section
        className="systemsketch-command-palette"
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
      >
        <header className="systemsketch-command-palette__header">
          <h2 id={headingId}>{mode === 'commands' ? 'Commands' : 'Find & replace'}</h2>
          <div
            className="systemsketch-command-palette__modes"
            role="tablist"
            aria-label="Palette mode"
            onKeyDown={onModeKeyDown}
          >
            {PALETTE_MODES.map((candidate) => (
              <button
                key={candidate.mode}
                type="button"
                role="tab"
                id={`${panelId}-tab-${candidate.mode}`}
                aria-selected={mode === candidate.mode}
                aria-controls={panelId}
                /* Roving tabindex: a tablist is ONE tab stop, and the arrow
                   keys move within it. Both tabs used to be `tabIndex={0}`,
                   so Tab walked into the group and the arrows did nothing. */
                tabIndex={mode === candidate.mode ? 0 : -1}
                data-mode={candidate.mode}
                ref={(element) => { modeRefs.current[candidate.mode] = element }}
                onClick={() => switchMode(candidate.mode)}
              >{candidate.label}</button>
            ))}
          </div>
          <button type="button" className="systemsketch-command-palette__close" aria-label="Close command palette" onClick={onClose}>×</button>
        </header>

        <div
          id={panelId}
          role="tabpanel"
          aria-labelledby={`${panelId}-tab-${mode}`}
          className="systemsketch-command-palette__panel"
        >
        <label className="systemsketch-command-palette__search">
          <span aria-hidden="true">⌕</span>
          <span className="systemsketch-command-palette__visually-hidden">
            {mode === 'commands' ? 'Search commands' : 'Find on board'}
          </span>
          <input
            ref={queryRef}
            value={query}
            aria-label={mode === 'commands' ? 'Search commands' : 'Find on board'}
            placeholder={mode === 'commands' ? 'Type a command…' : 'Find text on the board…'}
            aria-controls={listboxId}
            aria-activedescendant={activeDescendant}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              if (mode === 'commands') setCommandQuery(event.currentTarget.value)
              else setFindQuery(event.currentTarget.value)
              setStatus('')
            }}
          />
          <kbd>Esc</kbd>
        </label>

        {mode === 'find-replace' ? (
          <div className="systemsketch-command-palette__replace-controls">
            <label className="systemsketch-command-palette__replace-input">
              <span className="systemsketch-command-palette__visually-hidden">Replace with</span>
              <input
                value={replacement}
                aria-label="Replace with"
                placeholder="Replace with…"
                disabled={editorIsReadOnly}
                onChange={(event) => {
                  setReplacement(event.currentTarget.value)
                  setStatus('')
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && activeItem) {
                    event.preventDefault()
                    replaceMatch(activeItem as BoardSearchMatch)
                  }
                }}
              />
            </label>
            <button
              type="button"
              disabled={editorIsReadOnly || !activeItem || !(activeItem as BoardSearchMatch).replaceable}
              onClick={() => activeItem && replaceMatch(activeItem as BoardSearchMatch)}
            >Replace</button>
            <button
              type="button"
              disabled={editorIsReadOnly || replaceableCount === 0}
              onClick={replaceAll}
            >All</button>
            <label className="systemsketch-command-palette__toggle" title="Match case">
              <input
                type="checkbox"
                checked={Boolean(options.matchCase)}
                onChange={(event) => setOptions((current) => ({ ...current, matchCase: event.currentTarget.checked }))}
              /> Aa
            </label>
            <label className="systemsketch-command-palette__toggle" title="Match whole words">
              <input
                type="checkbox"
                checked={Boolean(options.wholeWord)}
                onChange={(event) => setOptions((current) => ({ ...current, wholeWord: event.currentTarget.checked }))}
              /> Word
            </label>
          </div>
        ) : null}

        <div className="systemsketch-command-palette__summary" aria-live="polite">
          {mode === 'commands'
            ? `${filteredActions.length} ${filteredActions.length === 1 ? 'command' : 'commands'}`
            : findQuery
              ? `${matches.length} ${matches.length === 1 ? 'match' : 'matches'} across the board`
              : 'Searches the board; hidden shapes stay hidden'}
        </div>

        <ul id={listboxId} className="systemsketch-command-palette__results" role="listbox" aria-label={mode === 'commands' ? 'Commands' : 'Board matches'}>
          {mode === 'commands' ? filteredActions.map((action, index) => {
            const disabled = commandPaletteActionDisabled(editor, action)
            return (
              <li key={action.id} role="presentation">
                <button
                  id={`${listboxId}-${action.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  aria-disabled={disabled}
                  disabled={disabled}
                  tabIndex={-1}
                  data-active={index === activeIndex || undefined}
                  data-command-id={action.id}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => void runAction(action)}
                >
                  <span className="systemsketch-command-palette__glyph" aria-hidden="true">{action.icon ?? '›'}</span>
                  <span className="systemsketch-command-palette__label">
                    <strong>{action.label}</strong>
                    {action.description ? <small>{action.description}</small> : null}
                  </span>
                  {action.shortcut ? <kbd>{action.shortcut}</kbd> : null}
                </button>
              </li>
            )
          }) : matches.map((match, index) => {
            const blocker = replacementBlockerLabel(match)
            return (
              <li key={match.id} role="presentation" className="systemsketch-command-palette__match-row">
                <button
                  id={`${listboxId}-${match.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  data-active={index === activeIndex || undefined}
                  data-shape-id={match.shapeId}
                  data-page-id={match.pageId}
                  data-search-field={match.field}
                  data-replaceable={match.replaceable}
                  tabIndex={-1}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => navigateToMatch(match)}
                >
                  <span className="systemsketch-command-palette__glyph" aria-hidden="true">⌖</span>
                  <span className="systemsketch-command-palette__label">
                    <span><strong>{match.pageName}</strong> · {boardSearchFieldLabel(match.field)}</span>
                    <MatchText match={match} />
                    {blocker ? <small>{blocker}</small> : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        {visibleItems.length === 0 ? (
          <div className="systemsketch-command-palette__empty" role="status">
            <strong>{query ? 'No results' : mode === 'commands' ? 'No commands available' : 'Type to search the board'}</strong>
            <span>{query ? 'Try a shorter or less specific search.' : 'Results include text from the whole board.'}</span>
          </div>
        ) : null}

        </div>

        <footer className="systemsketch-command-palette__footer">
          <span role="status" aria-live="polite">{status}</span>
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate · <kbd>Enter</kbd> Open</span>
        </footer>
      </section>
      </div>
    </EditorPortal>
  )
}

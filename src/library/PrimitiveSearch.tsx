import {
  TldrawUiButtonIcon,
  TldrawUiInput,
  useEditor,
} from 'tldraw'
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'

import { useChrome } from '../chrome/ChromeProvider'
import {
  SHAPE_LIBRARY_ITEMS,
  filterShapeLibraryItems,
  insertShapeLibraryItemAtPoint,
  type ShapeLibraryItem,
  type ShapeLibraryPoint,
} from './shapeLibraryModel'
import {
  PRIMITIVE_SEARCH_MAX_RESULTS,
  PRIMITIVE_SEARCH_WIDTH,
  isChromeShortcutTarget,
  isEditableShortcutTarget,
  isPrimitiveSearchKey,
  nextPrimitiveSearchIndex,
  placePrimitiveSearch,
  primitiveSearchPanelHeight,
  type PrimitiveSearchPoint,
} from './primitiveSearchModel'
import './primitive-search.css'

interface PrimitiveSearchInvocation {
  screenPoint: PrimitiveSearchPoint
  pagePoint: ShapeLibraryPoint
}

function toolbarObstacleTop(editorContainer: HTMLElement, viewportHeight: number): number {
  const toolbarButton = document.querySelector<HTMLElement>('[data-testid="systemsketch-tool-library"]')
  const toolbar = toolbarButton?.closest<HTMLElement>('.tlui-main-toolbar') ?? toolbarButton
  if (!toolbar) return viewportHeight
  const containerBounds = editorContainer.getBoundingClientRect()
  const toolbarBounds = toolbar.getBoundingClientRect()
  const top = toolbarBounds.top - containerBounds.top
  return top > 0 && top < viewportHeight ? top : viewportHeight
}

function ResultRow({
  active,
  item,
  onActivate,
  onInsert,
}: {
  active: boolean
  item: ShapeLibraryItem
  onActivate(): void
  onInsert(): void
}) {
  return (
    <li role="presentation">
      <button
        id={`systemsketch-primitive-search-option-${item.id}`}
        type="button"
        role="option"
        aria-selected={active}
        className="systemsketch-primitive-search__result"
        data-active={active || undefined}
        data-library-item={item.id}
        data-testid={`systemsketch-primitive-search-${item.id}`}
        onPointerMove={onActivate}
        onFocus={onActivate}
        onClick={onInsert}
      >
        <span className="systemsketch-primitive-search__icon" aria-hidden="true">
          <TldrawUiButtonIcon icon={item.icon} />
        </span>
        <span className="systemsketch-primitive-search__copy">
          <strong>{item.label}</strong>
          <small>{item.section}</small>
        </span>
        {active ? <kbd>Enter</kbd> : null}
      </button>
    </li>
  )
}

/**
 * A primitive-only sibling to the command palette, anchored to the pointer.
 *
 * WHY: S is about putting one catalog object where the user is already
 * looking. Reusing the centred command modal would preserve code, but it would
 * destroy the Fusion-style spatial promise and reintroduce unrelated commands.
 */
export function PrimitiveSearch() {
  const editor = useEditor()
  const { toolbarSurface } = useChrome()
  const [invocation, setInvocation] = useState<PrimitiveSearchInvocation | null>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [layoutRevision, setLayoutRevision] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  const matches = useMemo(
    () => query.trim() ? filterShapeLibraryItems(query) : [],
    [query],
  )
  const visibleMatches = matches.slice(0, PRIMITIVE_SEARCH_MAX_RESULTS)
  const activeItem = visibleMatches[activeIndex]

  const close = useCallback(() => {
    setInvocation(null)
    setQuery('')
    setActiveIndex(0)
    editor.focus()
  }, [editor])

  const insert = useCallback((item: ShapeLibraryItem) => {
    if (!invocation) return
    insertShapeLibraryItemAtPoint(editor, item, invocation.pagePoint)
    close()
  }, [close, editor, invocation])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (invocation || toolbarSurface || !isPrimitiveSearchKey(event)) return
      if (!editor.getIsFocused() || editor.getIsReadonly()) return
      if (editor.getEditingShapeId() || editor.inputs.getIsDragging()) return
      if (editor.menus.getOpenMenus().length > 0) return
      if (isEditableShortcutTarget(event.target) || isEditableShortcutTarget(document.activeElement)) return
      if (isChromeShortcutTarget(event.target) || isChromeShortcutTarget(document.activeElement)) return

      event.preventDefault()
      event.stopImmediatePropagation()
      const screenPoint = editor.inputs.getCurrentScreenPoint()
      const pagePoint = editor.inputs.getCurrentPagePoint()
      setQuery('')
      setActiveIndex(0)
      setInvocation({
        screenPoint: { x: screenPoint.x, y: screenPoint.y },
        pagePoint: { x: pagePoint.x, y: pagePoint.y },
      })
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [editor, invocation, toolbarSurface])

  useEffect(() => {
    if (!invocation) return
    const focus = () => inputRef.current?.focus({ preventScroll: true })
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) close()
    }
    const relayout = () => setLayoutRevision((current) => current + 1)
    editor.timers.requestAnimationFrame(focus)
    window.addEventListener('pointerdown', dismissOutside, true)
    window.addEventListener('resize', relayout)
    return () => {
      window.removeEventListener('pointerdown', dismissOutside, true)
      window.removeEventListener('resize', relayout)
    }
  }, [close, editor, invocation])

  useEffect(() => {
    setActiveIndex(matches.length > 0 ? 0 : -1)
  }, [matches.length, query])

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.setAttribute('role', 'combobox')
    input.setAttribute('aria-autocomplete', 'list')
    input.setAttribute('aria-expanded', 'true')
    input.setAttribute('aria-controls', listboxId)
    if (activeItem) input.setAttribute('aria-activedescendant', `systemsketch-primitive-search-option-${activeItem.id}`)
    else input.removeAttribute('aria-activedescendant')
  }, [activeItem, listboxId])

  const onKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      event.stopPropagation()
      setActiveIndex((current) => nextPrimitiveSearchIndex(
        current,
        event.key === 'ArrowDown' ? 1 : -1,
        visibleMatches.length,
      ))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      if (activeItem) insert(activeItem)
    }
  }

  if (!invocation) return null

  const viewport = editor.getViewportScreenBounds()
  const desiredHeight = primitiveSearchPanelHeight(matches.length)
  const placement = placePrimitiveSearch(
    invocation.screenPoint,
    { w: PRIMITIVE_SEARCH_WIDTH, h: desiredHeight },
    { w: viewport.w, h: viewport.h },
    toolbarObstacleTop(editor.getContainer(), viewport.h),
  )
  void layoutRevision

  return (
    <>
      <span
        className="systemsketch-primitive-search__target"
        style={{ left: invocation.screenPoint.x, top: invocation.screenPoint.y }}
        aria-hidden="true"
      />
      <div
        ref={rootRef}
        className="systemsketch-primitive-search"
        data-testid="systemsketch-primitive-search"
        data-horizontal={placement.horizontal}
        data-vertical={placement.vertical}
        data-systemsketch-chrome
        role="search"
        aria-label="Search primitive library"
        style={{ left: placement.x, top: placement.y, width: placement.w, maxHeight: placement.h }}
        onKeyDownCapture={onKeyDownCapture}
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="systemsketch-primitive-search__field">
          <span className="systemsketch-primitive-search__key" aria-hidden="true">S</span>
          <TldrawUiInput
            ref={inputRef}
            className="systemsketch-primitive-search__input"
            aria-label="Search primitives"
            autoFocus
            placeholder={`Search ${SHAPE_LIBRARY_ITEMS.length} primitives`}
            value={query}
            onValueChange={setQuery}
            onCancel={close}
          />
          <kbd>Esc</kbd>
        </div>

        {visibleMatches.length > 0 ? (
          <>
            <ul
              id={listboxId}
              className="systemsketch-primitive-search__results"
              role="listbox"
              aria-label="Matching primitives"
            >
              {visibleMatches.map((item, index) => (
                <ResultRow
                  key={item.id}
                  item={item}
                  active={index === activeIndex}
                  onActivate={() => setActiveIndex(index)}
                  onInsert={() => insert(item)}
                />
              ))}
            </ul>
            <footer className="systemsketch-primitive-search__footer">
              <span>{matches.length} {matches.length === 1 ? 'primitive' : 'primitives'}</span>
              <span><kbd>↑</kbd><kbd>↓</kbd> choose <i>·</i> <kbd>Enter</kbd> place</span>
            </footer>
          </>
        ) : (
          <div className="systemsketch-primitive-search__empty" role="status">
            {query.trim() ? (
              <><strong>No matching primitives</strong><span>Try arrow, rectangle, decision, or cloud.</span></>
            ) : (
              <><strong>Primitive library</strong><span>Type a shape or connection name.</span></>
            )}
          </div>
        )}
      </div>
    </>
  )
}

/**
 * The pointer-anchored search modal, with nothing shape-specific left in it.
 *
 * WHY the split runs here and not somewhere tidier: the panel's HEIGHT depends
 * on how many rows matched, and its PLACEMENT depends on that height, so the
 * owner of the query is necessarily the owner of the placement. The caller
 * therefore keeps `query`, does its own filtering, and computes the placement;
 * this component keeps the cursor, the keyboard contract and the chrome. Trying
 * to move query state in here made the modal ask its parent to re-place it on
 * every keystroke, which is the same coupling with an extra round trip.
 *
 * `primitiveSearchModel.ts` is untouched — it was already pure and generic.
 */
import { TldrawUiInput, useEditor } from 'tldraw'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react'

import { SCROLL_AREA_CLASS } from '../scroll/ScrollArea'
import {
  PRIMITIVE_SEARCH_MAX_RESULTS,
  nextPrimitiveSearchIndex,
  type PrimitiveSearchPlacement,
  type PrimitiveSearchPoint,
} from './primitiveSearchModel'
import './primitive-search.css'

export interface LibrarySearchItem {
  id: string
  label: string
  /** The line under the label: a section, a kind, a one-line description. */
  detail: string
  /**
   * `icon` is a ReactNode, not an icon name: shapes wrap a tldraw icon string
   * in `TldrawUiButtonIcon`, behaviours draw a lucide glyph or a stroked
   * control mark. A string would have forced one registry on both.
   */
  icon: ReactNode
  /** Personal vocabulary that also matched, shown after a `↪`. */
  aliases?: readonly string[]
}

export interface LibrarySearchModalProps {
  /** Every match, unsliced; the modal shows the first `maxResults` and counts them all. */
  items: readonly LibrarySearchItem[]
  query: string
  onQueryChange(query: string): void
  maxResults?: number
  /** Screen point the search is anchored to — a dot is drawn there. */
  target: PrimitiveSearchPoint
  placement: PrimitiveSearchPlacement
  /** Chrome zoom, which is cancelled at the host before painting around `target`. */
  viewportScale?: number
  /** The key that opened it, shown as a chip in the field. */
  keyChip: string
  ariaLabel: string
  /** The listbox's own label, e.g. "Matching primitives". */
  listAriaLabel: string
  inputAriaLabel: string
  placeholder: string
  /** Footer copy: `{n} {noun} · ↑ ↓ choose · Enter {verb}`. */
  noun: { one: string; many: string }
  verb: string
  idleTitle: string
  idleHint: string
  emptyTitle: string
  emptyHint: string
  itemAriaLabel?(item: LibrarySearchItem): string
  /**
   * Root and row test ids, and the `aria-activedescendant` option ids.
   * Defaults to the id `primitive_search_smoke.mjs` pins.
   */
  testIdPrefix?: string
  onChoose(item: LibrarySearchItem): void
  onClose(): void
}

function ResultRow({
  active,
  item,
  ariaLabel,
  optionId,
  testId,
  onActivate,
  onChoose,
}: {
  active: boolean
  item: LibrarySearchItem
  ariaLabel: string
  optionId: string
  testId: string
  onActivate(): void
  onChoose(): void
}) {
  const aliases = item.aliases ?? []
  return (
    <li role="presentation">
      <button
        id={optionId}
        type="button"
        role="option"
        aria-selected={active}
        aria-label={ariaLabel}
        className="systemsketch-primitive-search__result"
        data-active={active || undefined}
        data-library-item={item.id}
        data-testid={testId}
        onPointerMove={onActivate}
        onFocus={onActivate}
        onClick={onChoose}
      >
        <span className="systemsketch-primitive-search__icon" aria-hidden="true">{item.icon}</span>
        <span className="systemsketch-primitive-search__copy">
          <strong>{item.label}</strong>
          <small>
            {item.detail}
            {aliases.length > 0 ? <span className="systemsketch-primitive-search__aliases"><span aria-hidden="true">↪</span>{aliases.join(' · ')}</span> : null}
          </small>
        </span>
        {active ? <kbd>Enter</kbd> : null}
      </button>
    </li>
  )
}

export function LibrarySearchModal({
  items,
  query,
  onQueryChange,
  maxResults = PRIMITIVE_SEARCH_MAX_RESULTS,
  target,
  placement,
  viewportScale = 1,
  keyChip,
  ariaLabel,
  listAriaLabel,
  inputAriaLabel,
  placeholder,
  noun,
  verb,
  idleTitle,
  idleHint,
  emptyTitle,
  emptyHint,
  itemAriaLabel,
  testIdPrefix = 'systemsketch-primitive-search',
  onChoose,
  onClose,
}: LibrarySearchModalProps) {
  const editor = useEditor()
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listboxId = useId()

  const visible = items.slice(0, maxResults)
  const activeItem = visible[activeIndex]
  const optionId = (id: string) => `${testIdPrefix}-option-${id}`

  const close = useCallback(() => {
    onClose()
  }, [onClose])

  useEffect(() => {
    const focus = () => inputRef.current?.focus({ preventScroll: true })
    const dismissOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) close()
    }
    editor.timers.requestAnimationFrame(focus)
    window.addEventListener('pointerdown', dismissOutside, true)
    return () => window.removeEventListener('pointerdown', dismissOutside, true)
  }, [close, editor])

  useEffect(() => {
    setActiveIndex(items.length > 0 ? 0 : -1)
  }, [items.length, query])

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.setAttribute('role', 'combobox')
    input.setAttribute('aria-autocomplete', 'list')
    input.setAttribute('aria-expanded', 'true')
    input.setAttribute('aria-controls', listboxId)
    if (activeItem) input.setAttribute('aria-activedescendant', `${testIdPrefix}-option-${activeItem.id}`)
    else input.removeAttribute('aria-activedescendant')
  }, [activeItem, listboxId, testIdPrefix])

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
        visible.length,
      ))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      if (activeItem) onChoose(activeItem)
    }
  }

  return (
    <>
      <span
        className="systemsketch-primitive-search__target"
        style={{
          '--systemsketch-library-search-target-x': `${target.x}px`,
          '--systemsketch-library-search-target-y': `${target.y}px`,
        } as CSSProperties}
        aria-hidden="true"
      />
      <div
        ref={rootRef}
        className="systemsketch-primitive-search"
        data-testid={testIdPrefix}
        data-horizontal={placement.horizontal}
        data-vertical={placement.vertical}
        data-systemsketch-chrome
        role="search"
        aria-label={ariaLabel}
        style={{
          '--systemsketch-library-search-x': `${placement.x}px`,
          '--systemsketch-library-search-y': `${placement.y}px`,
          width: placement.w / viewportScale,
          maxHeight: placement.h / viewportScale,
        } as CSSProperties}
        onKeyDownCapture={onKeyDownCapture}
        onPointerDown={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <div className="systemsketch-primitive-search__field">
          <span className="systemsketch-primitive-search__key" aria-hidden="true">{keyChip}</span>
          <TldrawUiInput
            ref={inputRef}
            className="systemsketch-primitive-search__input"
            aria-label={inputAriaLabel}
            autoFocus
            placeholder={placeholder}
            value={query}
            onValueChange={onQueryChange}
            onCancel={close}
          />
          <kbd>Esc</kbd>
        </div>

        {visible.length > 0 ? (
          <>
            <ul
              id={listboxId}
              className={`${SCROLL_AREA_CLASS} systemsketch-primitive-search__results`}
              role="listbox"
              aria-label={listAriaLabel}
            >
              {visible.map((item, index) => (
                <ResultRow
                  key={item.id}
                  item={item}
                  ariaLabel={itemAriaLabel ? itemAriaLabel(item) : item.label}
                  optionId={optionId(item.id)}
                  testId={`${testIdPrefix}-${item.id}`}
                  active={index === activeIndex}
                  onActivate={() => setActiveIndex(index)}
                  onChoose={() => onChoose(item)}
                />
              ))}
            </ul>
            <footer className="systemsketch-primitive-search__footer">
              <span>{items.length} {items.length === 1 ? noun.one : noun.many}</span>
              <span><kbd>↑</kbd><kbd>↓</kbd> choose <i>·</i> <kbd>Enter</kbd> {verb}</span>
            </footer>
          </>
        ) : (
          <div className="systemsketch-primitive-search__empty" role="status">
            {query.trim() ? (
              <><strong>{emptyTitle}</strong><span>{emptyHint}</span></>
            ) : (
              <><strong>{idleTitle}</strong><span>{idleHint}</span></>
            )}
          </div>
        )}
      </div>
    </>
  )
}

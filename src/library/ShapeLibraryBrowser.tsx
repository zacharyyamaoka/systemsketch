import { TldrawUiButtonIcon, TldrawUiInput, useEditor, type TLShapeId } from 'tldraw'
import { useEffect, useMemo, useState } from 'react'
import {
  SHAPE_LIBRARY_ITEMS,
  SHAPE_LIBRARY_RECENTS_EVENT,
  SHAPE_LIBRARY_RECENTS_KEY,
  SHAPE_LIBRARY_SECTIONS,
  filterShapeLibraryItems,
  insertShapeLibraryItem,
  readShapeLibraryRecentIds,
  shapeLibraryItemById,
  type ShapeLibraryItem,
  type ShapeLibrarySection,
} from './shapeLibraryModel'
import './shape-library.css'

interface ShapeLibraryBrowserProps {
  autoFocus?: boolean
  className?: string
  onCancel?(): void
  onInserted?(item: ShapeLibraryItem, shapeId: TLShapeId): void
}

type BrowserSection = 'Recents' | ShapeLibrarySection

const DEFAULT_OPEN_SECTIONS: Record<BrowserSection, boolean> = {
  Recents: true,
  Connections: true,
  Basic: true,
  Flowchart: true,
}

function useShapeLibraryRecents(): string[] {
  const [recentIds, setRecentIds] = useState(readShapeLibraryRecentIds)

  useEffect(() => {
    const onRecents = (event: Event) => {
      if (event instanceof CustomEvent && Array.isArray(event.detail)) {
        setRecentIds(event.detail)
      } else {
        setRecentIds(readShapeLibraryRecentIds())
      }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === SHAPE_LIBRARY_RECENTS_KEY) setRecentIds(readShapeLibraryRecentIds())
    }
    window.addEventListener(SHAPE_LIBRARY_RECENTS_EVENT, onRecents)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(SHAPE_LIBRARY_RECENTS_EVENT, onRecents)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  return recentIds
}

function LibraryTile({
  item,
  section,
  onInsert,
}: {
  item: ShapeLibraryItem
  section: BrowserSection
  onInsert(item: ShapeLibraryItem): void
}) {
  return (
    <button
      type="button"
      className="systemsketch-library-tile"
      title={`Insert ${item.label}`}
      aria-label={`Insert ${item.label}`}
      data-library-item={item.id}
      data-library-section={section}
      data-testid={`systemsketch-library-${item.id}`}
      onClick={() => onInsert(item)}
    >
      <TldrawUiButtonIcon icon={item.icon} />
      <span>{item.label}</span>
    </button>
  )
}

export function ShapeLibraryBrowser({
  autoFocus = false,
  className = '',
  onCancel,
  onInserted,
}: ShapeLibraryBrowserProps) {
  const editor = useEditor()
  const recentIds = useShapeLibraryRecents()
  const [query, setQuery] = useState('')
  const [openSections, setOpenSections] = useState(DEFAULT_OPEN_SECTIONS)
  const normalizedQuery = query.trim()
  const matches = useMemo(() => filterShapeLibraryItems(query), [query])
  const recents = useMemo(
    () => recentIds.map(shapeLibraryItemById).filter((item): item is ShapeLibraryItem => Boolean(item)),
    [recentIds],
  )

  useEffect(() => {
    if (!normalizedQuery) return
    setOpenSections((current) => ({
      ...current,
      Connections: true,
      Basic: true,
      Flowchart: true,
    }))
  }, [normalizedQuery])

  const insert = (item: ShapeLibraryItem) => {
    const shapeId = insertShapeLibraryItem(editor, item)
    setQuery('')
    onInserted?.(item, shapeId)
  }

  const toggleSection = (section: BrowserSection) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }))
  }

  const sections: Array<{ name: BrowserSection; items: readonly ShapeLibraryItem[] }> = normalizedQuery
    ? SHAPE_LIBRARY_SECTIONS.map((name) => ({
        name,
        items: matches.filter((item) => item.section === name),
      }))
    : [
        { name: 'Recents', items: recents },
        ...SHAPE_LIBRARY_SECTIONS.map((name) => ({
          name,
          items: SHAPE_LIBRARY_ITEMS.filter((item) => item.section === name),
        })),
      ]

  return (
    <div className={`systemsketch-library-browser ${className}`.trim()}>
      <TldrawUiInput
        autoFocus={autoFocus}
        autoSelect={autoFocus}
        className="systemsketch-library-search"
        aria-label="Search shapes"
        placeholder="Search shapes"
        value={query}
        onValueChange={setQuery}
        onCancel={onCancel}
      />
      <div className="systemsketch-library-panel__body">
        {sections.map(({ name, items }) => {
          if (normalizedQuery && items.length === 0) return null
          const isOpen = openSections[name]
          return (
            <section key={name} data-library-section={name}>
              <h3>
                <button
                  type="button"
                  className="systemsketch-library-section-toggle"
                  aria-expanded={isOpen}
                  data-testid={`systemsketch-library-section-${name.toLowerCase()}`}
                  onClick={() => toggleSection(name)}
                >
                  <span>{name}</span>
                  <span className="systemsketch-library-section-toggle__count">{items.length}</span>
                  <span className="systemsketch-library-section-toggle__chevron" aria-hidden="true">⌄</span>
                </button>
              </h3>
              {isOpen ? (
                items.length > 0 ? (
                  <div className="systemsketch-library-grid">
                    {items.map((item) => (
                      <LibraryTile key={`${name}:${item.id}`} item={item} section={name} onInsert={insert} />
                    ))}
                  </div>
                ) : (
                  <p className="systemsketch-library-recents-empty">
                    Shapes you insert will stay one click away here.
                  </p>
                )
              ) : null}
            </section>
          )
        })}
        {normalizedQuery && matches.length === 0 ? (
          <div className="systemsketch-library-empty" role="status">
            <TldrawUiButtonIcon icon="question-mark-circle" />
            <strong>No matching shapes</strong>
            <span>Try rectangle, decision, arrow, or cloud.</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

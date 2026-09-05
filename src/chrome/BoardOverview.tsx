import { useEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { useEditor, useValue } from 'tldraw'
import { addBoardLandmark, focusBoardLandmark, removeBoardLandmark, renameBoardLandmark, suggestedLandmarkName } from '../landmarks/boardLandmarks'
import { focusBoardOverviewTarget } from './boardOverviewModel'
import { getFramesPanelModel, getFramesPanelPreviews, moveFramesPanelItemKey, reorderFramesPanelItems, type FramesPanelDropPosition, type FramesPanelItem, type FramesPanelPreview } from './framesPanelModel'

type ViewMode = 'cards' | 'list'
type DropTarget = { key: string; position: FramesPanelDropPosition } | null

const itemName = (item: FramesPanelItem) => item.kind === 'landmark' ? item.landmark.name : item.target.label
const iconFor = (item: FramesPanelItem) => item.kind === 'landmark' ? '⌖' : item.target.kind === 'frame' ? '▣' : item.target.kind === 'branch' ? '⑂' : '▤'

function focusItem(editor: ReturnType<typeof useEditor>, item: FramesPanelItem) {
  return item.kind === 'landmark' ? focusBoardLandmark(editor, item.landmark.id) : focusBoardOverviewTarget(editor, item.target)
}

function renameItem(editor: ReturnType<typeof useEditor>, item: FramesPanelItem, raw: string) {
  if (item.kind === 'landmark') return renameBoardLandmark(editor, item.landmark.id, raw).ok
  const shape = editor.getShape(item.target.id)
  if (!shape) return false
  const property = item.target.kind === 'frame' ? 'name' : 'title'
  // Frame/region labels use their native empty/default semantics. Landmarks
  // are the only names with a separate persisted identity contract.
  const props = shape.props as Record<string, unknown>
  if (props[property] === raw) return false
  editor.markHistoryStoppingPoint('rename frame panel item')
  editor.updateShape({ id: shape.id, type: shape.type, props: { ...props, [property]: raw } } as never)
  return true
}

function landmarkFailureMessage() {
  return 'Saved-view names must be distinct and contain 1–80 characters.'
}

function clip(box: { x: number; y: number; w: number; h: number }, viewport: { x: number; y: number; w: number; h: number }) {
  const left = Math.max(box.x, viewport.x); const top = Math.max(box.y, viewport.y)
  const right = Math.min(box.x + box.w, viewport.x + viewport.w); const bottom = Math.min(box.y + box.h, viewport.y + viewport.h)
  return right > left && bottom > top ? { x: left, y: top, w: right - left, h: bottom - top } : null
}

function PanelPreview({ item, preview }: { item: FramesPanelItem; preview?: FramesPanelPreview }) {
  const viewport = preview?.viewport ?? { x: 0, y: 0, w: 1, h: 1 }
  const scale = Math.min(154 / Math.max(1, viewport.w), 69 / Math.max(1, viewport.h))
  const width = viewport.w * scale; const height = viewport.h * scale
  const offsetX = 7 + (154 - width) / 2; const offsetY = 7 + (69 - height) / 2
  return <svg className="systemsketch-frames-panel__preview" viewBox="0 0 168 92" role="img" aria-label={`${itemName(item)} preview`}>
    <path d="M0 23H168M0 46H168M0 69H168M42 0V92M84 0V92M126 0V92" className="systemsketch-frames-panel__grid" />
    <rect x={offsetX} y={offsetY} width={width} height={height} rx="3" className="systemsketch-frames-panel__preview-viewport" />
    {preview?.shapes.length ? preview.shapes.map((shape, index) => {
      const visible = clip(shape, viewport)
      return visible ? <rect key={`${shape.x}-${shape.y}-${index}`} x={offsetX + (visible.x - viewport.x) * scale} y={offsetY + (visible.y - viewport.y) * scale} width={Math.max(2, visible.w * scale)} height={Math.max(2, visible.h * scale)} rx="2" className="systemsketch-frames-panel__preview-shape" /> : null
    }) : <><circle cx="84" cy="40" r="13" className="systemsketch-frames-panel__preview-empty-mark" /><path d="M84 23v34M67 40h34" className="systemsketch-frames-panel__preview-empty-mark" /></>}
    <text x="8" y="85">{item.kind === 'landmark' ? 'SAVED CAMERA VIEW' : item.target.kind.toUpperCase()}</text>
  </svg>
}

function ItemMenu({ item, mutationLocked, startRename }: { item: FramesPanelItem; mutationLocked: boolean; startRename: () => void }) {
  const editor = useEditor()
  const closeMenu = (event: MouseEvent<HTMLButtonElement>) => event.currentTarget.closest('details')?.removeAttribute('open')
  return <details className="systemsketch-frames-panel__item-menu"><summary aria-label={`Actions for ${itemName(item)}`} title={`Actions for ${itemName(item)}`}>⋯</summary><div role="menu" aria-label={`Actions for ${itemName(item)}`}>
    <button type="button" role="menuitem" onClick={(event) => { focusItem(editor, item); closeMenu(event) }}>Focus</button><button type="button" role="menuitem" disabled={mutationLocked} onClick={(event) => { startRename(); closeMenu(event) }}>Rename</button>
    {item.kind === 'landmark' ? <button type="button" role="menuitem" disabled={mutationLocked} onClick={(event) => { removeBoardLandmark(editor, item.landmark.id); closeMenu(event) }}>Delete saved view</button> : null}
  </div></details>
}

function FramesPanelItemRow({ item, mode, preview, mutationLocked, reorderLocked, dragging, dropTarget, dragStart, dragOver, drop, dragEnd }: {
  item: FramesPanelItem; mode: ViewMode; preview?: FramesPanelPreview; mutationLocked: boolean; reorderLocked: boolean; dragging: string | null; dropTarget: DropTarget
  dragStart: (event: DragEvent<HTMLElement>, key: string) => void; dragOver: (event: DragEvent<HTMLLIElement>, key: string) => void; drop: (event: DragEvent<HTMLLIElement>, key: string) => void; dragEnd: () => void
}) {
  const editor = useEditor(); const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(itemName(item)); const [message, setMessage] = useState<string | null>(null); const input = useRef<HTMLInputElement>(null); const label = itemName(item)
  useEffect(() => { if (!editing) setDraft(label) }, [editing, label])
  useEffect(() => { if (editing) input.current?.focus() }, [editing])
  const commit = () => { const changed = renameItem(editor, item, draft); if (!changed && item.kind === 'landmark' && draft !== label) setMessage(landmarkFailureMessage()); else setMessage(null); setEditing(false) }
  const beginRename = () => { if (!mutationLocked) { setMessage(null); setEditing(true) } }
  const directDoubleClick = (event: MouseEvent<HTMLLIElement>) => { if (!(event.target as Element).closest('.systemsketch-frames-panel__handle, .systemsketch-frames-panel__item-menu')) beginRename() }
  return <li className="systemsketch-frames-panel__item" data-kind={item.kind} data-dragging={dragging === item.key || undefined} data-drop-position={dropTarget?.key === item.key ? dropTarget.position : undefined} data-testid={`systemsketch-frames-panel-item-${item.key}`} onDoubleClick={directDoubleClick} onDragEnterCapture={(event) => event.preventDefault()} onDragOverCapture={(event) => dragOver(event, item.key)} onDropCapture={(event) => drop(event, item.key)} onDragEnd={dragEnd}>
    <span className="systemsketch-frames-panel__handle" aria-hidden="true" title="Drag to reorder" draggable={!reorderLocked} onDragStart={(event) => dragStart(event, item.key)}>⠿</span>
    {mode === 'cards' ? <button type="button" className="systemsketch-frames-panel__preview-button" onClick={() => focusItem(editor, item)}><PanelPreview item={item} preview={preview} /></button> : null}
    {editing ? <div className="systemsketch-frames-panel__name"><span className="systemsketch-frames-panel__icon" aria-hidden="true">{iconFor(item)}</span><input ref={input} aria-label={`Rename ${label}`} data-testid={`systemsketch-frames-panel-rename-${item.key}`} maxLength={item.kind === 'landmark' ? 80 : undefined} value={draft} onChange={(event) => setDraft(event.currentTarget.value)} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); commit() } else if (event.key === 'Escape') { event.preventDefault(); setDraft(label); setEditing(false) } }} /></div> : <button type="button" className="systemsketch-frames-panel__name" data-testid={`systemsketch-frames-panel-focus-${item.key}`} title={`Focus ${label}`} onClick={() => focusItem(editor, item)}><span className="systemsketch-frames-panel__icon" aria-hidden="true">{iconFor(item)}</span><span>{label}</span></button>}
    <ItemMenu item={item} mutationLocked={mutationLocked} startRename={beginRename} />
    {message ? <p className="systemsketch-frames-panel__item-status" role="alert">{message}</p> : null}
  </li>
}

export function BoardOverview() {
  const editor = useEditor(); const model = useValue('SystemSketch frames panel', () => getFramesPanelModel(editor), [editor])
  const readonly = useValue('SystemSketch frames panel readonly', () => editor.getIsReadonly(), [editor])
  // WHY: preview cards are a view projection, not a subscription per row.
  // One derivation keeps a long Frames panel from multiplying editor listeners.
  const previews = useValue('SystemSketch frames panel previews', () => getFramesPanelPreviews(editor, model.items), [editor, model.items])
  const [mode, setMode] = useState<ViewMode>('cards'); const [menuOpen, setMenuOpen] = useState(false); const [name, setName] = useState(''); const [message, setMessage] = useState<string | null>(null); const [dragging, setDragging] = useState<string | null>(null); const [dropTarget, setDropTarget] = useState<DropTarget>(null); const dragCommitted = useRef(false); const activeDrag = useRef<string | null>(null); const activeDropTarget = useRef<DropTarget>(null)
  const landmarkMutationLocked = readonly || model.landmarksProtected; const reorderLocked = readonly || model.orderState.kind !== 'ready'
  const landmarks = model.items.filter((item) => item.kind === 'landmark').map((item) => item.landmark)
  useEffect(() => { if (!name) setName(suggestedLandmarkName(landmarks)) }, [name, landmarks])
  const placementFor = (event: DragEvent<HTMLLIElement>): FramesPanelDropPosition => event.clientY > event.currentTarget.getBoundingClientRect().top + event.currentTarget.getBoundingClientRect().height / 2 ? 'after' : 'before'
  const clearDrag = () => { activeDrag.current = null; activeDropTarget.current = null; setDragging(null); setDropTarget(null) }
  const move = (from: string, to: string, position: FramesPanelDropPosition) => { const next = moveFramesPanelItemKey(model.items.map((item) => item.key), from, to, position); if (next) { reorderFramesPanelItems(editor, next); dragCommitted.current = true } clearDrag() }
  const finishDrag = () => {
    if (!dragCommitted.current && activeDrag.current && activeDropTarget.current) move(activeDrag.current, activeDropTarget.current.key, activeDropTarget.current.position)
    else clearDrag()
    dragCommitted.current = false
  }
  return <div className="systemsketch-board-overview systemsketch-frames-panel" data-testid="systemsketch-board-overview">
    <header className="systemsketch-frames-panel__header"><div><span>Board navigation</span><h3>Frames</h3><small>{model.items.length} items</small></div><div className="systemsketch-frames-panel__view"><button type="button" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Frames panel view options" data-testid="systemsketch-frames-panel-view-menu" onClick={() => setMenuOpen(!menuOpen)}>☷</button>{menuOpen ? <div role="menu" aria-label="Frames panel view options"><button type="button" role="menuitemradio" aria-checked={mode === 'cards'} onClick={() => { setMode('cards'); setMenuOpen(false) }}>Thumbnail cards</button><button type="button" role="menuitemradio" aria-checked={mode === 'list'} onClick={() => { setMode('list'); setMenuOpen(false) }}>Compact list</button></div> : null}</div></header>
    <p className="systemsketch-frames-panel__intro">Frames, regions, and saved camera views in one navigable order.</p>
    <form className="systemsketch-frames-panel__save" onSubmit={(event) => { event.preventDefault(); const result = addBoardLandmark(editor, name); if (result.ok) { setName(suggestedLandmarkName([...landmarks, result.landmark])); setMessage(null) } else setMessage(landmarkFailureMessage()) }}><label htmlFor="systemsketch-landmark-name">Save current camera view</label><div><input id="systemsketch-landmark-name" data-testid="systemsketch-landmark-name" maxLength={80} value={name} disabled={landmarkMutationLocked} onChange={(event) => { setName(event.currentTarget.value); setMessage(null) }} /><button type="submit" data-testid="systemsketch-landmark-save" disabled={landmarkMutationLocked}>Save</button></div>{message ? <p className="systemsketch-frames-panel__item-status" role="alert">{message}</p> : null}</form>
    {readonly ? <p className="systemsketch-frames-panel__status" role="status">This document is read-only. Saved views cannot be changed.</p> : null}{model.landmarksProtected ? <p className="systemsketch-frames-panel__status" role="status">Saved-view metadata uses an unknown format and will not be changed.</p> : null}{model.orderState.kind === 'protected' ? <p className="systemsketch-frames-panel__status" role="status">Frame ordering uses an unknown format and will not be changed.</p> : null}
    {model.items.length ? <ul className={`systemsketch-frames-panel__items is-${mode}`} data-testid="systemsketch-frames-panel-list">{model.items.map((item) => <FramesPanelItemRow key={item.key} item={item} mode={mode} preview={previews.get(item.key)} mutationLocked={item.kind === 'landmark' ? landmarkMutationLocked : readonly} reorderLocked={reorderLocked} dragging={dragging} dropTarget={dropTarget} dragStart={(event, key) => { dragCommitted.current = false; activeDrag.current = key; setDragging(key); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', key) }} dragOver={(event, key) => { event.preventDefault(); if (activeDrag.current && activeDrag.current !== key) { const next = { key, position: placementFor(event) }; activeDropTarget.current = next; setDropTarget(next) } }} drop={(event, key) => { event.preventDefault(); move(event.dataTransfer.getData('text/plain') || activeDrag.current || '', key, placementFor(event)) }} dragEnd={finishDrag} />)}</ul> : <div className="systemsketch-board-overview__empty" data-testid="systemsketch-named-landmarks-empty"><span aria-hidden="true">▣</span><strong>No frames or saved views yet</strong><p>Add a Frame or save the current camera view.</p></div>}
  </div>
}

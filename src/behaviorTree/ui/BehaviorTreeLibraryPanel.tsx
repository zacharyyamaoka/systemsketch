/**
 * The Behaviors library, docked in the left popout beside Shapes.
 *
 * Two things make it different from the Shapes library and both are forced by
 * the domain rather than chosen:
 *
 *   1. **Its catalog belongs to a document.** Skills, Conditions and the other
 *      trees come from whichever Behavior Tree region is in play, so the panel
 *      has to resolve a region before it can list anything. Controls and
 *      Decorators are BT.CPP's and are always listable.
 *   2. **A behavior does not land at a point.** It lands in a parent at an
 *      index, so a click inserts RELATIVE TO THE SELECTION — the same three
 *      cases the inspector's Library section and the on-canvas "+" already
 *      use — rather than at the viewport centre.
 *
 * The region is the selected one, or the page's only one when nothing is
 * selected: opening a panel and being told to go and click something first is
 * a worse answer than the one obvious region.
 */
import { useEffect, useMemo, useState } from 'react'
import { useEditor, useValue, type Editor, type TLShapeId } from 'tldraw'

import { SCROLL_AREA_CLASS } from '../../scroll/ScrollArea'
import {
	getSelectedBehaviorTree,
	insertBehaviorTreeChild,
	insertBehaviorTreeSiblingOf,
	type BtCommandResult,
} from '../behaviorTreeCommands'
import {
	BEHAVIOR_LIBRARY_RECENTS_EVENT,
	BEHAVIOR_LIBRARY_RECENTS_KEY,
	behaviorLibraryCatalog,
	behaviorLibrarySections,
	filterBehaviorLibraryItems,
	planBehaviorInsert,
	readBehaviorLibraryRecentIds,
	rememberBehaviorLibraryItem,
	type BehaviorLibraryItem,
	type BehaviorLibrarySection,
} from '../behaviorLibraryModel'
import { isBehaviorTreeShape, type BehaviorTreeShape } from '../behaviorTreeModel'
import { projectBehaviorTree } from '../behaviorTreeProjection'
import { BEHAVIOR_DRAG_MIME, encodeBehaviorDrag } from '../behaviorTreeDrag'
import { BtNodeIcon } from '../btNodeIcons'
import './behavior-tree-library.css'

const DEFAULT_CLOSED: ReadonlySet<BehaviorLibrarySection> = new Set<BehaviorLibrarySection>(['Decorators'])

function useBehaviorLibraryRecents(): string[] {
	const [recentIds, setRecentIds] = useState(readBehaviorLibraryRecentIds)

	useEffect(() => {
		const onRecents = (event: Event) => {
			if (event instanceof CustomEvent && Array.isArray(event.detail)) setRecentIds(event.detail)
			else setRecentIds(readBehaviorLibraryRecentIds())
		}
		const onStorage = (event: StorageEvent) => {
			if (event.key === BEHAVIOR_LIBRARY_RECENTS_KEY) setRecentIds(readBehaviorLibraryRecentIds())
		}
		window.addEventListener(BEHAVIOR_LIBRARY_RECENTS_EVENT, onRecents)
		window.addEventListener('storage', onStorage)
		return () => {
			window.removeEventListener(BEHAVIOR_LIBRARY_RECENTS_EVENT, onRecents)
			window.removeEventListener('storage', onStorage)
		}
	}, [])

	return recentIds
}

/**
 * The region the panel is about. Derived as two primitive signals rather than
 * one object: a fresh object from `useValue` re-renders the panel on every
 * store change, and this panel is open while a person drags on the canvas.
 */
function useBehaviorLibraryRegion(editor: Editor): { region: BehaviorTreeShape | null; path: string | null } {
	const regionId = useValue<TLShapeId | null>('behavior library region', () => {
		const selection = getSelectedBehaviorTree(editor)
		if (selection) return selection.region.id
		const regions = editor.getCurrentPageShapes().filter(isBehaviorTreeShape)
		return regions.length === 1 ? regions[0].id : null
	}, [editor])
	const path = useValue<string | null>('behavior library path', () => getSelectedBehaviorTree(editor)?.path ?? null, [editor])
	const region = useValue<BehaviorTreeShape | null>('behavior library region shape', () => {
		if (!regionId) return null
		const shape = editor.getShape(regionId)
		return isBehaviorTreeShape(shape) ? shape : null
	}, [editor, regionId])
	return { region, path }
}

function LibraryRow({ item, onInsert }: {
	item: BehaviorLibraryItem
	onInsert(item: BehaviorLibraryItem): void
}) {
	return (
		<button
			type="button"
			className="bt-library__row"
			// WHY draggable AND clickable: a click is the fast path (it uses the
			// selection), a drag is the precise one (it names the target). The
			// drop side lives on the region's own canvas layer.
			draggable
			onDragStart={(event) => {
				event.dataTransfer.setData(BEHAVIOR_DRAG_MIME, encodeBehaviorDrag({
					itemId: item.id,
					label: item.label,
					template: item.template,
				}))
				event.dataTransfer.setData('text/plain', item.label)
				event.dataTransfer.effectAllowed = 'copy'
			}}
			title={`Add ${item.label}`}
			aria-label={`Add ${item.label}`}
			data-library-item={item.id}
			data-library-section={item.section}
			data-testid={`systemsketch-behavior-${item.id}`}
			onClick={() => onInsert(item)}
		>
			<span className="bt-library__rowGlyph" aria-hidden="true">
				<BtNodeIcon subject={item.icon} size={18} />
			</span>
			<span className="bt-library__rowCopy">
				<strong>{item.label}</strong>
				<small>{item.detail}</small>
			</span>
		</button>
	)
}

export function BehaviorTreeLibraryPanel() {
	const editor = useEditor()
	const { region, path } = useBehaviorLibraryRegion(editor)
	const recentIds = useBehaviorLibraryRecents()
	const [query, setQuery] = useState('')
	const [closed, setClosed] = useState<ReadonlySet<BehaviorLibrarySection>>(DEFAULT_CLOSED)
	const [notice, setNotice] = useState<string | null>(null)

	const projection = useMemo(() => (region ? projectBehaviorTree(region.props) : null), [region])
	const node = useMemo(() => (
		projection && path !== null ? projection.tree?.nodes.find((candidate) => candidate.path === path) ?? null : null
	), [projection, path])

	// With no region, BT.CPP's own vocabulary is still true, and listing it
	// keeps the panel legible instead of showing one apologetic sentence.
	const catalog = useMemo(
		() => behaviorLibraryCatalog(projection?.document ?? null, { treeId: region?.props.treeId }),
		[projection, region?.props.treeId],
	)

	const plan = useMemo(() => planBehaviorInsert(projection?.tree ?? null, node), [projection, node])

	const searching = query.trim().length > 0
	const matches = useMemo(() => filterBehaviorLibraryItems(catalog, query), [catalog, query])
	const sections = useMemo(
		() => behaviorLibrarySections(matches, searching ? [] : recentIds),
		[matches, searching, recentIds],
	)

	useEffect(() => {
		if (!notice) return
		const timer = window.setTimeout(() => setNotice(null), 3200)
		return () => window.clearTimeout(timer)
	}, [notice])

	const insert = (item: BehaviorLibraryItem) => {
		if (!region) {
			setNotice('Select a Behavior Tree first.')
			return
		}
		// One plan drives BOTH the click and the caption below, so the panel
		// cannot promise a placement the command will refuse.
		const result: BtCommandResult = plan.kind === 'sibling'
			? insertBehaviorTreeSiblingOf(editor, region.id, plan.path, plan.after, item.template)
			: insertBehaviorTreeChild(editor, region.id, plan.parentPath, plan.index, item.template)
		if (result.ok) {
			rememberBehaviorLibraryItem(item.id)
			setNotice(null)
		} else setNotice(result.reason)
	}

	const toggle = (name: BehaviorLibrarySection) => {
		setClosed((current) => {
			const next = new Set(current)
			if (next.has(name)) next.delete(name)
			else next.add(name)
			return next
		})
	}

	const where = region ? plan.describe : 'Select a Behavior Tree to add to it.'

	return (
		<div className="systemsketch-behavior-library" data-testid="systemsketch-behavior-library">
			<input
				className="bt-library__search"
				// WHY `text` and not `search`: a search input draws the browser's
				// own clear button inside a panel that paints its own controls.
				type="text"
				aria-label="Search behaviors"
				placeholder="Search behaviors"
				value={query}
				onChange={(event) => setQuery(event.target.value)}
				data-testid="systemsketch-behavior-library-search"
			/>
			<p className="bt-library__where" data-testid="systemsketch-behavior-library-where">{where}</p>
			<div className={`${SCROLL_AREA_CLASS} bt-library__body`}>
				{sections.map(({ name, items }) => {
					// WHY a query forces every section open: a collapsed section would
				// otherwise answer a search with a header and a count and no rows —
				// the panel showing that it found something and hiding it.
				const isOpen = searching || !closed.has(name)
					return (
						<section key={name} data-library-section={name}>
							<h3>
								<button
									type="button"
									className="systemsketch-library-section-toggle"
									aria-expanded={isOpen}
									data-testid={`systemsketch-behavior-library-section-${name.toLowerCase().replace(/\s+/g, '-')}`}
									onClick={() => toggle(name)}
								>
									<span>{name}</span>
									<span className="systemsketch-library-section-toggle__count">{items.length}</span>
									<span className="systemsketch-library-section-toggle__chevron" aria-hidden="true">⌄</span>
								</button>
							</h3>
							{isOpen ? (
								<div className="bt-library__rows">
									{items.map((item) => (
										<LibraryRow key={`${name}:${item.id}`} item={item} onInsert={insert} />
									))}
								</div>
							) : null}
						</section>
					)
				})}
				{sections.length === 0 ? (
					<div className="systemsketch-library-empty" role="status" data-testid="systemsketch-behavior-library-empty">
						<strong>No matching behaviors</strong>
						<span>Try sequence, retry, timeout, or a skill name.</span>
					</div>
				) : null}
			</div>
			{notice ? <p className="bt-library__notice" role="status" data-testid="systemsketch-behavior-library-notice">{notice}</p> : null}
		</div>
	)
}

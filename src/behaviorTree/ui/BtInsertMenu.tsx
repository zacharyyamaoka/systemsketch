/**
 * Flowstate's "Add process" menu, one level at a time: Skills, Control flow,
 * or Fail on the first page; a searchable list of the registered skills, or
 * the control vocabulary, on the second. Keyboard: arrows move, Enter
 * chooses, Escape steps back then closes.
 *
 * WHY a real Radix `Popover.Content`, not a plain positioned `div`: the first
 * version painted this menu inside the region's own `HTMLContainer`, which
 * tldraw stacks BELOW its projected children — the menu sat under the very
 * cards it was meant to add beside. Portaling through `useContainer()` fixes
 * the z-order, but a hand-rolled portal also means hand-rolling outside-click
 * dismissal, Escape, Tab trapping and focus return — all of which Radix's
 * `Popover` already does, and which `BtInsertControl` (in
 * `BehaviorTreeCanvas.tsx`) already gets for free from `TldrawUiPopover`'s
 * `Popover.Root`/`Trigger`. This file owns only the `Popover.Content`: the
 * tldraw wrapper (`TldrawUiPopoverContent`) doesn't expose `onEscapeKeyDown`,
 * and the "Escape steps back before it closes" rule needs that hook — Radix's
 * dismissable layer resolves Escape in a capture-phase listener that runs
 * before any bubble handler here, so back-navigation has to live there, not
 * in `onKeyDown` below.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Popover as RadixPopover } from 'radix-ui'
import { useContainer } from 'tldraw'

import { type BtDocument, type BtInsertTemplate, type BtNodeModel } from '../btcppXml'
import { BtGlyphSvg } from '../btGlyphs'
import { btGlyphFor } from '../behaviorTreeModel'

type Page = 'root' | 'skills' | 'control'

interface MenuRow {
	id: string
	label: string
	detail?: string
	template?: BtInsertTemplate
	page?: Page
	glyph?: React.ReactNode
}

const CONTROL_ROWS: Array<{ template: BtInsertTemplate; label: string; detail: string }> = [
	{ template: { id: 'Sequence', kind: 'control' }, label: 'Sequence', detail: 'Group · run children in order' },
	{ template: { id: 'Fallback', kind: 'control' }, label: 'Fallback', detail: 'Branch · try the next on failure' },
	{ template: { id: 'Parallel', kind: 'control' }, label: 'Parallel', detail: 'Lanes · tick children together' },
	{ template: { id: 'RetryUntilSuccessful', kind: 'decorator', attrs: { num_attempts: '3' } }, label: 'Retry', detail: 'Retry the next node' },
	{ template: { id: 'Repeat', kind: 'decorator', attrs: { num_cycles: '3' } }, label: 'Loop', detail: 'Repeat the next node' },
	{ template: { id: 'Inverter', kind: 'decorator' }, label: 'Inverter', detail: 'Swap success and failure' },
	{ template: { id: 'Timeout', kind: 'decorator', attrs: { msec: '5000' } }, label: 'Timeout', detail: 'Halt after a deadline' },
	{ template: { id: 'IfThenElse', kind: 'control' }, label: 'If / then / else', detail: 'Branch on a condition' },
]

function skillRows(document: BtDocument): MenuRow[] {
	const rows: MenuRow[] = []
	const declared = document.models.filter((entry): entry is BtNodeModel => !entry.builtin && (entry.kind === 'action' || entry.kind === 'condition'))
	for (const entry of declared) {
		rows.push({ id: `model:${entry.id}`, label: entry.id, detail: entry.kind === 'condition' ? 'Condition' : 'Skill', template: { id: entry.id, kind: entry.kind } })
	}
	for (const tree of document.trees) {
		if (tree.id === document.mainTreeId) continue
		rows.push({ id: `tree:${tree.id}`, label: tree.id, detail: 'Sub Tree', template: { id: tree.id, kind: 'subtree' } })
	}
	rows.push({ id: 'new-skill', label: 'New skill…', detail: 'An action named here', template: { id: 'NewSkill', kind: 'action' } })
	rows.push({ id: 'new-condition', label: 'New condition…', detail: 'A condition named here', template: { id: 'NewCondition', kind: 'condition' } })
	return rows
}

export function BtInsertMenu({ document, onChoose }: {
	document: BtDocument
	onChoose(template: BtInsertTemplate): void
}) {
	const container = useContainer()
	const [page, setPage] = useState<Page>('root')
	const [query, setQuery] = useState('')
	const [cursor, setCursor] = useState(0)
	const searchRef = useRef<HTMLInputElement>(null)

	const rows = useMemo<MenuRow[]>(() => {
		if (page === 'root') {
			return [
				{ id: 'skills', label: 'Skills', page: 'skills', glyph: <SparkleGlyph /> },
				{ id: 'control', label: 'Control flow', page: 'control', glyph: <BtGlyphSvg glyph="branch" orientation="down" size={18} /> },
				{ id: 'fail', label: 'Fail', detail: 'End this lane in failure', template: { id: 'AlwaysFailure', kind: 'action' }, glyph: <BtGlyphSvg glyph="force-failure" orientation="down" size={18} /> },
			]
		}
		if (page === 'control') {
			return CONTROL_ROWS.map((row) => ({
				id: row.template.id,
				label: row.label,
				detail: row.detail,
				template: row.template,
				glyph: <BtGlyphSvg glyph={btGlyphFor({ id: row.template.id, kind: row.template.kind, controlKind: row.template.id === 'Sequence' ? 'sequence' : row.template.id === 'Fallback' ? 'fallback' : row.template.id === 'Parallel' ? 'parallel' : row.template.id === 'IfThenElse' ? 'branch' : null })} orientation="down" size={18} />,
			}))
		}
		const needle = query.trim().toLowerCase()
		return skillRows(document).filter((row) => needle === '' || row.label.toLowerCase().includes(needle))
	}, [page, query, document])

	useEffect(() => {
		setCursor(0)
	}, [page, query])
	useEffect(() => {
		if (page === 'skills') searchRef.current?.focus()
	}, [page])

	const activate = (row: MenuRow) => {
		if (row.page) {
			setPage(row.page)
			setQuery('')
			return
		}
		if (row.template) onChoose(row.template)
	}
	// Root-page Escape is left to Radix's own dismiss (below); this only
	// covers the arrow/Enter nav that Escape doesn't reach.
	const onKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === 'ArrowDown') {
			event.preventDefault()
			setCursor((value) => Math.min(rows.length - 1, value + 1))
		} else if (event.key === 'ArrowUp') {
			event.preventDefault()
			setCursor((value) => Math.max(0, value - 1))
		} else if (event.key === 'Enter') {
			event.preventDefault()
			const row = rows[cursor]
			if (row) activate(row)
		}
	}
	// Capture-phase, ahead of `DismissableLayer`'s own Escape handling: on a
	// sub-page this steps back and swallows the key so the popover stays
	// open; on the root page it does nothing and Radix closes as usual.
	const onEscapeKeyDown = (event: KeyboardEvent) => {
		if (page === 'root') return
		event.preventDefault()
		setPage('root')
	}

	return (
		<RadixPopover.Portal container={container}>
			<RadixPopover.Content
				className="BehaviorTree-menu"
				data-page={page}
				role="menu"
				aria-label="Add process"
				data-testid="bt-insert-menu"
				side="bottom"
				align="start"
				sideOffset={8}
				collisionPadding={12}
				onPointerDown={(event) => event.stopPropagation()}
				onKeyDown={onKeyDown}
				onEscapeKeyDown={onEscapeKeyDown}
			>
				<div className="BehaviorTree-menuTitle">
					{page === 'root' ? (
						<><span className="BehaviorTree-menuTitleGlyph">＋</span>Add process</>
					) : (
						<button type="button" className="BehaviorTree-menuBack" onClick={() => setPage('root')} data-testid="bt-insert-back">‹ Back</button>
					)}
				</div>
				{page === 'skills' ? (
					<input
						ref={searchRef}
						className="BehaviorTree-menuSearch"
						placeholder="Search"
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						data-testid="bt-insert-search"
					/>
				) : null}
				<div className="BehaviorTree-menuRows">
					{rows.map((row, index) => (
						<button
							type="button"
							key={row.id}
							className="BehaviorTree-menuRow"
							role="menuitem"
							data-active={index === cursor}
							data-testid={`bt-insert-row-${row.id}`}
							onMouseEnter={() => setCursor(index)}
							onClick={() => activate(row)}
						>
							<span className="BehaviorTree-menuRowGlyph">{row.glyph ?? <span className="BehaviorTree-menuDot" />}</span>
							<span className="BehaviorTree-menuRowLabel">{row.label}</span>
							{row.detail ? <span className="BehaviorTree-menuRowDetail">{row.detail}</span> : null}
							{row.page ? <span className="BehaviorTree-menuRowChevron">›</span> : null}
						</button>
					))}
					{rows.length === 0 ? <div className="BehaviorTree-menuEmpty">Nothing matches</div> : null}
				</div>
			</RadixPopover.Content>
		</RadixPopover.Portal>
	)
}

function SparkleGlyph() {
	return (
		<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
			<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" fill="currentColor" />
		</svg>
	)
}

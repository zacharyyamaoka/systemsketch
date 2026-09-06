import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { useEditor, useValue } from 'tldraw'

import type { BlockShape } from '../blockModel'
import { typeAttributePresentation } from '../typeAttributePresentation'
import {
	isTypeBlock,
	parseTypeAttributeSource,
	type TypeAttribute,
} from '../typeAttributes'
import './type-attribute-region.css'

function Chevron({ open }: { open: boolean }) {
	return <span aria-hidden="true">{open ? '⌄' : '›'}</span>
}

function AttributeRows({
	attributes,
	folded,
	hoverAll,
	hovered,
	setHovered,
	toggle,
	beginEditing,
}: {
	attributes: readonly TypeAttribute[]
	folded: ReadonlySet<string>
	hoverAll: boolean
	hovered: string | null
	setHovered(value: string | null): void
	toggle(id: string): void
	beginEditing(): void
}) {
	return attributes.map((attribute) => {
		const hasChildren = attribute.children.length > 0
		const isFolded = folded.has(attribute.id)
		const showChevron = hasChildren && (isFolded || hoverAll || hovered === attribute.id)
		return (
			<div
				key={attribute.id}
				className="TypeAttributeRegion-row"
				data-has-children={hasChildren || undefined}
				data-folded={hasChildren && isFolded ? 'true' : undefined}
				onPointerEnter={() => setHovered(attribute.id)}
				onPointerLeave={() => setHovered(null)}
			>
				{hasChildren ? (
					<button
						type="button"
						className="TypeAttributeRegion-chevron"
						data-visible={showChevron || undefined}
						aria-label={`${isFolded ? 'Expand' : 'Collapse'} ${attribute.name}`}
						aria-expanded={!isFolded}
						onPointerDown={(event) => event.stopPropagation()}
						onClick={(event) => {
							event.stopPropagation()
							toggle(attribute.id)
						}}
					>
						<Chevron open={!isFolded} />
					</button>
				) : null}
				<button
					type="button"
					className="TypeAttributeRegion-line"
					title={attribute.raw.trim()}
					onPointerDown={(event) => event.stopPropagation()}
					onClick={(event) => {
						event.stopPropagation()
						beginEditing()
					}}
				>
					<b>{attribute.name}</b>
					{attribute.type ? (
						<>
							<span className="TypeAttributeRegion-punctuation">: </span>
							<span className="TypeAttributeRegion-type">{attribute.type}</span>
						</>
					) : null}
					{attribute.value ? (
						<>
							<span className="TypeAttributeRegion-punctuation"> = </span>
							<span>{attribute.value}</span>
						</>
					) : null}
				</button>
				{hasChildren && !isFolded ? (
					<div className="TypeAttributeRegion-children">
						<AttributeRows
							attributes={attribute.children}
							folded={folded}
							hoverAll={hoverAll}
							hovered={hovered}
							setHovered={setHovered}
							toggle={toggle}
							beginEditing={beginEditing}
						/>
					</div>
				) : null}
			</div>
		)
	})
}

/**
 * A Type's attribute tree, and the one editing surface for its whole source.
 *
 * The compact tree is a read projection: every row opens the same ordinary
 * `<textarea>` over the exact source, rather than becoming its own
 * independently writable field. That keeps cursor placement, Enter, paste,
 * IME composition, and undo exactly what a plain multiline field already
 * gives for free — a per-row editor would have to reinvent all of it, and
 * would fork one source body into two representations that could disagree.
 */
export function TypeAttributeRegion({
	shape,
	top,
	bottom,
	selected,
}: {
	shape: BlockShape
	top: number
	bottom: number
	selected: boolean
}) {
	const editor = useEditor()
	const presentation = useValue(
		'Type attribute chevron placement',
		() => typeAttributePresentation.get(),
		[],
	)
	const source = shape.props.attributeSource ?? ''
	const attributes = useMemo(() => parseTypeAttributeSource(source), [source])
	const [open, setOpen] = useState(true)
	const [editing, setEditing] = useState(false)
	const [draft, setDraft] = useState(source)
	const [folded, setFolded] = useState<ReadonlySet<string>>(() => new Set())
	const [hovered, setHovered] = useState<string | null>(null)
	const [hoverAll, setHoverAll] = useState(false)

	useEffect(() => {
		if (!editing) setDraft(source)
	}, [editing, source])

	if (!isTypeBlock(shape.props) || shape.props.view === 'simple') return null

	const toggle = (id: string) => setFolded((current) => {
		const next = new Set(current)
		if (next.has(id)) next.delete(id)
		else next.add(id)
		return next
	})
	const beginEditing = () => {
		if (!selected || editor.getIsReadonly()) return
		setDraft(source)
		setEditing(true)
	}
	const cancel = () => {
		setDraft(source)
		setEditing(false)
	}
	const commit = () => {
		const next = draft.replace(/\r\n?/g, '\n')
		setEditing(false)
		if (next === source || editor.getIsReadonly()) return
		// One write, bracketed as its own undo step — the draft lives in local
		// state until now, so there is nothing to merge the way a live-updating
		// field would need `markHistoryStoppingPoint` on its first keystroke.
		editor.markHistoryStoppingPoint('edit Type attributes')
		editor.updateShape<BlockShape>({ id: shape.id, type: shape.type, props: { attributeSource: next } })
	}

	return (
		<section
			className={`TypeAttributeRegion TypeAttributeRegion--${presentation.chevronPlacement}`}
			data-testid="type-attribute-region"
			data-type-attributes-selected={selected || undefined}
			style={{ top, height: Math.max(0, bottom - top) } as CSSProperties}
			onPointerDown={(event) => {
				if (selected) event.stopPropagation()
			}}
		>
			<button
				type="button"
				className="TypeAttributeRegion-heading"
				aria-expanded={open}
				onPointerEnter={() => setHoverAll(true)}
				onPointerLeave={() => setHoverAll(false)}
				onClick={(event) => {
					event.stopPropagation()
					setOpen((current) => !current)
				}}
			>
				<span className="TypeAttributeRegion-headingChevron"><Chevron open={open} /></span>
				<span>attributes</span>
				{editing ? <small>source</small> : null}
			</button>
			{open ? (
				<div className="TypeAttributeRegion-body">
					{editing ? (
						<textarea
							autoFocus
							className="TypeAttributeRegion-editor"
							aria-label="Type attributes source"
							data-testid="type-attribute-source"
							value={draft}
							spellCheck={false}
							onPointerDown={(event) => event.stopPropagation()}
							onChange={(event) => setDraft(event.currentTarget.value)}
							onBlur={commit}
							// tldraw's own container listens for Escape in the bubble phase and
							// unconditionally calls `container.focus()` there, which blurs this
							// textarea and runs `commit` before a bubble-phase handler here would
							// ever see the key. Capturing it stops that before it starts.
							onKeyDownCapture={(event) => {
								if (event.key !== 'Escape') return
								event.preventDefault()
								event.stopPropagation()
								cancel()
							}}
						/>
					) : attributes.length > 0 ? (
						<div className="TypeAttributeRegion-tree">
							<AttributeRows
								attributes={attributes}
								folded={folded}
								hoverAll={hoverAll}
								hovered={hovered}
								setHovered={setHovered}
								toggle={toggle}
								beginEditing={beginEditing}
							/>
						</div>
					) : (
						<button type="button" className="TypeAttributeRegion-empty" onClick={beginEditing}>Click to add attributes</button>
					)}
				</div>
			) : null}
		</section>
	)
}

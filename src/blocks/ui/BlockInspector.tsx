import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import { type Editor, useValue } from 'tldraw'

import { LiveTextArea, LiveTextInput, useLiveField } from '../../fields'
import { EMPTY_FIELD_GUIDANCE } from '../../fields/emptyFieldGuidance'

import {
  BLOCK_PRESENTATION_VIEWS,
  isBlockShape,
  HEADER_ROW,
  type BlockPort,
  type BlockPortSide,
  type BlockShapeProps,
  type BlockPresentationView,
  blockPortSections,
  isEffectPort,
  mutatedInputId,
  portInHeader,
  portMutates,
  setBlockViewProps,
} from '../blockModel'
import { commitBlockDefinitionName, definitionBadge } from '../definitions/definitionLinking'
import { getBlockPortConnections, type BlockPortConnection } from '../connections/blockPorts'
import { valueBlockInlet, valueBlockName, valueBlockOutlet } from '../valueBlock'
import {
  appendBlockPort,
  appendBlockPortProps,
  getBlockInspectorContext,
  getOnlySelectedBlock,
  sameBlockInspectorContext,
  moveBlockPort,
  moveBlockPortProps,
  moveBlockPortToSection,
  moveBlockPortToSectionProps,
  patchBlockDetailsProps,
  patchBlockPortProps,
  adoptConnectedPillType,
  removeBlockPort,
  removeBlockPortProps,
  setBlockView,
  updateBlockDetails,
  updateBlockPort,
  type BlockDetailsPatch,
} from '../commands/blockCommands'
import type { BlockPortSectionTarget } from '../ports/portAffordances'
import {
  setBlockPortLayoutForSelection,
  setBlockShowDescriptionForSelection,
  setBlockViewForSelection,
} from '../commands/blockStyleCommands'
import { BlockBatchInspectorContent } from './BlockBatchInspector'
import { BLOCK_ICONS, BlockIconGlyph } from './blockIcons'
import './block-inspector.css'

type InspectorTab = 'details' | 'notes'

const DISPLAY_DESCRIPTION_LIMIT = 120

/**
 * Continuous edits (a text field writing on every keystroke) opt out of the
 * per-mutation history mark and bound their own undo step instead, so a rename
 * is one Ctrl+Z rather than one per character.
 */
export interface BlockEditOptions {
  continuous?: boolean
}

export interface BlockInspectorActions {
  updateDetails(patch: BlockDetailsPatch, options?: BlockEditOptions): void
  setView(view: BlockPresentationView): void
  addPort(side: BlockPortSide): void
  updatePort(
    side: BlockPortSide,
    portId: string,
    patch: Partial<Omit<BlockPort, 'id'>>,
    options?: BlockEditOptions,
  ): void
  removePort(side: BlockPortSide, portId: string): void
  /** One visual step: neighbours swap, or the port crosses the nearest line. */
  movePort(side: BlockPortSide, portId: string, delta: -1 | 1): void
  /** Put the port in a row (and arm), before a neighbour or at the end. */
  movePortToSection(side: BlockPortSide, portId: string, target: BlockPortSectionTarget): void
  /** Explicitly copy a selected pill's inlet type; wiring never does this itself. */
  adoptConnectedType?(): void
  /** Open one undo step for a typing gesture. Absent for an unplaced draft. */
  beginEdit?(label: string): void
  /** Resolve a same-name collision only when the title gesture is complete. */
  commitTitle?(): void
}

/** What a pill is wired to, read from the cables; the content never reads the editor. */
export interface PillInspectorFacts {
  /** `estimate() · pose` when a cable feeds the inlet, else null. */
  fedBy: string | null
  /** The type of the port feeding the inlet, when it has one. */
  fedType: string | null
  /** Everything the outlet feeds, `encode() · pose` style. */
  feeds: string[]
}

export interface BlockInspectorContentProps {
  props: BlockShapeProps
  actions?: BlockInspectorActions
  status?: 'selected' | 'new'
  initialTab?: InspectorTab
  onRequestClose?: () => void
  pill?: PillInspectorFacts
}

function TinyIcon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
      {children}
    </svg>
  )
}

function FileTextIcon() {
  return (
    <TinyIcon>
      <path d="M4 2.25h5l3 3v8.5H4zM9 2.25v3h3M6 8h4M6 10.5h4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </TinyIcon>
  )
}

function EyeIcon({ visible }: { visible: boolean }) {
  return visible ? (
    <TinyIcon>
      <path d="M1.5 8s2.2-3.5 6.5-3.5S14.5 8 14.5 8s-2.2 3.5-6.5 3.5S1.5 8 1.5 8Z" stroke="currentColor" strokeWidth="1.25" />
      <circle cx="8" cy="8" r="1.65" stroke="currentColor" strokeWidth="1.25" />
    </TinyIcon>
  ) : (
    <TinyIcon>
      <path d="M2 2l12 12M6.1 4.8A6.9 6.9 0 0 1 8 4.5c4.3 0 6.5 3.5 6.5 3.5a9.8 9.8 0 0 1-2 2.2M9.6 11.3a7.2 7.2 0 0 1-1.6.2C3.7 11.5 1.5 8 1.5 8a10 10 0 0 1 2-2.2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </TinyIcon>
  )
}

function PlusIcon() {
  return <TinyIcon><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></TinyIcon>
}

function XIcon() {
  return <TinyIcon><path d="m4 4 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></TinyIcon>
}

function GripIcon() {
  return (
    <svg viewBox="0 0 10 14" width="10" height="14" aria-hidden="true">
      {[3, 7, 11].map((y) => (
        <g key={y}>
          <circle cx="3.5" cy={y} r="1.05" fill="currentColor" />
          <circle cx="6.5" cy={y} r="1.05" fill="currentColor" />
        </g>
      ))}
    </svg>
  )
}

function ChevronIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
    <TinyIcon>
      <path d={direction === 'up' ? 'm4.5 9.5 3.5-3 3.5 3' : 'm4.5 6.5 3.5 3 3.5-3'} stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </TinyIcon>
  )
}

/** The same curated icon picker used by the mature pyblocks inspector. */
function IconPicker({
  value,
  disabled,
  onChange,
}: {
  value: string
  disabled: boolean
  onChange(icon: string): void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: Event) => {
      if (rootRef.current && event.target instanceof Node && rootRef.current.contains(event.target)) {
        return
      }
      setOpen(false)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', close, true)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('pointerdown', close, true)
      document.removeEventListener('keydown', key)
    }
  }, [open])

  return (
    <div className="block-inspector__icon-picker" ref={rootRef}>
      <button
        type="button"
        className={`block-inspector__icon-well${value ? '' : ' is-empty'}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={value ? `Icon: ${value}. Change icon` : 'Set icon'}
        title={value ? 'Change icon' : 'Set icon'}
        onClick={() => setOpen((current) => !current)}
      >
        {value ? <BlockIconGlyph name={value} size={16} /> : null}
      </button>
      {open ? (
        <div className="block-inspector__icon-grid" role="listbox" aria-label="Block icon">
          <button
            type="button"
            className="block-inspector__icon-option block-inspector__icon-option--none"
            role="option"
            aria-selected={value === ''}
            title="None"
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
          >
            <XIcon />
          </button>
          {BLOCK_ICONS.map(({ name, label, Icon }) => (
            <button
              key={name}
              type="button"
              className="block-inspector__icon-option"
              role="option"
              aria-selected={value === name}
              title={label}
              onClick={() => {
                onChange(name)
                setOpen(false)
              }}
            >
              <Icon size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function NotesEditor({
  value,
  disabled,
  actions,
}: {
  value: string
  disabled: boolean
  actions?: BlockInspectorActions
}) {
  return (
    <LiveTextArea
      className="block-inspector__notes-editor"
      value={value}
      disabled={disabled}
      ariaLabel="Detailed block notes"
      placeholder={EMPTY_FIELD_GUIDANCE.block.notes}
      beginEdit={() => actions?.beginEdit?.('edit block notes')}
      onWrite={(notes) => actions?.updateDetails({ notes }, { continuous: true })}
    />
  )
}

function DescriptionEditor({
  value,
  visible,
  disabled,
  actions,
  onToggle,
}: {
  value: string
  visible: boolean
  disabled: boolean
  actions?: BlockInspectorActions
  onToggle(): void
}) {
  const descriptionId = useId()
  // The hook rather than <LiveTextArea> because the counter reads the value
  // being typed, which stays honest under either write policy.
  const { value: draft, fieldProps } = useLiveField({
    value,
    multiline: true,
    beginEdit: () => actions?.beginEdit?.('edit block description'),
    onWrite: (description) => actions?.updateDetails({ description }, { continuous: true }),
  })

  return (
    <div className="block-inspector__display-description">
      <div className="block-inspector__field-header">
        <label htmlFor={descriptionId}>Display description</label>
        <span
          className="block-inspector__character-count"
          data-over-limit={draft.length > DISPLAY_DESCRIPTION_LIMIT || undefined}
        >
          {draft.length} / {DISPLAY_DESCRIPTION_LIMIT}
        </span>
        <button
          type="button"
          className="block-inspector__visibility-button"
          disabled={disabled}
          aria-pressed={visible}
          aria-label={`${visible ? 'Hide' : 'Show'} display description on block`}
          title={`${visible ? 'Hide' : 'Show'} on block`}
          onClick={onToggle}
        >
          <EyeIcon visible={visible} />
        </button>
      </div>
      <textarea
        {...fieldProps}
        id={descriptionId}
        rows={3}
        maxLength={DISPLAY_DESCRIPTION_LIMIT}
        disabled={disabled}
        placeholder={EMPTY_FIELD_GUIDANCE.block.displayDescription}
      />
      <p className="block-inspector__field-help">
        Shown at a glance · keep implementation detail in Notes.
      </p>
    </div>
  )
}

/**
 * A pill is a variable, so its inspector speaks that language: a name, a
 * value, a type, and what it is wired to. Name and type are the ports' (one
 * name mirrored on both rims), the value is the Block's title, and every
 * field stays editable even when a cable reaches the inlet.
 */
function PillSection({
  props,
  actions,
  pill,
}: {
  props: BlockShapeProps
  actions?: BlockInspectorActions
  pill?: PillInspectorFacts
}) {
  const readOnly = !actions
  const outlet = valueBlockOutlet(props)
  const name = valueBlockName(props)
  const ownType = outlet?.type ?? valueBlockInlet(props)?.type ?? ''
  const fedBy = pill?.fedBy ?? null
  const feeds = pill?.feeds ?? []
  const type = ownType
  const patchOutlet = (patch: Partial<Omit<BlockPort, 'id'>>) => {
    if (outlet) actions?.updatePort('outputs', outlet.id, patch, { continuous: true })
  }

  return (
    <section className="block-inspector__section" data-inspector-section="Pill">
      <div className="block-inspector__section-title">Pill</div>

      <label className="block-inspector__field">
        <span>Name</span>
        <LiveTextInput
          value={name}
          disabled={readOnly || !outlet}
          placeholder={EMPTY_FIELD_GUIDANCE.pill.name}
          ariaLabel="Variable name"
          beginEdit={() => actions?.beginEdit?.('name pill')}
          onWrite={(next) => patchOutlet({ name: next })}
        />
      </label>

      <label className="block-inspector__field">
        <span>Value</span>
        <LiveTextInput
          value={props.title}
          disabled={readOnly}
          placeholder={EMPTY_FIELD_GUIDANCE.pill.value}
          ariaLabel="Literal value"
          beginEdit={() => actions?.beginEdit?.('edit pill value')}
          onWrite={(title) => actions?.updateDetails({ title }, { continuous: true })}
        />
      </label>

      <label className="block-inspector__field">
        <span>Type</span>
        <LiveTextInput
          value={type}
          disabled={readOnly || !outlet}
          placeholder={EMPTY_FIELD_GUIDANCE.pill.type}
          ariaLabel="Variable type"
          beginEdit={() => actions?.beginEdit?.('retype pill')}
          onWrite={(next) => patchOutlet({ type: next })}
        />
      </label>

      <p className="block-inspector__hint" data-testid="pill-wiring">
        {fedBy
          ? `Connected from ${fedBy}${pill?.fedType ? ` (${pill.fedType})` : ''} — the cable does not replace this pill's literal or type.`
          : 'Inlet unwired — the literal is the value.'}
        {' '}
        {feeds.length > 0 ? `Feeds ${feeds.join(', ')}.` : 'Outlet unwired.'}
      </p>
      <button
        type="button"
        className="block-inspector__tag-ghost"
        data-testid="pill-adopt-cable-type"
        disabled={readOnly || fedBy === null}
        title="Explicitly copy the inlet cable's type"
        onClick={() => actions?.adoptConnectedType?.()}
      >
        Adopt cable type
      </button>
      <p className="block-inspector__hint">
        {name === ''
          ? 'Unnamed: passed inline where it is used.'
          : `Named: ${name} = … is hoisted before its first use.`}
        {' '}
        Canvas entry understands <code>name: Type = value</code>; these inspector
        fields stay literal for direct control. Wiring never derives them automatically;
        use “Adopt cable type” only when that calculation is wanted.
      </p>
    </section>
  )
}

const sectionKey = (row: number, branch: number) => `${row}:${branch}`

interface InspectorPortDrag {
  portId: string
  startY: number
  pointerY: number
  /** Where a release would put the port; null while the pointer offers nothing new. */
  target: BlockPortSectionTarget | null
  /** List-local geometry of the offered place. */
  barY: number | null
  band: { top: number; bottom: number } | null
}

interface ListSection {
  row: number
  branch: number
  /** Painted extent of the section's own items. */
  top: number
  bottom: number
  /** Extent that claims the pointer: the gaps to the neighbours split halfway. */
  claimTop: number
  claimBottom: number
  rows: { portId: string; top: number; bottom: number }[]
}

/**
 * Read the list as the canvas reads its layout: which section each painted
 * row belongs to, and where the sections meet. Only `li[data-section]` items
 * count — the divider lines between them carry no section of their own — so
 * the same list geometry serves the ordinary and the managed face.
 */
function readListSections(
  list: HTMLUListElement,
  heldPortId: string,
): { sections: ListSection[]; listTop: number } {
  const listRect = list.getBoundingClientRect()
  const byKey = new Map<string, ListSection>()
  const order: string[] = []
  for (const item of list.querySelectorAll<HTMLElement>(':scope > li[data-section]')) {
    // The held row rides the pointer, so its box says nothing about where the
    // rows are; the rows it left behind are the geometry.
    if (item.dataset.portId === heldPortId) continue
    const key = item.dataset.section ?? ''
    const rect = item.getBoundingClientRect()
    let section = byKey.get(key)
    if (!section) {
      section = {
        row: Number(item.dataset.row),
        branch: Number(item.dataset.branch),
        top: rect.top,
        bottom: rect.bottom,
        claimTop: rect.top,
        claimBottom: rect.bottom,
        rows: [],
      }
      byKey.set(key, section)
      order.push(key)
    }
    section.top = Math.min(section.top, rect.top)
    section.bottom = Math.max(section.bottom, rect.bottom)
    if (item.dataset.portId) {
      section.rows.push({ portId: item.dataset.portId, top: rect.top, bottom: rect.bottom })
    }
  }
  const sections = order.map((key) => byKey.get(key)!)
  sections.forEach((section, index) => {
    const previous = sections[index - 1]
    const next = sections[index + 1]
    section.claimTop = previous ? (previous.bottom + section.top) / 2 : Number.NEGATIVE_INFINITY
    section.claimBottom = next ? (section.bottom + next.top) / 2 : Number.POSITIVE_INFINITY
  })
  return { sections, listTop: listRect.top }
}

/** The place under a client `y`, in the same terms the canvas drop uses. */
function listDropTarget(
  list: HTMLUListElement,
  clientY: number,
  heldPortId: string,
): { target: BlockPortSectionTarget; barY: number; band: { top: number; bottom: number } } | null {
  const { sections, listTop } = readListSections(list, heldPortId)
  if (sections.length === 0) return null
  const section = sections.find((candidate) => clientY < candidate.claimBottom) ?? sections[sections.length - 1]
  const rows = section.rows
  let before: string | null = null
  let barY: number
  if (rows.length === 0) {
    barY = (section.top + section.bottom) / 2
  } else {
    const found = rows.findIndex((row) => clientY < (row.top + row.bottom) / 2)
    before = found === -1 ? null : rows[found].portId
    barY = found === 0
      ? rows[0].top - 3
      : found === -1
        ? rows[rows.length - 1].bottom + 3
        : (rows[found - 1].bottom + rows[found].top) / 2
  }
  return {
    target: { row: section.row, branch: section.branch, before },
    barY: barY - listTop,
    band: { top: section.top - listTop - 2, bottom: section.bottom - listTop + 2 },
  }
}

function DividerLine({
  side,
  kind,
  index,
}: {
  side: BlockPortSide
  kind: 'header' | 'row' | 'branch'
  index: number
}) {
  return (
    <li
      className={`block-inspector__divider block-inspector__divider--${kind}`}
      data-testid={`inspector-divider-${side}-${kind}-${index}`}
      aria-hidden="true"
    >
      <span className="block-inspector__divider-line" />
      <span className="block-inspector__divider-label">{kind}</span>
    </li>
  )
}

/**
 * A row's drop slot when no port of this lane is in it yet. Sections always
 * exist on both sides — a row is shared — so an empty one still has a place
 * to be dropped into; it stays slim until a drag makes it a target worth seeing.
 */
function EmptySection({
  side,
  row,
  branch,
  dragging,
}: {
  side: BlockPortSide
  row: number
  branch: number
  dragging: boolean
}) {
  return (
    <li
      className={`block-inspector__empty-section${dragging ? ' is-open' : ''}`}
      data-section={sectionKey(row, branch)}
      data-row={row}
      data-branch={branch}
      data-testid={`inspector-empty-${side}-${row}-${branch}`}
      aria-hidden="true"
    >
      {dragging ? (row === HEADER_ROW ? 'drop in header' : 'drop here') : null}
    </li>
  )
}

/**
 * Rare signature metadata belongs in the inspector, not in a new canvas
 * gesture. Imported PyBlocks boards populate it automatically; this panel is
 * the manual escape hatch when somebody authors a Block directly.
 */
function VariadicPortSettings({
	side,
	port,
	actions,
}: {
	side: BlockPortSide
	port: BlockPort
	actions?: BlockInspectorActions
}) {
	if (side !== 'inputs') return null
	const variadic = port.variadic
	const setKind = (kind: 'ordinary' | 'positional' | 'keyword') => {
		if (kind === 'ordinary') {
			actions?.updatePort(side, port.id, { variadic: undefined })
			return
		}
		const name = port.name.trim() || (kind === 'positional' ? 'args' : 'kwargs')
		actions?.updatePort(side, port.id, {
			variadic: {
				groupId: `${kind}:${name}`,
				label: `${kind === 'positional' ? '*' : '**'}${name}`,
				kind,
				bundled: variadic?.bundled ?? false,
			},
		})
	}
	const setLabel = (raw: string) => {
		if (!variadic) return
		const prefix = variadic.kind === 'positional' ? '*' : '**'
		const tail = raw.trim().replace(/^\*+/, '') || (variadic.kind === 'positional' ? 'args' : 'kwargs')
		actions?.updatePort(side, port.id, {
			variadic: { ...variadic, groupId: `${variadic.kind}:${tail}`, label: `${prefix}${tail}` },
		}, { continuous: true })
	}
	return (
		<details className="block-inspector__variadic" data-testid={`inspector-variadic-${port.id}`}>
			<summary>{variadic ? `Variadic · ${variadic.label}` : 'Variadic slot'}</summary>
			<div className="block-inspector__variadic-fields">
				<label>
					<span>Slot</span>
					<select
						value={variadic?.kind ?? 'ordinary'}
						disabled={!actions}
						aria-label={`Variadic role for ${port.name || port.id}`}
						onChange={(event) => setKind(event.currentTarget.value as 'ordinary' | 'positional' | 'keyword')}
					>
						<option value="ordinary">ordinary</option>
						<option value="positional">*args</option>
						<option value="keyword">**kwargs</option>
					</select>
				</label>
				{variadic ? (
					<>
						<LiveTextInput
							className="block-inspector__variadic-label"
							value={variadic.label}
							disabled={!actions}
							placeholder={variadic.kind === 'positional' ? '*args' : '**kwargs'}
							ariaLabel={`Variadic group label for ${port.name || port.id}`}
							beginEdit={() => actions?.beginEdit?.('edit variadic group label')}
							onWrite={setLabel}
						/>
						<button
							type="button"
							className="block-inspector__variadic-bundle"
							disabled={!actions}
							aria-pressed={variadic.bundled}
							title="A bundled spread is one unknown-cardinality *iterable or **mapping expression"
							onClick={() => actions?.updatePort(side, port.id, {
								variadic: { ...variadic, bundled: !variadic.bundled },
							})}
						>
							bundle
						</button>
					</>
				) : null}
			</div>
		</details>
	)
}

function PortSection({
  side,
  props,
  actions,
}: {
  side: BlockPortSide
  props: BlockShapeProps
  actions?: BlockInspectorActions
}) {
  const [managing, setManaging] = useState(false)
  const [drag, setDrag] = useState<InspectorPortDrag | null>(null)
  const dragRef = useRef<InspectorPortDrag | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const title = side === 'inputs' ? 'Inputs' : 'Outputs'
  const ports = props[side]
  const visiblePorts = ports.filter((port) => port.visible)
  const shown = (candidates: readonly BlockPort[]) => (
    managing ? candidates : candidates.filter((port) => port.visible)
  )
  // The same table the canvas paints, hidden ports in place: the list is the
  // burger read top to bottom, so the order here is the order on the Block.
  const table = blockPortSections(props)
  const lane = ports.map((port) => port.id)
  const isFirst = (portId: string) => lane[0] === portId
  const isLast = (portId: string) => lane[lane.length - 1] === portId

  const endDrag = () => {
    dragRef.current = null
    setDrag(null)
  }

  useEffect(() => endDrag, [])

  const startDrag = (event: ReactPointerEvent<HTMLElement>, portId: string) => {
    if (!actions || event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const pointerId = event.pointerId
    const next: InspectorPortDrag = {
      portId,
      startY: event.clientY,
      pointerY: event.clientY,
      target: null,
      barY: null,
      band: null,
    }
    dragRef.current = next
    setDrag(next)
    const doc = event.currentTarget.ownerDocument

    const onMove = (move: PointerEvent) => {
      const active = dragRef.current
      if (!active || move.pointerId !== pointerId) return
      move.preventDefault()
      const list = listRef.current
      const offered = list ? listDropTarget(list, move.clientY, active.portId) : null
      // A place that would leave the order as it is offers nothing: no bar,
      // no band, and releasing there is a no-op. The reducer is the oracle,
      // so hidden ports between two shown ones cannot fool the geometry.
      const moves = offered
        ? moveBlockPortToSectionProps(props, side, active.portId, offered.target) !== props
        : false
      const updated: InspectorPortDrag = {
        ...active,
        pointerY: move.clientY,
        target: moves && offered ? offered.target : null,
        barY: moves && offered ? offered.barY : null,
        band: moves && offered ? offered.band : null,
      }
      dragRef.current = updated
      setDrag(updated)
    }
    const finish = (up: PointerEvent, cancelled: boolean) => {
      if (up.pointerId !== pointerId) return
      const active = dragRef.current
      doc.removeEventListener('pointermove', onMove)
      doc.removeEventListener('pointerup', onUp)
      doc.removeEventListener('pointercancel', onCancel)
      doc.removeEventListener('keydown', onKey)
      endDrag()
      if (!cancelled && active?.target) actions.movePortToSection(side, active.portId, active.target)
    }
    const onUp = (up: PointerEvent) => finish(up, false)
    const onCancel = (up: PointerEvent) => finish(up, true)
    const onKey = (key: KeyboardEvent) => {
      if (key.key === 'Escape') finish({ pointerId } as PointerEvent, true)
    }
    doc.addEventListener('pointermove', onMove)
    doc.addEventListener('pointerup', onUp)
    doc.addEventListener('pointercancel', onCancel)
    doc.addEventListener('keydown', onKey)
  }

  const grip = (port: BlockPort) => (
    <button
      type="button"
      className="block-inspector__grip"
      disabled={!actions}
      aria-label={`Drag ${port.name || port.id} to another row`}
      title="Drag to reorder or move between rows · ↑↓ to step"
      data-testid={`inspector-port-grip-${side}-${port.id}`}
      onPointerDown={(event) => startDrag(event, port.id)}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
        event.preventDefault()
        actions?.movePort(side, port.id, event.key === 'ArrowUp' ? -1 : 1)
      }}
    >
      <GripIcon />
    </button>
  )

  const portRow = (port: BlockPort, row: number, branch: number) => {
    const held = drag?.portId === port.id
    const style = held && drag ? { transform: `translateY(${drag.pointerY - drag.startY}px)` } : undefined
    const shared = {
      'data-section': sectionKey(row, branch),
      'data-row': row,
      'data-branch': branch,
      'data-port-id': port.id,
      'data-testid': `inspector-port-${side}-${port.id}`,
    }
    if (managing) {
      return (
        <li
          key={port.id}
          className={`block-inspector__managed-row${held ? ' is-dragging' : ''}`}
          data-visible={port.visible}
          style={style}
          {...shared}
        >
          {grip(port)}
          <button
            type="button"
            className="block-inspector__eye"
            disabled={!actions}
            aria-pressed={port.visible}
            aria-label={`${port.visible ? 'Hide' : 'Show'} ${port.name || port.id}`}
            onClick={() => actions?.updatePort(side, port.id, { visible: !port.visible })}
          >
            <EyeIcon visible={port.visible} />
          </button>
          <span className="block-inspector__managed-name" title={port.name || port.id}>{port.name || port.id}</span>
          <span className="block-inspector__managed-type" title={port.type || 'type'}>{port.type || 'type'}</span>
          <span className="block-inspector__move-controls">
            <button
              type="button"
              disabled={!actions || (isFirst(port.id) && (side === 'outputs' || portInHeader(port)))}
              aria-label={`Move ${port.name || port.id} up`}
              onClick={() => actions?.movePort(side, port.id, -1)}
            >
              <ChevronIcon direction="up" />
            </button>
            <button
              type="button"
              disabled={!actions || isLast(port.id)}
              aria-label={`Move ${port.name || port.id} down`}
              onClick={() => actions?.movePort(side, port.id, 1)}
            >
              <ChevronIcon direction="down" />
            </button>
          </span>
        </li>
      )
    }
    // A derived port is not authored: it exists because an argument is marked as
    // written in place, its name is that argument's, and deleting it would only
    // have the next reconcile put it back. Show it, say why, and edit neither.
    if (isEffectPort(port)) {
      const source = mutatedInputId(port)
      return (
        <li
          key={port.id}
          className="block-inspector__port-row block-inspector__port-row--derived"
          {...shared}
          data-testid={`inspector-port-derived-${port.id}`}
        >
          <span className="block-inspector__derived-mark" aria-hidden="true">mut</span>
          <span className="block-inspector__derived-name">{port.name || port.id}</span>
          <span className="block-inspector__derived-note">
            {source ? `derived — ${source} is written in place` : 'derived'}
          </span>
        </li>
      )
    }
    return (
      <li
        key={port.id}
        className={`block-inspector__port-row${held ? ' is-dragging' : ''}`}
        style={style}
        {...shared}
      >
        {grip(port)}
        <LiveTextInput
          className="block-inspector__port-name"
          value={port.name}
          disabled={!actions}
          placeholder={EMPTY_FIELD_GUIDANCE.block.portName}
          ariaLabel={`${side} ${port.id} name`}
          beginEdit={() => actions?.beginEdit?.('rename block port')}
          onWrite={(name) => actions?.updatePort(side, port.id, { name }, { continuous: true })}
        />
        <LiveTextInput
          className="block-inspector__port-type"
          value={port.type}
          disabled={!actions}
          placeholder={EMPTY_FIELD_GUIDANCE.block.portType}
          ariaLabel={`${side} ${port.id} type`}
          beginEdit={() => actions?.beginEdit?.('retype block port')}
          onWrite={(type) => actions?.updatePort(side, port.id, { type }, { continuous: true })}
        />
        {side === 'inputs' ? (
          <LiveTextInput
            className="block-inspector__port-default"
            value={port.defaultValue ?? ''}
            disabled={!actions}
            placeholder={EMPTY_FIELD_GUIDANCE.block.defaultValue}
            ariaLabel={`Default value for ${port.name || port.id}`}
            beginEdit={() => actions?.beginEdit?.('edit port default')}
            onWrite={(defaultValue) =>
              actions?.updatePort(side, port.id, { defaultValue }, { continuous: true })}
          />
        ) : null}
        {side === 'inputs' ? (
          <button
            type="button"
            className="block-inspector__port-mutates"
            disabled={!actions}
            aria-pressed={portMutates(port)}
            data-testid={`inspector-port-mutates-${port.id}`}
            title={portMutates(port)
              ? `${port.name || port.id} is written in place; its new value leaves by the effect port`
              : `Mark ${port.name || port.id} as written in place`}
            aria-label={`${portMutates(port) ? 'Stop marking' : 'Mark'} ${port.name || port.id} as written in place`}
            onClick={() => {
              actions?.beginEdit?.('mark port as mutated')
              actions?.updatePort(side, port.id, { mutates: !portMutates(port) })
            }}
          >
            mut
          </button>
        ) : null}
			<VariadicPortSettings side={side} port={port} actions={actions} />
        <button
          type="button"
          className="block-inspector__icon-button block-inspector__delete"
          disabled={!actions}
          aria-label={`Remove ${port.name || port.id}`}
          title="Delete — this can drop a cable bound to the port"
          onClick={() => actions?.removePort(side, port.id)}
        >
          <XIcon />
        </button>
      </li>
    )
  }

  const dragging = Boolean(drag)
  const sectionItems = (members: readonly BlockPort[], row: number, branch: number) => {
    const visible = shown(members)
    return visible.length > 0
      ? visible.map((port) => portRow(port, row, branch))
      : <EmptySection key={`empty-${row}-${branch}`} side={side} row={row} branch={branch} dragging={dragging} />
  }

  const items: ReactNode[] = []
  if (side === 'inputs') {
    // The heading is the first row of the inputs: drag a port above the line
    // and it rides the heading band. The line is always there to drag above.
    items.push(...[sectionItems(table.header, HEADER_ROW, 0)].flat())
    items.push(<DividerLine key="divider-header" side={side} kind="header" index={0} />)
  }
  table.rows.forEach((section, rowIndex) => {
    if (rowIndex > 0) {
      items.push(<DividerLine key={`divider-row-${section.row}`} side={side} kind="row" index={section.row} />)
    }
    if (side === 'inputs') {
      items.push(...[sectionItems(section.inputs, section.row, 0)].flat())
      return
    }
    section.branches.forEach((arm, armIndex) => {
      if (armIndex > 0) {
        items.push(
          <DividerLine
            key={`divider-branch-${section.row}-${arm.branch}`}
            side={side}
            kind="branch"
            index={arm.branch}
          />,
        )
      }
      items.push(...[sectionItems(arm.outputs, section.row, arm.branch)].flat())
    })
  })

  return (
    <section className="block-inspector__section" aria-label={`${title} ports`} data-inspector-section={title}>
      <div className="block-inspector__section-title">
        <span>{title}</span>
        <span className="block-inspector__section-tools">
          <button
            type="button"
            className={`block-inspector__count-pill${managing ? ' is-active' : ''}`}
            aria-expanded={managing}
            onClick={() => setManaging((current) => !current)}
          >
            {managing ? 'Done' : `${visiblePorts.length} visible`}
          </button>
          <button
            type="button"
            className="block-inspector__icon-button"
            disabled={!actions}
            aria-label={`Add ${side === 'inputs' ? 'input' : 'output'} port`}
            onClick={() => actions?.addPort(side)}
          >
            <PlusIcon />
          </button>
        </span>
      </div>

      {ports.length === 0 && side === 'outputs' ? (
        <p className="block-inspector__hint">No outputs yet.</p>
      ) : !managing && ports.length > 0 && visiblePorts.length === 0 ? (
        <p className="block-inspector__hint">All {ports.length} hidden — manage to show.</p>
      ) : (
        <ul
          ref={listRef}
          className={`block-inspector__ports${managing ? ' block-inspector__ports--managed' : ''}${dragging ? ' is-dragging' : ''}`}
          data-testid={`inspector-ports-${side}`}
        >
          {items.map((item, index) => <Fragment key={index}>{item}</Fragment>)}
          {drag?.band ? (
            <li
              className="block-inspector__drop-band"
              data-testid="inspector-drop-band"
              aria-hidden="true"
              style={{ top: drag.band.top, height: Math.max(0, drag.band.bottom - drag.band.top) }}
            />
          ) : null}
          {drag?.barY !== null && drag?.barY !== undefined ? (
            <li
              className="block-inspector__drop-bar"
              data-testid="inspector-drop-bar"
              aria-hidden="true"
              style={{ top: drag.barY }}
            />
          ) : null}
        </ul>
      )}

      {managing && ports.length > 1 ? (
        <p className="block-inspector__port-help">
          Show or hide without changing port identity · drag the grip or use the arrows to reorder; cross a line to change row.
        </p>
      ) : null}
    </section>
  )
}

/** Frame-free inspector body backed only by the public Block command adapter. */
export function BlockInspectorContent({
  props,
  actions,
  status = 'selected',
  initialTab = 'details',
  onRequestClose,
  pill,
}: BlockInspectorContentProps) {
  const [tab, setTab] = useState<InspectorTab>(initialTab)
  const readOnly = !actions
  const unsupportedControlTitle = 'Tags are intentionally future scope for this Block development profile'

  return (
    <section className="block-inspector" aria-label="Block inspector" data-status={status}>
      <nav className="block-inspector__tabs" role="tablist" aria-label="Block inspector">
        <button
          type="button"
          role="tab"
          className={tab === 'details' ? 'is-active' : ''}
          aria-selected={tab === 'details'}
          onClick={() => setTab('details')}
        >
          Details
        </button>
        <button
          type="button"
          role="tab"
          className={tab === 'notes' ? 'is-active' : ''}
          aria-selected={tab === 'notes'}
          onClick={() => setTab('notes')}
        >
          <FileTextIcon />
          Notes
        </button>
        {onRequestClose ? (
          <button
            type="button"
            className="block-inspector__dock-close"
            aria-label="Close Block inspector"
            onClick={onRequestClose}
          >
            <XIcon />
          </button>
        ) : null}
      </nav>

      {status === 'new' && readOnly ? (
        <p className="block-inspector__notice">Place a Block to edit these defaults.</p>
      ) : null}

      {tab === 'notes' ? (
        <section className="block-inspector__notes" role="tabpanel" aria-label="Detailed notes">
          <header>
            <span className="block-inspector__section-title">Detailed notes</span>
            <p>Long-form context that should not live on the canvas.</p>
          </header>
          <NotesEditor value={props.notes ?? ''} disabled={readOnly} actions={actions} />
        </section>
      ) : (
        <div className="block-inspector__body" role="tabpanel" aria-label="Block details">
          {props.view === 'value' ? (
            <PillSection props={props} actions={actions} pill={pill} />
          ) : (
            <>
          <section className="block-inspector__section" data-inspector-section="Block">
            <div className="block-inspector__section-title">Block</div>

            <label className="block-inspector__field">
              <span>Title</span>
              <LiveTextInput
                value={props.title}
                disabled={readOnly}
                placeholder={EMPTY_FIELD_GUIDANCE.block.title}
                ariaLabel="Block title"
                beginEdit={() => actions?.beginEdit?.('rename block')}
                onWrite={(title) => actions?.updateDetails({ title }, { continuous: true })}
                onEditEnd={() => actions?.commitTitle?.()}
              />
              {definitionBadge(props) ? (
                <small className="block-inspector__definition-badge">{definitionBadge(props)}</small>
              ) : null}
            </label>

            <div className="block-inspector__field">
              <span>Type</span>
              <IconPicker
                value={props.icon ?? ''}
                disabled={readOnly}
                onChange={(icon) => actions?.updateDetails({ icon })}
              />
              <LiveTextInput
                value={props.blockType}
                disabled={readOnly}
                placeholder={EMPTY_FIELD_GUIDANCE.block.type}
                ariaLabel="Block type"
                beginEdit={() => actions?.beginEdit?.('retype block')}
                onWrite={(blockType) => actions?.updateDetails({ blockType }, { continuous: true })}
              />
            </div>

            <DescriptionEditor
              value={props.description}
              visible={props.showDescription}
              disabled={readOnly}
              actions={actions}
              onToggle={() => actions?.updateDetails({ showDescription: !props.showDescription })}
            />
          </section>

          <section className="block-inspector__section" data-inspector-section="Tags">
            <div className="block-inspector__section-title">Tags</div>
            <button
              type="button"
              className="block-inspector__tag-ghost"
              aria-disabled="true"
              aria-label="Tag assignment is not available in this Block model"
              title={unsupportedControlTitle}
              tabIndex={-1}
              onClick={() => {}}
            >
              <PlusIcon />
              Add tags
            </button>
          </section>

            </>
          )}

          {props.view !== 'value' ? (
            <>
              <section className="block-inspector__section" data-inspector-section="View">
                <div className="block-inspector__section-title">View</div>
                <div className="block-inspector__choices" role="group" aria-label="Block view">
                  {BLOCK_PRESENTATION_VIEWS.map((view) => (
                    <button
                      key={view}
                      type="button"
                      disabled={readOnly}
                      aria-pressed={props.view === view}
                      onClick={() => actions?.setView(view)}
                    >
                      {view}
                    </button>
                  ))}
                </div>
                <p className="block-inspector__hint">
                  Each view keeps its own size — {props.view} is {Math.round(props.w)}×{Math.round(props.h)}.
                </p>
              </section>

              <PortSection side="inputs" props={props} actions={actions} />
              <PortSection side="outputs" props={props} actions={actions} />

              <section className="block-inspector__section" data-inspector-section="Ports">
                <div className="block-inspector__section-title">Ports</div>
                <div
                  className="block-inspector__choices"
                  role="group"
                  aria-label="Port layout"
                >
                  <button
                    type="button"
                    disabled={readOnly}
                    aria-pressed={(props.portLayout ?? 'inline') === 'offset'}
                    onClick={() => actions?.updateDetails({ portLayout: 'offset' })}
                  >
                    offset
                  </button>
                  <button
                    type="button"
                    disabled={readOnly}
                    aria-pressed={(props.portLayout ?? 'inline') === 'inline'}
                    onClick={() => actions?.updateDetails({ portLayout: 'inline' })}
                  >
                    aligned
                  </button>
                </div>
                <p className="block-inspector__hint">
                  Aligned shares rows between inputs and outputs; offset stacks the outputs below the inputs.
                </p>
              </section>
            </>
          ) : null}
        </div>
      )}
    </section>
  )
}

export interface EditorBlockInspectorProps {
  editor: Editor
  toolDraft?: BlockShapeProps
  onToolDraftChange?: (props: BlockShapeProps) => void
  onRequestClose?: () => void
}

/** Reactive adapter from the public Editor selection/tool state to the frame-free body. */
export function EditorBlockInspector({
  editor,
  toolDraft,
  onToolDraftChange,
  onRequestClose,
}: EditorBlockInspectorProps) {
  const context = useValue(
    'SystemSketch Block inspector context',
    (previous?: unknown) => {
      const next = getBlockInspectorContext(editor)
      return sameBlockInspectorContext(previous, next) ? previous : next
    },
    [editor],
  )
  const [localDraft, setLocalDraft] = useState<BlockShapeProps | null>(null)
  const draft = toolDraft ?? localDraft ?? (context.kind === 'tool' ? context.props : null)

  // What the selected pill is wired to, in words: read from the same cable
  // table the dots read, so the panel and the canvas cannot disagree.
  const pillFacts = useValue<PillInspectorFacts | undefined>(
    'SystemSketch pill wiring',
    () => {
      const selected = getOnlySelectedBlock(editor)
      if (!selected || selected.props.view !== 'value') return undefined
      const otherPort = (connection: BlockPortConnection) => {
        const other = editor.getShape(connection.connectedShapeId)
        if (!isBlockShape(other)) return null
        const port = [...other.props.inputs, ...other.props.outputs]
          .find((candidate) => candidate.id === connection.connectedPortId) ?? null
        const title = other.props.title || (other.props.view === 'value' ? 'a pill' : 'a Block')
        return { title, port }
      }
      const describe = (connection: BlockPortConnection) => {
        const found = otherPort(connection)
        if (!found) return 'a shape'
        return found.port?.name ? `${found.title} · ${found.port.name}` : found.title
      }
      const inlet = selected.props.inputs[0]?.id
      const outlet = selected.props.outputs[0]?.id
      const connections = getBlockPortConnections(editor, selected.id)
      const feeding = connections.find((c) => c.ownPortId === inlet) ?? null
      return {
        fedBy: feeding ? describe(feeding) : null,
        fedType: feeding ? (otherPort(feeding)?.port?.type || null) : null,
        feeds: connections.filter((c) => c.ownPortId === outlet).map(describe),
      }
    },
    [editor],
  )

  const actions = useMemo<BlockInspectorActions | undefined>(() => {
    if (context.kind === 'selected') {
      const id = context.shape.id
      // A continuous field writes on every keystroke, so it must not also stamp
      // a history mark per keystroke; `beginEdit` marks once for the gesture.
      const history = (options?: BlockEditOptions) =>
        options?.continuous ? ({ historyLabel: false } as const) : undefined
      return {
        updateDetails: (patch, options) =>
          void updateBlockDetails(editor, id, patch, history(options)),
        setView: (view) => void setBlockView(editor, id, view),
        addPort: (side) => void appendBlockPort(editor, id, side),
        updatePort: (side, portId, patch, options) =>
          void updateBlockPort(editor, id, side, portId, patch, history(options)),
        removePort: (side, portId) => void removeBlockPort(editor, id, side, portId),
        movePort: (side, portId, delta) => void moveBlockPort(editor, id, side, portId, delta),
        movePortToSection: (side, portId, target) =>
          void moveBlockPortToSection(editor, id, side, portId, target),
        adoptConnectedType: () => void adoptConnectedPillType(editor, id),
        beginEdit: (label) => void editor.markHistoryStoppingPoint(label),
        commitTitle: () => commitBlockDefinitionName(editor, id),
      }
    }
    if (context.kind !== 'tool' || !onToolDraftChange) return undefined

    const changeDraft = (change: (props: BlockShapeProps) => BlockShapeProps) => {
      const current = toolDraft ?? localDraft ?? context.props
      const next = change(current)
      setLocalDraft(next)
      onToolDraftChange(next)
    }
    return {
      updateDetails: (patch) => changeDraft((props) => patchBlockDetailsProps(props, patch)),
      setView: (view) => changeDraft((props) => setBlockViewProps(props, view)),
      addPort: (side) => changeDraft((props) => appendBlockPortProps(props, side)),
      updatePort: (side, portId, patch) =>
        changeDraft((props) => patchBlockPortProps(props, side, portId, patch)),
      removePort: (side, portId) =>
        changeDraft((props) => removeBlockPortProps(props, side, portId)),
      movePort: (side, portId, delta) =>
        changeDraft((props) => moveBlockPortProps(props, side, portId, delta)),
      movePortToSection: (side, portId, target) =>
        changeDraft((props) => moveBlockPortToSectionProps(props, side, portId, target)),
    }
  }, [context, editor, localDraft, onToolDraftChange, toolDraft])

  if (context.kind === 'multi') {
    return (
      <BlockBatchInspectorContent
        blockCount={context.styles.blockCount}
        view={context.styles.view}
        portLayout={context.styles.portLayout}
        showDescription={context.styles.showDescription}
        actions={{
          setView: (view) => void setBlockViewForSelection(editor, view),
          setPortLayout: (portLayout) =>
            void setBlockPortLayoutForSelection(editor, portLayout),
          setShowDescription: (showDescription) =>
            void setBlockShowDescriptionForSelection(editor, showDescription),
        }}
        onRequestClose={onRequestClose}
      />
    )
  }

  if (context.kind === 'empty') {
    return (
      <div className="block-inspector block-inspector--empty">
        <p>Select a Block to inspect it.</p>
      </div>
    )
  }

  return (
    <BlockInspectorContent
      props={context.kind === 'selected' ? context.props : (draft ?? context.props)}
      status={context.kind === 'selected' ? 'selected' : 'new'}
      actions={actions}
      pill={pillFacts}
      onRequestClose={onRequestClose}
    />
  )
}

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { type Editor, useValue } from 'tldraw'

import { LiveTextArea, LiveTextInput, useLiveField } from '../../fields'

import {
  BLOCK_VIEWS,
  type BlockPort,
  type BlockPortSide,
  type BlockShapeProps,
  type BlockView,
  setBlockViewProps,
} from '../blockModel'
import {
  appendBlockPort,
  appendBlockPortProps,
  getBlockInspectorContext,
  sameBlockInspectorContext,
  moveBlockPort,
  moveBlockPortProps,
  patchBlockDetailsProps,
  patchBlockPortProps,
  removeBlockPort,
  removeBlockPortProps,
  setBlockView,
  updateBlockDetails,
  updateBlockPort,
  type BlockDetailsPatch,
} from '../commands/blockCommands'
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
  setView(view: BlockView): void
  addPort(side: BlockPortSide): void
  updatePort(
    side: BlockPortSide,
    portId: string,
    patch: Partial<Omit<BlockPort, 'id'>>,
    options?: BlockEditOptions,
  ): void
  removePort(side: BlockPortSide, portId: string): void
  movePort(side: BlockPortSide, portId: string, delta: -1 | 1): void
  /** Open one undo step for a typing gesture. Absent for an unplaced draft. */
  beginEdit?(label: string): void
}

export interface BlockInspectorContentProps {
  props: BlockShapeProps
  actions?: BlockInspectorActions
  status?: 'selected' | 'new'
  initialTab?: InspectorTab
  onRequestClose?: () => void
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
      placeholder="Implementation notes, context, caveats, links…"
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
        placeholder="A short summary shown on the block"
      />
      <p className="block-inspector__field-help">
        Shown at a glance · keep implementation detail in Notes.
      </p>
    </div>
  )
}

function PortSection({
  side,
  ports,
  actions,
}: {
  side: BlockPortSide
  ports: readonly BlockPort[]
  actions?: BlockInspectorActions
}) {
  const [managing, setManaging] = useState(false)
  const title = side === 'inputs' ? 'Inputs' : 'Outputs'
  const visiblePorts = ports.filter((port) => port.visible)
  const shownPorts = managing ? ports : visiblePorts

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

      {shownPorts.length === 0 ? (
        <p className="block-inspector__hint">
          {ports.length === 0 ? `No ${side} yet.` : `All ${ports.length} hidden — manage to show.`}
        </p>
      ) : managing ? (
        <ul className="block-inspector__ports block-inspector__ports--managed">
          {shownPorts.map((port, index) => (
            <li key={port.id} className="block-inspector__managed-row" data-visible={port.visible}>
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
              <span className="block-inspector__managed-name">{port.name || port.id}</span>
              <span className="block-inspector__managed-type">{port.type || 'type'}</span>
              <span className="block-inspector__move-controls">
                <button
                  type="button"
                  disabled={!actions || index === 0}
                  aria-label={`Move ${port.name || port.id} up`}
                  onClick={() => actions?.movePort(side, port.id, -1)}
                >
                  <ChevronIcon direction="up" />
                </button>
                <button
                  type="button"
                  disabled={!actions || index === shownPorts.length - 1}
                  aria-label={`Move ${port.name || port.id} down`}
                  onClick={() => actions?.movePort(side, port.id, 1)}
                >
                  <ChevronIcon direction="down" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="block-inspector__ports">
          {shownPorts.map((port) => (
            <li key={port.id} className="block-inspector__port-row">
              <LiveTextInput
                className="block-inspector__port-name"
                value={port.name}
                disabled={!actions}
                placeholder="name"
                ariaLabel={`${side} ${port.id} name`}
                beginEdit={() => actions?.beginEdit?.('rename block port')}
                onWrite={(name) => actions?.updatePort(side, port.id, { name }, { continuous: true })}
              />
              <LiveTextInput
                className="block-inspector__port-type"
                value={port.type}
                disabled={!actions}
                placeholder="type"
                ariaLabel={`${side} ${port.id} type`}
                beginEdit={() => actions?.beginEdit?.('retype block port')}
                onWrite={(type) => actions?.updatePort(side, port.id, { type }, { continuous: true })}
              />
              {side === 'inputs' ? (
                <LiveTextInput
                  className="block-inspector__port-default"
                  value={port.defaultValue ?? ''}
                  disabled={!actions}
                  placeholder="="
                  ariaLabel={`Default value for ${port.name || port.id}`}
                  beginEdit={() => actions?.beginEdit?.('edit port default')}
                  onWrite={(defaultValue) =>
                    actions?.updatePort(side, port.id, { defaultValue }, { continuous: true })}
                />
              ) : null}
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
          ))}
        </ul>
      )}

      {managing && ports.length > 1 ? (
        <p className="block-inspector__port-help">
          Show or hide without changing port identity · use the arrows to reorder.
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
          <section className="block-inspector__section" data-inspector-section="Block">
            <div className="block-inspector__section-title">Block</div>

            <label className="block-inspector__field">
              <span>Title</span>
              <LiveTextInput
                value={props.title}
                disabled={readOnly}
                placeholder="build_report"
                ariaLabel="Block title"
                beginEdit={() => actions?.beginEdit?.('rename block')}
                onWrite={(title) => actions?.updateDetails({ title }, { continuous: true })}
              />
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
                placeholder="call"
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

          <section className="block-inspector__section" data-inspector-section="View">
            <div className="block-inspector__section-title">View</div>
            <div className="block-inspector__choices" role="group" aria-label="Block view">
              {BLOCK_VIEWS.map((view) => (
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

          <PortSection side="inputs" ports={props.inputs} actions={actions} />
          <PortSection side="outputs" ports={props.outputs} actions={actions} />

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
        beginEdit: (label) => void editor.markHistoryStoppingPoint(label),
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
      onRequestClose={onRequestClose}
    />
  )
}

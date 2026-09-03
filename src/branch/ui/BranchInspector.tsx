/**
 * The Branch inspector, in the Block inspector's idiom and the layout Zach
 * asked to be copied exactly: a CONTROL PORTS list (name, type, colour, ×)
 * that lands on the band, and an ARMS list (drag handle, title, fold, make
 * active, ×) in source order. Every control writes through `branchCommands`.
 */
import { useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { type Editor, useValue } from 'tldraw'

import { LiveTextInput } from '../../fields'
import { EMPTY_FIELD_GUIDANCE } from '../../fields/emptyFieldGuidance'
import { portColor } from '../../blocks/ui/portPalette'
import {
	addBranchArm,
	addBranchControl,
	getOnlySelectedBranch,
	moveBranchArm,
	removeBranchArm,
	removeBranchControl,
	setBranchTitle,
	setBranchView,
	toggleBranchActiveArm,
	toggleBranchArmOpen,
	updateBranchArm,
	updateBranchControl,
} from '../branchCommands'
import { BRANCH_VIEWS, type BranchShape, type BranchShapeProps, type BranchView } from '../branchModel'
import '../../blocks/ui/block-inspector.css'
import './branch-inspector.css'

export interface BranchInspectorActions {
	setTitle(title: string): void
	setView(view: BranchView): void
	addControl(): void
	updateControl(portId: string, patch: { name?: string; type?: string }): void
	removeControl(portId: string): void
	addArm(): void
	renameArm(armId: string, title: string): void
	removeArm(armId: string): void
	moveArm(armId: string, toIndex: number): void
	toggleArmOpen(armId: string): void
	toggleActive(armId: string): void
	beginEdit(label: string): void
}

function TinyIcon({ children }: { children: ReactNode }) {
	return (
		<svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden="true">
			{children}
		</svg>
	)
}

function PlusIcon() {
	return <TinyIcon><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></TinyIcon>
}

function XIcon() {
	return <TinyIcon><path d="m4 4 8 8m0-8-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></TinyIcon>
}

function ChevronIcon({ open }: { open: boolean }) {
	return (
		<TinyIcon>
			<path d={open ? 'm4.5 6.5 3.5 3 3.5-3' : 'm6.5 4.5 3 3.5-3 3.5'} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
		</TinyIcon>
	)
}

function TargetIcon({ active }: { active: boolean }) {
	return (
		<TinyIcon>
			<circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.4" fill={active ? 'currentColor' : 'none'} />
			<circle cx="8" cy="8" r="1.6" fill={active ? 'var(--ss-surface-raised)' : 'currentColor'} />
		</TinyIcon>
	)
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

function ControlPortsSection({ props, actions }: { props: BranchShapeProps; actions?: BranchInspectorActions }) {
	const count = props.controls.length
	return (
		<section className="block-inspector__section" aria-label="Control ports" data-inspector-section="Control ports">
			<div className="block-inspector__section-title">
				<span>Control ports</span>
				<span className="block-inspector__section-tools">
					<span className="block-inspector__count-pill branch-inspector__count" aria-live="polite">
						{count} on band
					</span>
					<button
						type="button"
						className="block-inspector__icon-button"
						disabled={!actions}
						aria-label="Add control port"
						data-testid="branch-inspector-add-control"
						onClick={() => actions?.addControl()}
					>
						<PlusIcon />
					</button>
				</span>
			</div>
			{count === 0 ? (
				<p className="block-inspector__hint">No control ports yet.</p>
			) : (
				<ul className="block-inspector__ports branch-inspector__controls">
					{props.controls.map((port) => (
						<li key={port.id} className="block-inspector__port-row branch-inspector__control-row" data-control-id={port.id}>
							<LiveTextInput
								className="block-inspector__port-name"
								value={port.name}
								disabled={!actions}
								placeholder={EMPTY_FIELD_GUIDANCE.branch.controlName}
								ariaLabel={`Control port ${port.id} name`}
								beginEdit={() => actions?.beginEdit('rename branch control port')}
								onWrite={(name) => actions?.updateControl(port.id, { name })}
							/>
							<LiveTextInput
								className="block-inspector__port-type"
								value={port.type}
								disabled={!actions}
								placeholder={EMPTY_FIELD_GUIDANCE.branch.controlType}
								ariaLabel={`Control port ${port.id} type`}
								beginEdit={() => actions?.beginEdit('retype branch control port')}
								onWrite={(type) => actions?.updateControl(port.id, { type })}
							/>
							<span
								className="branch-inspector__colour"
								style={{ background: portColor(port.type) }}
								aria-hidden="true"
							/>
							<button
								type="button"
								className="block-inspector__icon-button block-inspector__delete"
								disabled={!actions}
								aria-label={`Remove ${port.name || port.id}`}
								title="Delete — this drops any cable bound to the port"
								onClick={() => actions?.removeControl(port.id)}
							>
								<XIcon />
							</button>
						</li>
					))}
				</ul>
			)}
			<p className="block-inspector__hint">
				A control port is a value the branch decides on. It lands on the band, never on an arm.
			</p>
		</section>
	)
}

function ArmsSection({ props, actions }: { props: BranchShapeProps; actions?: BranchInspectorActions }) {
	const listRef = useRef<HTMLUListElement>(null)
	const [drag, setDrag] = useState<{ armId: string; overIndex: number } | null>(null)

	const indexAt = (clientY: number): number => {
		const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-arm-id]') ?? [])
		for (let index = 0; index < rows.length; index += 1) {
			const rect = rows[index].getBoundingClientRect()
			if (clientY < rect.top + rect.height / 2) return index
		}
		return rows.length - 1
	}

	const onGripPointerDown = (armId: string) => (event: ReactPointerEvent<HTMLButtonElement>) => {
		if (!actions) return
		event.preventDefault()
		const handle = event.currentTarget
		handle.setPointerCapture(event.pointerId)
		const start = props.arms.findIndex((arm) => arm.id === armId)
		setDrag({ armId, overIndex: start })
		const onMove = (move: PointerEvent) => setDrag({ armId, overIndex: indexAt(move.clientY) })
		const onUp = (up: PointerEvent) => {
			handle.removeEventListener('pointermove', onMove)
			handle.removeEventListener('pointerup', onUp)
			handle.removeEventListener('pointercancel', onUp)
			const target = indexAt(up.clientY)
			setDrag(null)
			if (target !== start) actions.moveArm(armId, target)
		}
		handle.addEventListener('pointermove', onMove)
		handle.addEventListener('pointerup', onUp)
		handle.addEventListener('pointercancel', onUp)
	}

	return (
		<section className="block-inspector__section" aria-label="Arms" data-inspector-section="Arms">
			<div className="block-inspector__section-title">
				<span>Arms</span>
				<span className="block-inspector__section-tools">
					<span className="block-inspector__count-pill branch-inspector__count" aria-live="polite">{props.arms.length}</span>
					<button
						type="button"
						className="block-inspector__icon-button"
						disabled={!actions}
						aria-label="Add arm"
						data-testid="branch-inspector-add-arm"
						onClick={() => actions?.addArm()}
					>
						<PlusIcon />
					</button>
				</span>
			</div>
			<ul className="block-inspector__ports branch-inspector__arms" ref={listRef}>
				{props.arms.map((arm, index) => {
					const label = arm.title.trim() || arm.id
					const active = props.activeArmId === arm.id
					return (
						<li
							key={arm.id}
							className="block-inspector__port-row branch-inspector__arm-row"
							data-arm-id={arm.id}
							data-drag-over={drag && drag.overIndex === index && drag.armId !== arm.id ? 'true' : undefined}
							data-dragging={drag?.armId === arm.id ? 'true' : undefined}
						>
							<button
								type="button"
								className="branch-inspector__grip"
								disabled={!actions}
								aria-label={`Reorder ${label}`}
								title="Drag to reorder"
								data-testid={`branch-inspector-grip-${arm.id}`}
								onPointerDown={onGripPointerDown(arm.id)}
							>
								<GripIcon />
							</button>
							<LiveTextInput
								className="block-inspector__port-name branch-inspector__arm-title"
								value={arm.title}
								disabled={!actions}
								placeholder={EMPTY_FIELD_GUIDANCE.branch.armTitle}
								ariaLabel={`Arm ${arm.id} title`}
								beginEdit={() => actions?.beginEdit('rename branch arm')}
								onWrite={(title) => actions?.renameArm(arm.id, title)}
							/>
							<button
								type="button"
								className="block-inspector__icon-button branch-inspector__fold"
								disabled={!actions}
								aria-pressed={arm.open}
								aria-label={`${arm.open ? 'Fold' : 'Open'} ${label}`}
								data-testid={`branch-inspector-fold-${arm.id}`}
								onClick={() => actions?.toggleArmOpen(arm.id)}
							>
								<ChevronIcon open={arm.open} />
							</button>
							<button
								type="button"
								className="block-inspector__icon-button branch-inspector__active"
								disabled={!actions}
								aria-pressed={active}
								aria-label={active ? `Clear active case (${label})` : `Make ${label} the active case`}
								data-testid={`branch-inspector-active-${arm.id}`}
								onClick={() => actions?.toggleActive(arm.id)}
							>
								<TargetIcon active={active} />
							</button>
							<button
								type="button"
								className="block-inspector__icon-button block-inspector__delete"
								disabled={!actions || props.arms.length <= 1}
								aria-label={`Remove arm ${label}`}
								title="Delete — its Blocks move out of the Branch"
								onClick={() => actions?.removeArm(arm.id)}
							>
								<XIcon />
							</button>
						</li>
					)
				})}
			</ul>
			<p className="block-inspector__hint">
				One row per case, in source order. ⌄ folds, ◎ makes active; drag ⋮⋮ to reorder.
			</p>
		</section>
	)
}

export function BranchInspectorContent({
	props,
	actions,
	onRequestClose,
}: {
	props: BranchShapeProps
	actions?: BranchInspectorActions
	onRequestClose?: () => void
}) {
	const readOnly = !actions
	return (
		<section className="block-inspector branch-inspector" aria-label="Branch inspector" data-status="selected">
			<nav className="block-inspector__tabs" role="tablist" aria-label="Branch inspector">
				<button type="button" role="tab" className="is-active" aria-selected="true">Branch</button>
				{onRequestClose ? (
					<button type="button" className="block-inspector__dock-close" aria-label="Close Branch inspector" onClick={onRequestClose}>
						<XIcon />
					</button>
				) : null}
			</nav>
			<div className="block-inspector__body" role="tabpanel" aria-label="Branch details">
				<section className="block-inspector__section" data-inspector-section="Branch">
					<div className="block-inspector__section-title">Branch</div>
					<label className="block-inspector__field">
						<span>Title</span>
						<LiveTextInput
							value={props.title}
							disabled={readOnly}
							placeholder={EMPTY_FIELD_GUIDANCE.branch.title}
							ariaLabel="Branch title"
							beginEdit={() => actions?.beginEdit('rename branch')}
							onWrite={(title) => actions?.setTitle(title)}
						/>
					</label>
				</section>

				<section className="block-inspector__section" data-inspector-section="View">
					<div className="block-inspector__section-title">View</div>
					<div className="block-inspector__choices" role="group" aria-label="Branch view">
						{BRANCH_VIEWS.map((view) => (
							<button
								key={view}
								type="button"
								disabled={readOnly}
								aria-pressed={props.view === view}
								data-testid={`branch-inspector-view-${view}`}
								onClick={() => actions?.setView(view)}
							>
								{view}
							</button>
						))}
					</div>
					<p className="block-inspector__hint">
						{props.view === 'case'
							? 'Case shows one open arm at a time and only its wires.'
							: 'Expanded lets any arms be open; a folded arm keeps its wires at its header.'}
					</p>
				</section>

				<ControlPortsSection props={props} actions={actions} />
				<ArmsSection props={props} actions={actions} />
			</div>
		</section>
	)
}

/** Reactive adapter from the selection to the Branch inspector body. */
export function EditorBranchInspector({ editor, onRequestClose }: { editor: Editor; onRequestClose?: () => void }) {
	const branch = useValue(
		'SystemSketch Branch inspector subject',
		(previous?: unknown) => {
			const next = getOnlySelectedBranch(editor)
			const before = previous as BranchShape | null | undefined
			if (before && next && before.id === next.id && before.props === next.props) return before
			return next
		},
		[editor],
	)
	const actions = useMemo<BranchInspectorActions | undefined>(() => {
		if (!branch) return undefined
		const id = branch.id
		const continuous = { historyLabel: false } as const
		return {
			setTitle: (title) => void setBranchTitle(editor, id, title, continuous),
			setView: (view) => void setBranchView(editor, id, view),
			addControl: () => void addBranchControl(editor, id),
			updateControl: (portId, patch) => void updateBranchControl(editor, id, portId, patch, continuous),
			removeControl: (portId) => void removeBranchControl(editor, id, portId),
			addArm: () => void addBranchArm(editor, id),
			renameArm: (armId, title) => void updateBranchArm(editor, id, armId, { title }, continuous),
			removeArm: (armId) => void removeBranchArm(editor, id, armId),
			moveArm: (armId, toIndex) => void moveBranchArm(editor, id, armId, toIndex),
			toggleArmOpen: (armId) => void toggleBranchArmOpen(editor, id, armId),
			toggleActive: (armId) => void toggleBranchActiveArm(editor, id, armId),
			beginEdit: (label) => void editor.markHistoryStoppingPoint(label),
		}
	}, [branch, editor])

	if (!branch) {
		return (
			<div className="block-inspector block-inspector--empty">
				<p>Select a Branch to inspect it.</p>
			</div>
		)
	}
	return <BranchInspectorContent props={branch.props} actions={actions} onRequestClose={onRequestClose} />
}

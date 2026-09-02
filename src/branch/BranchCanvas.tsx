/**
 * The Branch region's HTML face: a band with control-port dots, then one
 * header row per arm with a fold chevron, an editable title and a make-active
 * target, then the dashed "+ arm" row while the region is selected.
 *
 * The dots reuse the Block's `.Port` element and classes on purpose: the
 * capture listener in `installConnections.ts` turns a press on any
 * `.systemsketch-block-canvas .Port` into a cable, and the eligible / hinting
 * paint rides the same rules. Nothing about a control port is new to the
 * connection layer except which shape it hangs off.
 */
import { useCallback, useMemo, type CSSProperties } from 'react'
import { HTMLContainer, useEditor, useValue } from 'tldraw'

import { getBlockPortConnections } from '../blocks/connections/blockPorts'
import { judgeConnection } from '../blocks/connections/connectionRules'
import { getEligiblePorts, portState } from '../blocks/ports'
import { PortCountBadge, countProducers } from '../blocks/ui/BlockCanvas'
import { portColor } from '../blocks/ui/portPalette'
import { BranchInlineEditor } from './BranchInlineEditor'
import {
	addBranchArm,
	addBranchControl,
	toggleBranchActiveArm,
	toggleBranchArmOpen,
} from './branchCommands'
import {
	branchInlineFieldAttribute,
	parseBranchInlineFieldAttribute,
	rememberBranchInlineField,
	requestBranchInlineEdit,
} from './branchInlineEditing'
import {
	BRANCH_FADE_OPACITY,
	branchLayout,
	type BranchArmLayout,
	type BranchControlLayout,
	type BranchRect,
	type BranchShape,
} from './branchModel'
import { branchFadeOpacity } from './branchScope'
import './branch-canvas.css'

const boxStyle = (box: BranchRect): CSSProperties => ({
	position: 'absolute',
	left: box.x,
	top: box.y,
	width: box.w,
	height: box.h,
})

function ControlPortDot({ shape, control, connected, producers }: {
	shape: BranchShape
	control: BranchControlLayout
	connected: boolean
	producers: number
}) {
	const editor = useEditor()
	const portId = control.port.id
	const isHinting = useValue('branch port hinting', () => {
		const { hintingPort } = portState.get(editor)
		return hintingPort?.shapeId === shape.id && hintingPort.portId === portId
	}, [editor, shape.id, portId])
	const isEligible = useValue('branch port eligible', () => {
		const eligible = getEligiblePorts(editor)
		if (!eligible) return false
		return judgeConnection(
			editor,
			eligible.anchor,
			{ shapeId: shape.id, portId },
			{ excludeBlocks: eligible.excludeBlocks, connectionId: eligible.connectionId },
		).ok
	}, [editor, shape.id, portId])

	const classes = [
		'Port',
		'Port_end',
		connected ? 'Port_connected' : '',
		isHinting ? 'Port_hinting' : isEligible ? 'Port_eligible' : '',
	].filter(Boolean).join(' ')

	return (
		<div
			className={classes}
			data-block-port-id={portId}
			data-block-port-side="input"
			data-testid={`branch-control-dot-${portId}`}
			style={{ '--port-color': portColor(control.port.type), left: control.x, top: control.y } as CSSProperties}
		>
			{producers >= 2 ? <PortCountBadge portId={portId} count={producers} /> : null}
		</div>
	)
}

function TargetGlyph({ active }: { active: boolean }) {
	return (
		<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
			<circle cx="8" cy="8" r="5.5" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.4" />
			<circle cx="8" cy="8" r="1.8" fill={active ? 'var(--ss-surface-raised)' : 'currentColor'} />
		</svg>
	)
}

function ArmHeader({ shape, row, isActive, faded, selected, editing }: {
	shape: BranchShape
	row: BranchArmLayout
	isActive: boolean
	faded: boolean
	selected: boolean
	editing: boolean
}) {
	const editor = useEditor()
	const arm = row.arm
	const fold = useCallback(() => void toggleBranchArmOpen(editor, shape.id, arm.id), [editor, shape.id, arm.id])
	const activate = useCallback(() => void toggleBranchActiveArm(editor, shape.id, arm.id), [editor, shape.id, arm.id])
	const label = arm.title.trim() || 'this arm'
	return (
		<div
			className="Branch-armHeader"
			style={{ ...boxStyle(row.header), opacity: faded ? BRANCH_FADE_OPACITY : 1 }}
			data-branch-arm={arm.id}
			data-open={arm.open}
			data-active={isActive}
			data-testid={`branch-arm-${arm.id}`}
		>
			<button
				type="button"
				className="Branch-chevron"
				style={boxStyle({ ...row.chevron, x: row.chevron.x, y: row.chevron.y - row.rowTop })}
				aria-label={`${arm.open ? 'Fold' : 'Open'} ${label}`}
				aria-expanded={arm.open}
				data-testid={`branch-arm-fold-${arm.id}`}
				onPointerDown={(event) => event.stopPropagation()}
				onClick={fold}
			>
				{arm.open ? '⌄' : '›'}
			</button>
			<span
				className="Branch-armTitle"
				style={boxStyle({ ...row.title, y: row.title.y - row.rowTop })}
				data-branch-field={branchInlineFieldAttribute({ kind: 'armTitle', armId: arm.id })}
				data-testid={`branch-arm-title-${arm.id}`}
			>
				{arm.title}
			</span>
			{isActive ? (
				<span className="Branch-activeLabel" style={{ right: row.target.w + 16, top: 9 }}>active</span>
			) : null}
			<button
				type="button"
				className="Branch-target"
				style={boxStyle({ ...row.target, y: row.target.y - row.rowTop })}
				aria-pressed={isActive}
				aria-label={isActive ? `Clear active case (${label})` : `Make ${label} the active case`}
				data-testid={`branch-arm-active-${arm.id}`}
				onPointerDown={(event) => event.stopPropagation()}
				onClick={activate}
			>
				<TargetGlyph active={isActive} />
			</button>
			{selected && !editing ? null : null}
		</div>
	)
}

export function BranchCanvas({ shape }: { shape: BranchShape }) {
	const editor = useEditor()
	const layout = branchLayout(shape.props)
	const connections = useValue('Branch port connections', () => getBlockPortConnections(editor, shape.id), [editor, shape.id])
	const connectedIds = useMemo(() => new Set(connections.map((connection) => connection.ownPortId)), [connections])
	const producerCounts = useMemo(() => countProducers(connections), [connections])
	const isEditing = useValue('editing Branch', () => editor.getEditingShapeId() === shape.id, [editor, shape.id])
	const isSelected = useValue('selected Branch', () => editor.getSelectedShapeIds().includes(shape.id), [editor, shape.id])
	// A Branch inside another Branch's non-active arm fades as a whole.
	const fade = useValue('Branch fade', () => branchFadeOpacity(editor, shape.id), [editor, shape.id])
	const active = shape.props.activeArmId

	const addControl = useCallback(() => {
		const result = addBranchControl(editor, shape.id)
		if (!result.ok) return
		requestBranchInlineEdit(editor, shape.id, { kind: 'controlName', portId: result.port.id })
	}, [editor, shape.id])
	const addArm = useCallback(() => {
		const result = addBranchArm(editor, shape.id)
		if (!result.ok) return
		requestBranchInlineEdit(editor, shape.id, { kind: 'armTitle', armId: result.arm.id })
	}, [editor, shape.id])

	return (
		<HTMLContainer
			className="systemsketch-block-canvas systemsketch-branch-canvas"
			data-branch-view={shape.props.view}
			data-branch-active={active ?? ''}
			style={{ opacity: fade }}
			onPointerDownCapture={(event) => {
				const target = event.target instanceof Element
					? event.target.closest<HTMLElement>('[data-branch-field]')
					: null
				const field = target && event.currentTarget.contains(target)
					? parseBranchInlineFieldAttribute(target.dataset.branchField)
					: null
				if (field) rememberBranchInlineField(editor, shape.id, field)
			}}
		>
			<div className="Branch-layer">
				<div className="Branch-band" style={{ height: layout.band.h }}>
					<span
						className="Branch-title"
						style={boxStyle(layout.title)}
						data-branch-field={branchInlineFieldAttribute({ kind: 'title' })}
						data-testid="branch-title"
					>
						{shape.props.title}
					</span>
					{layout.controls.map((control) => (
						<span
							key={`label:${control.port.id}`}
							className="Branch-controlName"
							style={boxStyle(control.label)}
							data-branch-field={branchInlineFieldAttribute({ kind: 'controlName', portId: control.port.id })}
							data-testid={`branch-control-name-${control.port.id}`}
						>
							{control.port.name}
						</span>
					))}
				</div>

				{layout.arms.map((row) => (
					<div key={row.arm.id}>
						{row.dividerY !== null ? (
							<div className="Branch-divider" style={{ top: row.dividerY }} />
						) : null}
						<ArmHeader
							shape={shape}
							row={row}
							isActive={active === row.arm.id}
							faded={active !== null && active !== row.arm.id}
							selected={isSelected}
							editing={isEditing}
						/>
					</div>
				))}

				{layout.controls.map((control) => (
					<ControlPortDot
						key={`dot:${control.port.id}`}
						shape={shape}
						control={control}
						connected={connectedIds.has(control.port.id)}
						producers={producerCounts.get(control.port.id) ?? 0}
					/>
				))}

				{isSelected && !isEditing ? (
					<>
						<button
							type="button"
							className="Branch-addControl"
							style={{ left: layout.addControl.x, top: layout.addControl.y }}
							title="add control port"
							aria-label={`Add control port to ${shape.props.title.trim() || 'this Branch'}`}
							data-testid="branch-add-control"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={addControl}
						>
							<svg viewBox="0 0 12 12" aria-hidden="true">
								<path d="M6 2.4v7.2M2.4 6h7.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
							</svg>
						</button>
						<button
							type="button"
							className="Branch-addArm"
							style={boxStyle(layout.addArmRow)}
							aria-label={`Add arm to ${shape.props.title.trim() || 'this Branch'}`}
							data-testid="branch-add-arm"
							onPointerDown={(event) => event.stopPropagation()}
							onClick={addArm}
						>
							+ arm
						</button>
					</>
				) : null}

				{isEditing ? <BranchInlineEditor shape={shape} /> : null}
			</div>
		</HTMLContainer>
	)
}

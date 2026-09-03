/**
 * The selection pill for a Branch: `Branch · + port · + arm · E · C · ◎`.
 *
 * Same shell and stylesheet as the Block's mini menu; every button is one of
 * the Branch commands, so the pill and the inspector cannot disagree.
 */
import { type Editor, useValue } from 'tldraw'

import {
	addBranchArm,
	addBranchControl,
	cycleBranchActiveArm,
	getOnlySelectedBranch,
	setBranchView,
} from '../branchCommands'
import { requestBranchInlineEdit } from '../branchInlineEditing'
import '../../blocks/ui/block-inspector.css'
import './branch-inspector.css'

export function EditorBranchSelectionMiniMenu({ editor }: { editor: Editor }) {
	const branch = useValue('SystemSketch selected Branch mini menu', () => getOnlySelectedBranch(editor), [editor])
	if (!branch) return null
	const { view, activeArmId } = branch.props

	return (
		<div className="block-mini-menu branch-mini-menu" role="toolbar" aria-label="Selected Branch actions" data-view={view}>
			<span className="block-mini-menu__subject">Branch</span>
			<div className="block-mini-menu__views" role="group" aria-label="Branch edits">
				<button
					type="button"
					className="branch-mini-menu__add"
					data-testid="branch-pill-add-control"
					onClick={() => {
						const result = addBranchControl(editor, branch.id)
						if (result.ok) requestBranchInlineEdit(editor, branch.id, { kind: 'controlName', portId: result.port.id })
					}}
				>
					+ port
				</button>
				<button
					type="button"
					className="branch-mini-menu__add"
					data-testid="branch-pill-add-arm"
					onClick={() => {
						const result = addBranchArm(editor, branch.id)
						if (result.ok) requestBranchInlineEdit(editor, branch.id, { kind: 'armTitle', armId: result.arm.id })
					}}
				>
					+ arm
				</button>
			</div>
			<div className="block-mini-menu__views" role="group" aria-label="Branch view">
				<button
					type="button"
					aria-pressed={view === 'expanded'}
					data-testid="branch-pill-view-expanded"
					onClick={() => void setBranchView(editor, branch.id, 'expanded')}
				>
					E<span>expanded</span>
				</button>
				<button
					type="button"
					aria-pressed={view === 'case'}
					data-testid="branch-pill-view-case"
					onClick={() => void setBranchView(editor, branch.id, 'case')}
				>
					C<span>case</span>
				</button>
				<button
					type="button"
					aria-pressed={activeArmId !== null}
					aria-label={activeArmId ? 'Clear the active case' : 'Make the first open arm active'}
					data-testid="branch-pill-active"
					onClick={() => void cycleBranchActiveArm(editor, branch.id)}
				>
					◎<span>active</span>
				</button>
			</div>
		</div>
	)
}

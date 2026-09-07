/**
 * The selection pill for a Behavior Tree: the view choices a person flips
 * most — Tree / Process, direction, node face, lens — plus Tidy. Same shell
 * and stylesheet as the Block and Branch pills; every button is a command,
 * so the pill and the inspector cannot disagree.
 */
import { type Editor, useValue } from 'tldraw'

import {
	behaviorTreeSubtreeLeaf,
	getSelectedBehaviorTree,
	setBehaviorTreeView,
	stepIntoBehaviorTreeSubtree,
	stepOutOfBehaviorTreeSubtree,
	tidyBehaviorTree,
} from '../behaviorTreeCommands'
import { getBtRun, startBtRun, stopBtRun, useBtRunVersion } from '../runtime/runStore'
import { BtAutoLayoutControl } from './BtAutoLayoutControl'
import '../../blocks/ui/block-inspector.css'
import './behavior-tree-inspector.css'

export function EditorBehaviorTreeSelectionMiniMenu({ editor }: { editor: Editor }) {
	const selection = useValue('SystemSketch selected Behavior Tree mini menu', () => getSelectedBehaviorTree(editor), [editor])
	useBtRunVersion()
	if (!selection) return null
	const { region } = selection
	const { projection, orientation, nodeFace, dataLens, offsets, treeStack, arrangement } = region.props
	const run = getBtRun(region.id)
	const set = (patch: Parameters<typeof setBehaviorTreeView>[2]) => void setBehaviorTreeView(editor, region.id, patch)
	// Item 3: a selected Sub Tree leaf offers Step in; once inside, the region
	// itself is what's selected (see `stepIntoBehaviorTreeSubtree`), so Step
	// out is offered there instead — the same pill, the opposite direction.
	const subtreeLeaf = selection.child ? behaviorTreeSubtreeLeaf(editor, selection.child) : null
	const stepAction = subtreeLeaf
		? { direction: 'in' as const, onSelect: () => void stepIntoBehaviorTreeSubtree(editor, region.id, subtreeLeaf.node.path) }
		: treeStack.length > 0
			? { direction: 'out' as const, onSelect: () => void stepOutOfBehaviorTreeSubtree(editor, region.id) }
			: null

	return (
		<div className="block-mini-menu bt-mini-menu" role="toolbar" aria-label="Selected Behavior Tree actions" data-projection={projection}>
			<span className="block-mini-menu__subject">Behavior Tree</span>
			<div className="block-mini-menu__views" role="group" aria-label="Projection">
				<button type="button" aria-pressed={projection === 'tree'} data-testid="bt-pill-tree" onClick={() => set({ projection: 'tree' })}>
					Tree
				</button>
				<button type="button" aria-pressed={projection === 'process'} data-testid="bt-pill-process" onClick={() => set({ projection: 'process' })}>
					Process
				</button>
			</div>
			<div className="block-mini-menu__views" role="group" aria-label="Direction">
				<button type="button" aria-pressed={orientation === 'down'} data-testid="bt-pill-down" title="Top to bottom" disabled={dataLens === 'dataflow'} onClick={() => set({ orientation: 'down' })}>
					↓<span>T→B</span>
				</button>
				<button type="button" aria-pressed={orientation === 'right'} data-testid="bt-pill-right" title="Left to right" onClick={() => set({ orientation: 'right' })}>
					→<span>L→R</span>
				</button>
			</div>
			<div className="block-mini-menu__views" role="group" aria-label="Node face">
				<button type="button" aria-pressed={nodeFace === 'simple'} data-testid="bt-pill-simple" disabled={dataLens === 'dataflow'} onClick={() => set({ nodeFace: 'simple' })}>
					S<span>simple</span>
				</button>
				<button type="button" aria-pressed={nodeFace === 'port'} data-testid="bt-pill-ports" onClick={() => set({ nodeFace: 'port' })}>
					P<span>ports</span>
				</button>
			</div>
			<div className="block-mini-menu__views" role="group" aria-label="Data lens">
				<button type="button" aria-pressed={dataLens === 'none'} data-testid="bt-pill-lens-none" onClick={() => set({ dataLens: 'none' })}>
					—<span>no data</span>
				</button>
				<button type="button" aria-pressed={dataLens === 'blackboard'} data-testid="bt-pill-lens-blackboard" onClick={() => set({ dataLens: 'blackboard' })}>
					◎<span>blackboard</span>
				</button>
				<button type="button" aria-pressed={dataLens === 'dataflow'} data-testid="bt-pill-lens-dataflow" onClick={() => set({ dataLens: 'dataflow' })}>
					⇢<span>dataflow</span>
				</button>
			</div>
			<div className="block-mini-menu__views" role="group" aria-label="Arrangement">
				{projection === 'tree' ? (
					<BtAutoLayoutControl
						arrangement={arrangement}
						offsetCount={Object.keys(offsets).length}
						onSetArrangement={(next) => set({ arrangement: next })}
						onArrangeNow={() => void tidyBehaviorTree(editor, region.id)}
					/>
				) : (
					<button type="button" data-testid="bt-pill-tidy" disabled={Object.keys(offsets).length === 0} onClick={() => void tidyBehaviorTree(editor, region.id)}>
						⌗<span>tidy</span>
					</button>
				)}
			</div>
			{/* WHY here: Zach's own placement — "perhaps it's just like a play
			    button on the Behavior Tree contextual menu." The pill is where
			    Tree/Process already lives, costs no at-rest chrome, and every
			    button on it is a command. Entering run mode docks the transport
			    strip on the region (runtime/BtRunOverlay.tsx); the runner-up
			    trigger placements live in docs/bt-run-mode-proposals-2026-09-05.html. */}
			<div className="block-mini-menu__views" role="group" aria-label="Mock run">
				{run ? (
					<button type="button" aria-pressed="true" data-testid="bt-pill-stop" title="Exit run mode" onClick={() => stopBtRun(region.id)}>
						■<span>stop</span>
					</button>
				) : (
					<button type="button" data-testid="bt-pill-run" title="Run this tree against the mock backend" onClick={() => startBtRun(region)}>
						▶<span>run</span>
					</button>
				)}
			</div>
			{stepAction ? (
				<button
					type="button"
					className="block-mini-menu__step-in"
					data-depth-action={stepAction.direction}
					data-testid={stepAction.direction === 'in' ? 'bt-step-into-subtree' : 'bt-step-out-of-subtree'}
					title={stepAction.direction === 'in' ? "Step into this Sub Tree's own definition" : 'Step out to the tree that called this Sub Tree'}
					onClick={stepAction.onSelect}
				>
					{stepAction.direction === 'in' ? 'Step into subtree' : 'Step out'}
				</button>
			) : null}
		</div>
	)
}

/**
 * The selection pill for a Behavior Tree: the view choices a person flips
 * most — Tree / Process, direction, node face, lens — plus Tidy. Same shell
 * and stylesheet as the Block and Branch pills; every button is a command,
 * so the pill and the inspector cannot disagree.
 */
import { type Editor, useValue } from 'tldraw'

import { getSelectedBehaviorTree, setBehaviorTreeView, tidyBehaviorTree } from '../behaviorTreeCommands'
import '../../blocks/ui/block-inspector.css'
import './behavior-tree-inspector.css'

export function EditorBehaviorTreeSelectionMiniMenu({ editor }: { editor: Editor }) {
	const selection = useValue('SystemSketch selected Behavior Tree mini menu', () => getSelectedBehaviorTree(editor), [editor])
	if (!selection) return null
	const { region } = selection
	const { projection, orientation, nodeFace, dataLens, offsets } = region.props
	const set = (patch: Parameters<typeof setBehaviorTreeView>[2]) => void setBehaviorTreeView(editor, region.id, patch)

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
				<button type="button" data-testid="bt-pill-tidy" disabled={Object.keys(offsets).length === 0} onClick={() => void tidyBehaviorTree(editor, region.id)}>
					⌗<span>tidy</span>
				</button>
			</div>
		</div>
	)
}

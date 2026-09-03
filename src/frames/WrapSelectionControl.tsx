import {
	TldrawUiPopover,
	TldrawUiPopoverContent,
	TldrawUiPopoverTrigger,
	useActions,
	useEditor,
	useValue,
	type TLUiEventSource,
} from 'tldraw'

import { CHEVRON_PATH, CHEVRON_VIEWBOX, POPOVER_GAP } from '../appearance/figjamTokens'
import {
	canWrapSelection,
	WRAP_TARGET_DESCRIPTORS,
	wrapSelectionInto,
	type WrapTargetDescriptor,
} from './wrapSelection'
import './wrap-selection.css'

/**
 * Run one wrap, from either surface.
 *
 * `frame` and `group` are dispatched through the stock action so the engine
 * keeps ownership of its own move — history entry, analytics and the
 * frames-are-their-own-inverse toggle all come along. Only the two containers
 * tldraw does not have are ours to perform.
 */
export function useRunWrap(source: TLUiEventSource) {
	const editor = useEditor()
	const actions = useActions()
	return (descriptor: WrapTargetDescriptor) => {
		if (descriptor.stockActionId) {
			actions[descriptor.stockActionId]?.onSelect(source)
			return
		}
		if (descriptor.target === 'block' || descriptor.target === 'branch') {
			wrapSelectionInto(editor, descriptor.target)
		}
	}
}

/**
 * The Wrap tile: a broad face plus a chevron, mounted only while two or more
 * objects are selected — the same rule FigJam uses for its own wrap control,
 * measured in `docs/build_figjam_contextual_menu_spec.py`.
 *
 * Nothing closes the popover explicitly. Every target leaves exactly one shape
 * selected, so `canWrapSelection` goes false and the control unmounts itself.
 */
export function WrapSelectionControl() {
	const editor = useEditor()
	const runWrap = useRunWrap('toolbar')
	const canWrap = useValue(
		'SystemSketch selection can be wrapped',
		() => canWrapSelection(editor),
		[editor],
	)
	if (!canWrap) return null

	return (
		<TldrawUiPopover id="systemsketch-wrap-selection">
			<TldrawUiPopoverTrigger>
				<button
					type="button"
					className="systemsketch-wrap__trigger"
					data-testid="wrap-selection-trigger"
					aria-label="Wrap selection in a container"
					title="Wrap selection in a container"
				>
					<svg className="systemsketch-wrap__glyph" viewBox="0 0 16 16" aria-hidden="true">
						<rect x="2.5" y="3.5" width="11" height="9" rx="1.5" />
						<rect className="systemsketch-wrap__glyph-fill" x="5" y="6" width="6" height="4" rx="0.5" />
					</svg>
					<span className="systemsketch-wrap__label">Wrap</span>
					<svg className="systemsketch-wrap__chevron" viewBox={CHEVRON_VIEWBOX} aria-hidden="true">
						<path d={CHEVRON_PATH} />
					</svg>
				</button>
			</TldrawUiPopoverTrigger>
			<TldrawUiPopoverContent side="top" align="center" sideOffset={POPOVER_GAP}>
				<div className="systemsketch-wrap__panel" role="menu" aria-label="Wrap selection into">
					{WRAP_TARGET_DESCRIPTORS.map((descriptor) => (
						<button
							key={descriptor.target}
							type="button"
							role="menuitem"
							className="systemsketch-wrap__option"
							data-testid={`wrap-into-${descriptor.target}`}
							onClick={() => runWrap(descriptor)}
						>
							<span className="systemsketch-wrap__option-label">{descriptor.label}</span>
							<span className="systemsketch-wrap__option-hint">{descriptor.hint}</span>
						</button>
					))}
				</div>
			</TldrawUiPopoverContent>
		</TldrawUiPopover>
	)
}

import type { Editor, TLUiActionsContextType } from 'tldraw'

import {
	COMMUNICATION_DRAW_FAMILIES,
	type CommunicationDrawFamily,
} from './communicationAuthoring'
import { toggleCommunicationLinkDraw } from './CommunicationLinkTool'
import { communicationProjection, isCommunicationPrototypeEnabled } from './communicationProjection'

/**
 * The digit each DRAW button answers to, in the order the bar paints them.
 *
 * WHY 1 2 3 and not initials: S is already the Simple card face and A is
 * already the Arrow group, so the three protocols cannot have their own
 * letters here. Reading order is the only mapping that needs no legend — the
 * key is the button's position, which is why the bar has to show the digit.
 */
export const COMMUNICATION_DRAW_SHORTCUTS: Readonly<Record<CommunicationDrawFamily, string>> = {
	stream: '1',
	service: '2',
	action: '3',
}

/** The same three digits as a set, for the precedence listener below. */
export const COMMUNICATION_DRAW_DIGITS: ReadonlySet<string> = new Set(
	Object.values(COMMUNICATION_DRAW_SHORTCUTS),
)

export function communicationDrawActionId(family: CommunicationDrawFamily): string {
	return `communication-draw-${family}`
}

/**
 * True exactly when the DRAW group is on screen.
 *
 * WHY gated on the same two facts the bar renders on: 1, 2 and 3 are free keys
 * everywhere else in the app, and they must stay free. A digit means a protocol
 * only while the group that names it is visible — otherwise a stray keystroke
 * arms a cross-hair on an ordinary board with nothing on screen to explain it.
 */
export function isCommunicationDrawArmable(editor: Editor): boolean {
	return isCommunicationPrototypeEnabled(editor)
		&& communicationProjection.get(editor).lens === 'communication'
}

/**
 * Register the three protocols as tldraw actions carrying kbd 1/2/3.
 *
 * WHY the actions seam rather than a keydown listener on the bar: tldraw
 * already owns shortcut dispatch, including the parts that are easy to get
 * wrong — not firing while a text field or a shape label has focus, and not
 * firing on a repeat. Bolting a second listener beside it is how the engine and
 * the app end up disagreeing about who handled a key.
 */
export function withCommunicationDrawActions(
	editor: Editor,
	actions: TLUiActionsContextType,
): TLUiActionsContextType {
	const next = { ...actions }
	for (const family of COMMUNICATION_DRAW_FAMILIES) {
		const id = communicationDrawActionId(family)
		next[id] = {
			id,
			label: `Draw ${family}`,
			kbd: COMMUNICATION_DRAW_SHORTCUTS[family],
			onSelect() {
				if (!isCommunicationDrawArmable(editor)) return
				toggleCommunicationLinkDraw(editor, family)
			},
		}
	}
	return next
}

/**
 * Whether this keystroke belongs to the DRAW group rather than to the toolbar.
 *
 * WHY this exists: 1-9 are NOT free keys. Stock tldraw's toolbar claims them
 * for "activate the nth tool" — `DefaultToolbar`, gated on
 * `enableToolbarKeyboardShortcuts` — on a listener attached to the container
 * DOCUMENT, which runs after the shortcut layer's listener on BODY. Left alone,
 * pressing 2 arms Service and then instantly selects the Cursor tool, which
 * reads as the key doing nothing at all.
 *
 * The caller stops propagation from `body`, so tldraw's own shortcut layer —
 * same node, same phase — still fires and still owns the behaviour; only the
 * toolbar's later document handler is denied. And only while the DRAW group is
 * on screen, so 1-9 keep their stock toolbar meaning everywhere else.
 */
export function shouldClaimCommunicationDigit(editor: Editor, event: KeyboardEvent): boolean {
	if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false
	if (!COMMUNICATION_DRAW_DIGITS.has(event.key)) return false
	return isCommunicationDrawArmable(editor)
}

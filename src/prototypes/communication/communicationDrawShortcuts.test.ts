import { describe, expect, it } from 'vitest'
import type { Editor, TLShape, TLShapeId, TLUiActionsContextType, TLUiOverrideHelpers } from 'tldraw'

import { asyncRegionMeta } from '../../asyncRegion/asyncRegionModel'
import { SYSTEMSKETCH_TOOLBAR_OVERRIDES } from '../../toolbar/toolbarIntegration'
import { COMMUNICATION_DRAW_FAMILIES } from './communicationAuthoring'
import { COMMUNICATION_LINK_TOOL_ID } from './CommunicationLinkTool'
import {
	COMMUNICATION_DRAW_SHORTCUTS,
	communicationDrawActionId,
	shouldClaimCommunicationDigit,
} from './communicationDrawShortcuts'
import {
	applyActiveCommunicationRegion,
	applyCommunicationLens,
	communicationProjection,
} from './communicationProjection'

const REGION_ID = 'shape:async-region' as TLShapeId

/**
 * A fake editor is enough here: every piece of projection state lives in an
 * `EditorAtom`, which keys off object identity, so a plain object carries its
 * own lens the same way a mounted editor does.
 */
function fakeEditor() {
	const region = {
		id: REGION_ID,
		type: 'frame',
		meta: asyncRegionMeta(),
	} as unknown as TLShape
	let currentToolId = 'select'
	const editor = {
		getShape: (id: TLShapeId) => (id === REGION_ID ? region : undefined),
		getCurrentToolId: () => currentToolId,
		setCurrentTool: (id: string) => { currentToolId = id },
	} as unknown as Editor
	return { editor, tool: () => currentToolId }
}

/** An editor whose DRAW group is on screen: a live region in the communication lens. */
function armableEditor() {
	const harness = fakeEditor()
	applyActiveCommunicationRegion(harness.editor, REGION_ID)
	applyCommunicationLens(harness.editor, 'communication')
	return harness
}

function drawActions(editor: Editor): TLUiActionsContextType {
	return SYSTEMSKETCH_TOOLBAR_OVERRIDES.actions?.(
		editor,
		{} as TLUiActionsContextType,
		{ msg: (key: string) => key } as unknown as TLUiOverrideHelpers,
	) as TLUiActionsContextType
}

function press(editor: Editor, family: (typeof COMMUNICATION_DRAW_FAMILIES)[number]) {
	drawActions(editor)[communicationDrawActionId(family)].onSelect('kbd')
}

describe('the DRAW group answers to 1, 2 and 3', () => {
	it('numbers the families in the order the bar paints them', () => {
		expect(COMMUNICATION_DRAW_FAMILIES.map((family) => COMMUNICATION_DRAW_SHORTCUTS[family]))
			.toEqual(['1', '2', '3'])
	})

	it('registers each digit as a real tldraw shortcut through the app overrides', () => {
		const { editor } = armableEditor()
		const actions = drawActions(editor)
		for (const family of COMMUNICATION_DRAW_FAMILIES) {
			expect(actions[communicationDrawActionId(family)]?.kbd)
				.toBe(COMMUNICATION_DRAW_SHORTCUTS[family])
		}
	})

	it('arms the family whose digit was pressed', () => {
		for (const family of COMMUNICATION_DRAW_FAMILIES) {
			const { editor, tool } = armableEditor()
			press(editor, family)
			expect(tool()).toBe(COMMUNICATION_LINK_TOOL_ID)
			expect(communicationProjection.get(editor).drawFamily).toBe(family)
		}
	})

	it('disarms when the armed family is pressed again', () => {
		const { editor, tool } = armableEditor()
		press(editor, 'service')
		expect(tool()).toBe(COMMUNICATION_LINK_TOOL_ID)
		press(editor, 'service')
		expect(tool()).toBe('select')
	})

	it('swaps family when a different digit is pressed while armed', () => {
		const { editor, tool } = armableEditor()
		press(editor, 'service')
		press(editor, 'action')
		expect(tool()).toBe(COMMUNICATION_LINK_TOOL_ID)
		expect(communicationProjection.get(editor).drawFamily).toBe('action')
	})
})

/**
 * The gate that keeps three ordinary keys ordinary.
 *
 * The DRAW group is the only thing on screen that says what 1, 2 and 3 mean, so
 * outside it they must do nothing at all — not arm a cross-hair, not steal the
 * keystroke from whatever the board does with digits later.
 */
describe('a digit means nothing while the DRAW group is off screen', () => {
	it('does nothing with no active region and no prototype query', () => {
		const { editor, tool } = fakeEditor()
		for (const family of COMMUNICATION_DRAW_FAMILIES) press(editor, family)
		expect(tool()).toBe('select')
	})

	it('does nothing in the Dataflow lens, where the group is not rendered', () => {
		const { editor, tool } = fakeEditor()
		applyActiveCommunicationRegion(editor, REGION_ID)
		applyCommunicationLens(editor, 'dataflow')
		for (const family of COMMUNICATION_DRAW_FAMILIES) press(editor, family)
		expect(tool()).toBe('select')
	})

	it('stops answering the moment the lens leaves communication', () => {
		const { editor, tool } = armableEditor()
		press(editor, 'stream')
		expect(tool()).toBe(COMMUNICATION_LINK_TOOL_ID)
		applyCommunicationLens(editor, 'dataflow')
		press(editor, 'action')
		expect(communicationProjection.get(editor).drawFamily).toBe('stream')
	})
})

/**
 * The precedence rule, and why it is not merely defensive.
 *
 * Stock tldraw's toolbar owns 1-9 ("activate the nth tool") from a listener on
 * the container DOCUMENT, which runs after the shortcut layer's listener on
 * BODY. Measured on 2026-09-06: pressing 2 armed Service and was then undone in
 * the same keystroke by a synthetic click on the Cursor button. These digits
 * are borrowed for one mode, so the claim has to be exactly as narrow as the
 * DRAW group that explains them.
 */
describe('the DRAW group borrows the digits, it does not take them', () => {
	const event = (key: string, modifiers: Partial<KeyboardEvent> = {}) =>
		({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...modifiers }) as KeyboardEvent

	it('claims 1, 2 and 3 while the group is on screen', () => {
		const { editor } = armableEditor()
		for (const digit of ['1', '2', '3']) {
			expect(shouldClaimCommunicationDigit(editor, event(digit))).toBe(true)
		}
	})

	it('leaves every other digit to the toolbar', () => {
		const { editor } = armableEditor()
		for (const digit of ['0', '4', '5', '9']) {
			expect(shouldClaimCommunicationDigit(editor, event(digit))).toBe(false)
		}
	})

	it('leaves a modified digit alone — those are the toolbar and zoom shortcuts', () => {
		const { editor } = armableEditor()
		for (const modifier of ['ctrlKey', 'metaKey', 'altKey', 'shiftKey'] as const) {
			expect(shouldClaimCommunicationDigit(editor, event('1', { [modifier]: true })))
				.toBe(false)
		}
	})

	it('claims nothing at all with the group off screen', () => {
		const { editor } = fakeEditor()
		expect(shouldClaimCommunicationDigit(editor, event('1'))).toBe(false)
		applyActiveCommunicationRegion(editor, REGION_ID)
		applyCommunicationLens(editor, 'dataflow')
		expect(shouldClaimCommunicationDigit(editor, event('2'))).toBe(false)
	})
})

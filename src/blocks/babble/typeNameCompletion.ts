/**
 * The type-name autocomplete, as a real CodeMirror completion source.
 *
 * This is the port of `TypeNameAutocomplete.tsx` (now deleted): the pure
 * brains — `buildRegistry`, `buildQueryResults`, `buildBrowseList`, and the
 * per-grammar `findSlot` — were already `(text, position) -> result`
 * functions with no DOM in them, so they drop straight into a
 * `CompletionSource`. What the old component hand-rolled around them is now
 * CodeMirror's own machinery:
 *
 *  - the mirror-div caret-pixel hack -> the tooltip system's real
 *    `coordsAtPos` anchoring (the whole class of caret-position drift bugs
 *    goes away with it);
 *  - the capture-phase ArrowUp/Down/Tab/Enter listener -> `completionKeymap`
 *    plus one high-precedence Tab binding;
 *  - `applyAcceptance` -> the result's `from`/`to` span, which CodeMirror
 *    replaces with the accepted label (same semantics: replace slot start to
 *    caret, leave a trailing ` = 10` untouched).
 *
 * Two UI decisions Zach made survive the port verbatim: the kind pill with
 * its icon (rendered into each option), and the "show every type on this
 * board" browse escalation — an explicit escape hatch, not a widened filter —
 * which lives as a non-inserting option row at the foot of the list.
 */
import {
	autocompletion,
	startCompletion,
	type Completion,
	type CompletionContext,
	type CompletionResult,
} from '@codemirror/autocomplete'
import { StateEffect, StateField, type Extension } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { Editor } from 'tldraw'

import {
	KIND_LABEL,
	buildBrowseList,
	buildQueryResults,
	buildRegistry,
	type AutocompleteEntry,
	type AutocompleteKind,
	type TypeSlot,
} from './typeNameAutocompleteLogic'
import './type-name-autocomplete.css'

/** A small shape per kind, VS Code's own habit, folded INTO the pill rather
 * than replacing it (a bare icon alone was the thing Zach said "tells you
 * nothing" about the mockup this shipped from). */
const KIND_ICON: Record<AutocompleteKind, string> = {
	'board-type': '◆',
	'mapped-type': '≈',
	primitive: '●',
}

export interface TypeNameCompletionOptions {
	editor: Editor
	excludeBlockId?: string
	/** Which grammar's "am I in a type-name slot" rule applies. */
	findSlot(value: string, caret: number): TypeSlot | null
}

interface BroadenState {
	broadened: boolean
	slotStart: number | null
}

function kindPill(kind: AutocompleteKind): HTMLElement {
	const pill = document.createElement('span')
	pill.className = `TypeNameAutocomplete-pill TypeNameAutocomplete-pill--${kind}`
	const icon = document.createElement('span')
	icon.className = 'TypeNameAutocomplete-pillIcon'
	icon.setAttribute('aria-hidden', 'true')
	icon.textContent = KIND_ICON[kind]
	pill.appendChild(icon)
	pill.appendChild(document.createTextNode(KIND_LABEL[kind]))
	return pill
}

export function typeNameCompletion(options: TypeNameCompletionOptions): Extension {
	const { editor, excludeBlockId, findSlot } = options

	const setBroadened = StateEffect.define<boolean>()

	/**
	 * WHY a per-editor field: "browse everything" is a mode of ONE slot's
	 * conversation. Moving to a different slot (a new line, another field)
	 * silently narrows back to relevance — the exact `slotStartRef` behaviour
	 * the React dropdown had.
	 */
	const broadenField = StateField.define<BroadenState>({
		create: () => ({ broadened: false, slotStart: null }),
		update(value, tr) {
			let next = value
			for (const effect of tr.effects) {
				if (effect.is(setBroadened)) next = { ...next, broadened: effect.value }
			}
			if (tr.docChanged || tr.selection) {
				const slot = findSlot(tr.state.doc.toString(), tr.state.selection.main.head)
				const slotStart = slot?.start ?? null
				if (slotStart !== next.slotStart) next = { broadened: false, slotStart }
			}
			return next
		},
	})

	const toggleOption = (label: string, next: boolean): Completion => ({
		label,
		type: 'broaden',
		// Never inserts: flips the browse mode and immediately re-queries, so
		// the same tooltip re-renders with the other list.
		apply: (view: EditorView) => {
			view.dispatch({ effects: setBroadened.of(next) })
			startCompletion(view)
		},
	})

	const source = (context: CompletionContext): CompletionResult | null => {
		const slot = findSlot(context.state.doc.toString(), context.pos)
		if (!slot) return null
		const { broadened } = context.state.field(broadenField)
		const registry = buildRegistry(editor, excludeBlockId)
		const query = slot.query
		const entries: AutocompleteEntry[] = broadened
			? buildBrowseList(registry)
			: query
				? buildQueryResults(registry, query)
				: []

		const completions: Completion[] = entries.map((entry) => ({
			label: entry.name,
			detail: entry.detail,
			type: entry.kind,
		}))
		completions.push(broadened
			? toggleOption('↑ narrow to likely matches', false)
			: toggleOption('↓ show every type on this board', true))

		const queryLower = query.trim().toLowerCase()
		return {
			from: slot.start,
			to: context.pos,
			options: completions,
			// The ranking is `buildQueryResults`' own (name-startsWith first);
			// re-filtering it through CodeMirror's fuzzy matcher would impose a
			// second, disagreeing opinion.
			filter: false,
			getMatch: (completion) => {
				if (!queryLower || completion.type === 'broaden') return []
				const index = completion.label.toLowerCase().indexOf(queryLower)
				return index === -1 ? [] : [index, index + queryLower.length]
			},
		}
	}

	return [
		broadenField,
		autocompletion({
			override: [source],
			icons: false,
			tooltipClass: () => 'TypeNameAutocomplete-cm',
			optionClass: (completion) => (completion.type === 'broaden' ? 'TypeNameAutocomplete-toggleRow' : ''),
			addToOptions: [{
				position: 20,
				render: (completion) => {
					if (completion.type === 'broaden' || !completion.type) return null
					return kindPill(completion.type as AutocompleteKind)
				},
			}],
		}),
	]
}

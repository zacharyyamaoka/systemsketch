/**
 * One icon for a Behavior Tree node, wherever it is drawn.
 *
 * WHY this exists rather than each surface picking its own glyph: the card on
 * the canvas, the Add-process menu and the Behaviors panel all have to show
 * the SAME mark for the same node, and three hand-written switch statements
 * agree only by coincidence. Both branches here call the functions the
 * projection itself calls — `btLeafIcon` for leaves (through the Block icon
 * registry, so a projected Block and its library row are the same glyph by
 * construction) and `btGlyphFor` for controls and decorators.
 */
import { BlockIconGlyph } from '../blocks/ui/blockIcons'
import { btGlyphFor, btLeafIcon, type BtOrientation } from './behaviorTreeModel'
import { BtGlyphSvg } from './btGlyphs'
import type { BtControlKind, BtNodeKind } from './btcppXml'

/**
 * The least a caller must know to draw the icon. A parsed `BtNode`, a
 * `BtNodeModel` and a library row all satisfy it, so no surface has to build
 * a fake node to ask for a glyph.
 */
export interface BtIconSubject {
	/** Registration ID — `Sequence`, `RetryUntilSuccessful`, `MoveTo`. */
	id: string
	kind: BtNodeKind
	controlKind?: BtControlKind | null
}

/** True when the subject wears a stroked control glyph rather than a Block icon. */
export function btSubjectIsControl(subject: BtIconSubject): boolean {
	return subject.kind === 'control'
		|| subject.kind === 'decorator'
		|| (subject.kind === 'unknown' && Boolean(subject.controlKind))
}

/** The Block-icon registry name a leaf subject wears; '' for a control. */
export function btSubjectIconName(subject: BtIconSubject): string {
	return btSubjectIsControl(subject) ? '' : btLeafIcon(subject)
}

export function BtNodeIcon({ subject, orientation = 'down', size = 18 }: {
	subject: BtIconSubject
	orientation?: BtOrientation
	size?: number
}) {
	if (btSubjectIsControl(subject)) {
		return (
			<BtGlyphSvg
				glyph={btGlyphFor({ id: subject.id, kind: subject.kind, controlKind: subject.controlKind ?? null })}
				orientation={orientation}
				size={size}
			/>
		)
	}
	return <BlockIconGlyph name={btLeafIcon(subject)} size={size} />
}

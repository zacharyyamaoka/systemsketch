/**
 * Which lens the right dock shows, and whether that lens brings its own header.
 *
 * The dock is one frame around four different panels, and it used to hide the
 * frame's header for every one of them — a rule written when the only panel was
 * the Block inspector, which draws its own tab strip and close button. The
 * result: a selected cable, an ordinary shape and an empty selection each got a
 * headerless slab with no title and, worse, no way to close it with a pointer.
 *
 * So the subject is resolved once, here, and it carries the answer to both
 * questions. `ownsHeader` is what the stylesheet keys on, so the frame's header
 * appears exactly when the body does not supply one.
 */
import type { Editor } from 'tldraw'

export type InspectorSubject = 'block' | 'branch' | 'connection' | 'shape' | 'empty'

/**
 * The panels that render their own close button — `BlockInspectorContent`'s tab
 * strip, `BlockBatchInspectorContent`'s batch header, and the Branch
 * inspector's header. `ConnectionInspector` and `ShapeFactsPanel` do not, and
 * neither does the empty state, so those three keep the dock's own header.
 */
const SUBJECTS_WITH_OWN_HEADER: ReadonlySet<InspectorSubject> = new Set(['block', 'branch'])

export function inspectorSubjectOwnsHeader(subject: InspectorSubject): boolean {
  return SUBJECTS_WITH_OWN_HEADER.has(subject)
}

export function inspectorSubjectTitle(subject: InspectorSubject): string {
  switch (subject) {
    case 'connection': return 'Connection'
    case 'shape': return 'Selection'
    case 'empty': return 'Inspector'
    default: return 'Inspector'
  }
}

export interface InspectorSubjectInputs {
  /** A Branch is the only thing selected. */
  hasBranch: boolean
  /** The Block lens has something to say: a Block, a batch, or the armed tool. */
  hasBlockContext: boolean
  /** At least one cable is selected. */
  hasConnection: boolean
  /** Anything at all is selected. */
  hasSelection: boolean
}

/**
 * The precedence, unchanged from the version that lived inline in the chrome:
 * a Branch is its own subject, then a cable, then the Block lens — which wins
 * whenever it could apply, because a Block carries far more to edit. What is
 * new is the tail: a selection none of them claim is an ordinary shape, and
 * only a genuinely empty selection is `empty`.
 */
export function resolveInspectorSubject(inputs: InspectorSubjectInputs): InspectorSubject {
  if (inputs.hasBranch) return 'branch'
  if (!inputs.hasBlockContext && inputs.hasConnection) return 'connection'
  if (inputs.hasBlockContext) return 'block'
  return inputs.hasSelection ? 'shape' : 'empty'
}

export interface InspectorSubjectReader {
  getOnlySelectedBranch(editor: Editor): unknown
  getBlockInspectorContextKind(editor: Editor): string
  getConnectionInspectorContext(editor: Editor): unknown
}

/** The same decision read off a live editor. */
export function readInspectorSubject(
  editor: Editor,
  reader: InspectorSubjectReader,
): InspectorSubject {
  return resolveInspectorSubject({
    hasBranch: Boolean(reader.getOnlySelectedBranch(editor)),
    hasBlockContext: reader.getBlockInspectorContextKind(editor) !== 'empty',
    hasConnection: reader.getConnectionInspectorContext(editor) !== null,
    hasSelection: editor.getSelectedShapeIds().length > 0,
  })
}

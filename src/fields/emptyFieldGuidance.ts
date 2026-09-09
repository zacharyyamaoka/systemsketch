/**
 * The short, generic role shown only while an editable field is empty.
 *
 * These are deliberately not sample values. A person should be able to tell
 * what belongs in each field without wondering whether the faint text is data
 * they are meant to keep or replace. Persistent visible labels remain the
 * primary name of every field; this is a local reminder for dense inspectors
 * and on-canvas editors.
 */
export const EMPTY_FIELD_GUIDANCE = {
  block: {
    title: 'Title',
    type: 'Type',
    displayDescription: 'Display description',
    notes: 'Notes',
    /**
     * A port is one line of code, so its empty state shows the grammar rather
     * than three role words: the colon and the equals sign are the whole
     * lesson, and they are not sample data anyone would keep.
     */
    portSignature: 'name: Type = default',
  },
  pill: {
    name: 'Name',
    value: 'Value',
    type: 'Type',
  },
  branch: {
    title: 'Title',
    controlName: 'Name',
    controlType: 'Type',
    armTitle: 'Case title',
  },
  loop: {
    title: 'Title',
    portType: 'Type',
    turn: 'Iteration status',
  },
  connection: {
    layerName: 'Layer name',
    initialValue: 'Initial value',
  },
  comment: {
    sourceReference: 'Source reference',
  },
} as const

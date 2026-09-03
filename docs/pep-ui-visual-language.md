# PEP — UI and visual language

Status: adopted 2026-09-03
Scope: SystemSketch application chrome, inspectors, on-canvas editors, and authored input defaults

## Clear empty fields

An empty editable field must say what kind of information belongs there without
pretending that a particular example is already meaningful content. The visible
label is the durable field name; the empty-state text is a short, generic
in-context reminder for dense panels and direct-on-canvas editing.

Use concise roles such as `Title`, `Name`, `Value`, `Type`, `Default`, `Case title`,
`Iteration status`, or `Source reference`. Do not use illustrative content such as
`build_report`, `gain`, `2.0`, `float`, `call`, a fake source path, or a made-up
status as a default or placeholder in production UI.

This is a preference for authored-content fields, not a ban on meaningful product
state. Structural defaults that establish a shape's semantics remain explicit (for
example, a Branch's initial `if` and `else` arms). Stable record IDs remain internal
and must not be copied into a blank user-facing name.

## Why

- A permanent label remains visible after entry. It is the accessibility and
  comprehension anchor; an empty-state hint supplements it rather than replacing it.
- In a compact inspector, a second, role-specific cue makes adjacent empty boxes
  legible at a glance.
- Sample-like text is ambiguous: it reads as existing data, a recommended value, or
  required syntax. Generic roles avoid that false implication.

This follows [Apple's text-field guidance](https://developer.apple.com/design/human-interface-guidelines/text-fields),
which recommends a separate label alongside a hint because placeholder text disappears
on entry; [NN/g's placeholder findings](https://www.nngroup.com/articles/form-design-placeholders/),
which reserve in-field text for supplementary guidance; and Figma's
[property-label option](https://help.figma.com/hc/en-us/articles/360039832014-Design-Prototype-and-view-Code-in-the-Properties-Panel),
which makes inspector properties clearer in dense sidebars. The stricter
[USWDS advice](https://designsystem.digital.gov/components/text-input/) also reminds
us not to rely on placeholders as the only label.

## Applied standard

| Surface | Empty-state language |
| --- | --- |
| Block | Title, Type, Display description, Notes |
| Block ports | Name, Type, Default |
| Pill | Name, Value, Type |
| Branch | Title, Name, Type, Case title |
| Loop | Title, Type, Iteration status |
| Connection | Layer name, Initial value |
| Comment source | Source reference |

The shared `EMPTY_FIELD_GUIDANCE` table is the implementation vocabulary for these
surfaces. New fields should add a specific generic role there, reuse it in both
inspector and on-canvas editing where applicable, and cover the empty rendering with
a regression test. Tutorials, fixtures, screenshots, and tests may use realistic
example data, but must make it visibly instructional rather than default product content.

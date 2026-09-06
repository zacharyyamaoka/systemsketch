# SystemSketch project preferences

These are durable design preferences, not a second requirements system. They guide choices when
several technically valid implementations are available.

## One definition, many occurrences

Give a semantic definition one stable identity and one canonical body. Any visual occurrence of
that definition should link to it instead of copying a separately editable version of its meaning.
Creating independent content is an explicit new definition or draft, never an accidental fork.

**Why:** a reader and a future source projection need one place to find what a thing means.
Linked occurrences can still serve different layouts and views without drifting into competing
definitions.

## Dataflow first

Prefer representations that make values, transformations, and dependencies visible. Let a
connection mean that a value reaches a consumer; let a Block or region explain the transformation
or scope that happens along that path. Add visual structure only when it clarifies that flow or a
real Python semantic, not merely to decorate the canvas.

**Why:** dataflow is the organizing model SystemSketch is trying to expose. It gives the diagram a
natural reading direction and keeps the useful question close at hand: *where did this value come
from, and what happens to it next?*

## Let the Python model lead

When SystemSketch represents code, start from Python's own semantic units and syntax: definitions,
bindings, calls, arguments, returned values, attribute/subscript access, and control scope. A
visual abstraction is welcome when it improves comprehension, but it should remain explainable as
a projection of those units rather than becoming a competing programming language.

**Why:** staying close to the code model makes the canvas easier to read beside Python today and
easier to project from—or eventually write back to—without inventing unnecessary translation
rules.

## A class is a grouping of functions, not a wiring diagram

A Block acting as a class is a grouping of its methods — separate function definitions bundled
under one name — not one circuit with every method's ports wired to each other. An expanded class
is a *definition* view: it never shows all of its methods' interfaces composed and cabled together
in one board, because that composed view never occurs in real use. Everywhere else on a board, only
call sites appear — one method invoked at a time — never the class's internal wiring exposed all at
once.

**Why:** the worry that a card-per-method layout would break black-box design assumed the
definition view and a wiring view were the same board. They are not — nothing ever needs a class's
methods wired together in place — so the definition can read as plainly "these are just functions,
grouped," as ordinary and composable as any other Block, without leaking scope past its own
boundary.

## Separate meaning from presentation

Treat identity, source provenance, data dependencies, and scope as semantic facts. Treat position,
size, routing, color, and visual grouping as presentation unless the product explicitly promotes
one to a semantic role.

**Why:** people should be free to arrange a board for understanding without accidentally changing
what the represented program means.

## Typography communicates provenance

Use typeface to say where a visible string comes from, rather than as incidental decoration:

- **Scribbled** (`draw`) is for freeform, whiteboard-first material: a stock Text, Arrow or Geo
  label, a Note, or a Callout whose words begin as a sketch. It says that the board is the first
  home of the thought.
- **Technical** (`mono`) is for source-shaped material that is expected to parse from, project to,
  or otherwise stand in for code: Block and region titles, port names and types, literal values,
  defaults, and code/diff evidence.
- **Simple** (`sans`) is the default for SystemSketch chrome and derived presentation: menus,
  buttons, inspector labels, status/count badges, navigation, generated captions, and SystemSketch
  notation such as `z⁻¹` and `mut`. A technical-looking token is not automatically code; the
  question is whether it is source text or a label the product places on top.

An explicit user typeface choice remains meaningful. These are the defaults for each provenance,
not a claim that every handwritten idea or generated caption has the same semantic weight.

**Why:** SystemSketch deliberately spans a permissive whiteboard and a Python projection. A reader
should be able to see whether words are an early sketch, source-shaped program material, or the
product's own explanatory chrome before having to inspect a panel or infer it from location.

## Freedom of control, freedom from control

Optimize for a fast, pleasant common path rather than maximum exposed control. Start with strong,
opinionated defaults that make a useful Block or diagram immediately; add focused customization and
escape hatches when they unlock a meaningfully different representation, composition, or repair.
Do not make people configure primitives before those primitives become useful, and do not surface a
setting merely because the implementation can support it.

**Freedom of control** means a person can override, rearrange, compose, or step outside a default
when the work genuinely asks for it. **Freedom from control** means the normal case does not demand
that attention in the first place. SystemSketch is not aiming for Figma's complete-control surface:
the whiteboard should feel nice and fast before it feels infinitely configurable.

**Why:** complete control transfers every small design decision to the user. Good defaults preserve
creative freedom while removing setup and micromanagement, which is what makes the canvas fast.

## Whiteboard hackability is an escape hatch

Keep important board meaning editable and literal where a person may intentionally bend it, but do
not confuse hackability with making every layer manual. Reliable derived presentation and presets
are welcome when they make the common path faster and remain understandable. Semantic derivations
that rewrite a person's work should be explicit commands, never a silent side effect of drawing a
cable; a board may intentionally be incomplete, inconsistent, or ahead of the rules.

**Why:** a whiteboard is useful before it is a correct program, and it is also useful because it
lets someone move quickly. A cable can state a relationship without authorizing the editor to
replace adjacent words; a strong visual default can still save work without taking ownership of
the underlying idea.

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

## Whiteboard hackability

Prefer editable, literal board records over automatic derivation. Helpful calculations should be
explicit commands, never a silent side effect of drawing a cable; a board may intentionally be
incomplete, inconsistent, or ahead of the rules.

**Why:** a whiteboard is useful before it is a correct program. A cable can state a relationship
without authorizing the editor to replace adjacent words; an explicit command makes any requested
derivation visible, reversible, and safe to decline.

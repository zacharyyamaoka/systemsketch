"""Pure-function spec: where does a `break` / `continue` icon go?

Companion to `docs/many_to_one_rule.py` and `docs/loop_carried_binding.py` —
same idiom (a real `ast`-driven function, run on real source, its output
literally drives a report's diagrams rather than illustrating a hoped-for
answer). This is the algorithm behind the P2 placement policy picked in
`docs/loop-control-icons-2026-09-03.html`: a break/continue icon belongs on
the header row of its NEAREST ENCLOSING header-bearing region — the loop
itself if it sits directly in the loop's body, or the innermost Branch arm
if it's nested inside one or more `if`/`elif`/`else` chains.

Two rules do all the work:

1. Walking into an `ast.If` changes the "owner" to that arm's region id;
   walking back out restores it. An `if/elif/else` chain is flattened into
   arms first (Branch's own model already treats it that way — this spec
   does not re-derive that, it assumes an arm-flattener exists and shows
   the flattening it needs).
2. Walking INTO a nested `ast.For`/`ast.While` does not happen at all — a
   `break`/`continue` inside a nested loop targets that inner loop, not the
   one this pass is placing icons for. Python enforces this itself (the
   language never lets `break`/`continue` bind to anything but the nearest
   enclosing loop), so the analyzer only has to stop descending; it never
   has to disambiguate.

A THIRD rule exists because the first draft of this spec got it wrong: a
`try`/`except`/`finally` or `with` block is NOT owner-changing — it isn't a
Branch region in this project's grammar, so a `break`/`continue` inside one
belongs to whatever region already contained the `try`, not to a new one.
The walk has to descend into `Try.body` / each handler's `.body` /
`Try.orelse` / `Try.finalbody` / `With.body` WITHOUT swapping the owner,
which is different from `ast.If` (owner-changing) and different from a
skipped no-op (not descending at all — the bug this spec shipped with
before it was actually run against a `try/except` case). Getting this
wrong is silent: nothing crashes, the analyzer just never sees the
`break`/`continue` at all.

Everything else (assignments, expressions, calls) is a genuine no-op: no
recursion, no owner change, not a placement site. Nested `FunctionDef` /
`ClassDef` bodies are also correctly a no-op — not because they're
transparent like `Try`, but because a `break`/`continue` cannot lexically
reach an enclosing loop through a function boundary at all (Python raises
`SyntaxError` for that), so there is nothing to find in there for THIS
loop's placement pass.

Explicitly out of scope, and left as a comment rather than a guess:
`match`/`case` arms would need the exact same treatment as `if`/`elif` if
this project ever lowers `match` to a Branch — flatten cases into arms,
recurse with the same owner-swap rule. A `break` inside a `for...else:` /
`while...else:` clause is not handled: that clause runs OUTSIDE the loop's
iteration, so a `break` there either targets a DIFFERENT, outer enclosing
loop or is a `SyntaxError` — this spec does not walk `orelse` on the loop
node itself, only on `ast.If.orelse`.
"""

from __future__ import annotations

import ast
import json
from dataclasses import dataclass, field


@dataclass
class Placement:
    kind: str   # "break" | "continue"
    line: int


def _flatten_if_chain(node: ast.If) -> list[list[ast.stmt]]:
    """An `if/elif/.../else` chain, flattened into arm bodies in source order.

    Branch's own model treats an `elif` as `orelse == [ast.If(...)]` — the
    same shape Python's parser already produces for a chain. This walks
    that chain into a flat list of arm bodies so each one gets its own
    region id, matching how the Branch region draws them as sibling rows,
    not a nested tree.
    """
    arms = [node.body]
    orelse = node.orelse
    while len(orelse) == 1 and isinstance(orelse[0], ast.If):
        arms.append(orelse[0].body)
        orelse = orelse[0].orelse
    if orelse:
        arms.append(orelse)  # the final `else:`
    return arms


def compute_placements(source: str, loop_region_id: str = "loop") -> dict[str, list[dict]]:
    """The one function this spec exists to define.

    `source` must contain exactly one top-level `for`/`while` loop (nested
    loops are fine and handled per rule 2 above). Returns
    `{region_id: [{"kind": "break"|"continue", "line": N}, ...]}`, one entry
    per region that actually owns at least one icon — a region with none is
    simply absent from the result, not present with an empty list.
    """
    tree = ast.parse(source)
    loop_node = next(n for n in ast.walk(tree) if isinstance(n, (ast.For, ast.While)))
    placements: dict[str, list[dict]] = {}
    branch_counter = [0]

    def walk(stmts: list[ast.stmt], owner: str) -> None:
        for stmt in stmts:
            if isinstance(stmt, ast.Break):
                placements.setdefault(owner, []).append({"kind": "break", "line": stmt.lineno})
            elif isinstance(stmt, ast.Continue):
                placements.setdefault(owner, []).append({"kind": "continue", "line": stmt.lineno})
            elif isinstance(stmt, ast.If):
                branch_index = branch_counter[0]
                branch_counter[0] += 1
                for arm_index, arm_body in enumerate(_flatten_if_chain(stmt)):
                    walk(arm_body, f"{owner}.branch{branch_index}.arm{arm_index}")
            elif isinstance(stmt, (ast.For, ast.While)):
                continue  # rule 2: a nested loop owns its own break/continue
            elif isinstance(stmt, ast.Try):
                # rule 3: transparent — descend, but don't change the owner
                walk(stmt.body, owner)
                for handler in stmt.handlers:
                    walk(handler.body, owner)
                walk(stmt.orelse, owner)
                walk(stmt.finalbody, owner)
            elif isinstance(stmt, (ast.With, ast.AsyncWith)):
                walk(stmt.body, owner)  # rule 3: transparent, same as Try
            # every other statement kind (assignments, expressions, nested
            # FunctionDef/ClassDef): genuine no-op, not owner-changing,
            # nothing to descend into

    walk(loop_node.body, loop_region_id)
    return placements


# --------------------------------------------------------------------------
# Self-test: run the spec on the exact six cases the coverage gallery draws,
# and print what it actually computes — not what the gallery hopes it
# computes. `docs/build_control_icon_placement_cases.py` imports this
# module and uses THESE return values to decide where to draw each icon,
# so a wrong answer here is a wrong diagram there, not a silent mismatch.
#
# One honest finding shaped this set: a bare `if`, even with no `elif`/
# `else`, still creates its own arm and owns whatever's directly inside it
# — so two adjacent simple `if` guards almost always land on two DIFFERENT
# headers, never the loop's own. The one realistic way to get two exits
# sharing a single header turns out to be `try`/`except` (rule 3, transparent):
# different exception handlers, same owner. c1 uses exactly that, rather
# than a contrived "both in the outer body" example that the rules above
# don't actually support.
# --------------------------------------------------------------------------

CASES = {
    "c1_shared_header_via_except": """
while pose.error > tol:
    refine(pose)
    try:
        check(pose)
    except Stale:
        continue
    except Fatal:
        break
""",
    "c2_single_arm_break": """
while pose.error > tol:
    refine(pose)
    if error > big:
        break
    elif drift > tol:
        pass
    else:
        pass
    check(pose)
""",
    "c3_single_arm_continue": """
while pose.error > tol:
    refine(pose)
    if error > big:
        pass
    elif drift > tol:
        continue
    else:
        pass
    check(pose)
""",
    "c4_two_arms_no_bleed": """
while pose.error > tol:
    refine(pose)
    if error > big:
        break
    elif drift > tol:
        continue
    else:
        pass
    check(pose)
""",
    "c5_nested_branch": """
while pose.error > tol:
    refine(pose)
    if drift > tol:
        if stale:
            break
        else:
            pass
    check(pose)
""",
    "c6_nested_loop_excluded": """
while pose.error > tol:
    refine(pose)
    for sample in window:
        if sample.bad:
            break
    check(pose)
""",
}


def main() -> None:
    for name, source in CASES.items():
        result = compute_placements(source)
        print(f"{name}:")
        print(json.dumps(result, indent=2))
        print()


if __name__ == "__main__":
    main()

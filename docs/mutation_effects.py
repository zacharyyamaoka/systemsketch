"""In-place mutation as a dataflow fact: what the source proves, and what a board must draw.

Golden 11 (`poses.append(pose)`) is the first case where a call changes a value
the *caller* still holds.  Zach's instinct was to draw it as a cable that leaves
the block and lands back on the mutated input port.  This module is that
instinct written out and run, so the drawing can be checked rather than argued.

Three facts, each computed from the source:

1.  **The effect.**  A call mutates a name when it is a known in-place method of
    a builtin container (`append`, `update`, `sort`, ...), a subscript store, or
    an attribute store.  Anything else that merely *receives* the name is
    `unproven`: we cannot see inside it, and a board that hooks every unproven
    call says nothing.  Proven, unproven and pure are three states, not two.

2.  **The versions.**  A mutation ends one version of the name and begins the
    next, exactly as SSA does for a rebinding.  Every read therefore has one
    correct producer: the latest writer at or before it.  This is the whole of
    "which wire should this consumer come from", and it needs no new concept —
    `poses.append(pose)` is a writer of `poses` the same way `pose = refine(pose)`
    is a writer of `pose`.

3.  **The write-back.**  A version boundary on a *parameter* is visible outside
    the function: the caller's object is the one that changed.  So the last
    version of a mutated parameter has to reach the boundary input port that
    named it.  That edge is what Zach drew, and it is the one edge the current
    golden 11 target board does not have (`board_report` measures this).

The order hazard falls out of the same table.  A board is a DAG and says nothing
about time, so two consumers of one mutated object are only unambiguous when one
of them is fed by the other.  That is a lint, not a paint: nothing downstream
needs colouring, because a consumer wired from the right version is already right.
"""

from __future__ import annotations

import ast
import json
from dataclasses import dataclass, field
from pathlib import Path

# Methods that mutate their receiver in place, by builtin container.  Kept
# explicit rather than guessed: proving a mutation is the point, and a name we
# do not know lands in `unproven`, which the board is allowed to stay quiet about.
IN_PLACE = {
    "list": {"append", "extend", "insert", "remove", "pop", "clear", "sort", "reverse"},
    "dict": {"update", "pop", "popitem", "clear", "setdefault"},
    "set": {"add", "discard", "remove", "pop", "clear", "update",
            "intersection_update", "difference_update", "symmetric_difference_update"},
    "bytearray": {"append", "extend", "insert", "remove", "pop", "clear", "reverse"},
}
MUTATING_METHODS = {name for names in IN_PLACE.values() for name in names}

# Types whose values are shared with the caller.  A parameter annotated with one
# of these can carry a mutation out of the function; `int`, `str`, `float`,
# `bytes` and `tuple` cannot, whatever is done to the name inside.
MUTABLE_HINTS = ("list", "dict", "set", "bytearray", "List", "Dict", "Set", "MutableSequence",
                 "MutableMapping", "MutableSet", "Iterable", "Sequence", "Mapping")
IMMUTABLE_HINTS = ("int", "float", "str", "bytes", "bool", "tuple", "complex", "frozenset", "None")


@dataclass(frozen=True)
class Effect:
    """One proven in-place write to a name, at one statement."""
    name: str                  # the name whose value changed
    statement: int             # index into the function body
    kind: str                  # "method" | "subscript" | "attribute"
    detail: str                # `poses.append(pose)`
    on_parameter: bool         # whether the caller can see it


@dataclass(frozen=True)
class Version:
    """One version of a name: who wrote it, and at which statement."""
    name: str
    index: int                 # 0 is the parameter / first binding
    statement: int | None      # None for a parameter
    writer: str                # "param" | "poses.append" | "refine"
    by_mutation: bool


@dataclass(frozen=True)
class Read:
    """One read of a name, and the version it must be wired from."""
    name: str
    statement: int
    by: str                    # the call that reads it
    version: int
    producer: str              # the block whose output this cable must leave


@dataclass
class Analysis:
    function: str
    parameters: list = field(default_factory=list)
    effects: list = field(default_factory=list)
    versions: dict = field(default_factory=dict)     # name -> [Version]
    reads: list = field(default_factory=list)
    unproven: list = field(default_factory=list)     # (statement, call, arg) we cannot see inside
    writebacks: list = field(default_factory=list)   # (parameter, producer) edges the boundary needs
    hazards: list = field(default_factory=list)      # unordered consumers of one mutated object

    def as_json(self) -> dict:
        return {
            "function": self.function,
            "parameters": self.parameters,
            "effects": [vars(e) for e in self.effects],
            "versions": {k: [vars(v) for v in vs] for k, vs in self.versions.items()},
            "reads": [vars(r) for r in self.reads],
            "unproven": self.unproven,
            "writebacks": self.writebacks,
            "hazards": self.hazards,
        }


def _call_name(node: ast.AST) -> str:
    if isinstance(node, ast.Call):
        return _call_name(node.func)
    if isinstance(node, ast.Attribute):
        return f"{_call_name(node.value)}.{node.attr}"
    if isinstance(node, ast.Name):
        return node.id
    if isinstance(node, ast.Subscript):
        return f"{_call_name(node.value)}[]"
    return "?"


def _root_name(node: ast.AST) -> str | None:
    """The name a target ultimately hangs off: `a.b[0].c` -> `a`."""
    while isinstance(node, (ast.Attribute, ast.Subscript)):
        node = node.value
    return node.id if isinstance(node, ast.Name) else None


def _annotation(node: ast.AST | None) -> str:
    return ast.unparse(node) if node is not None else ""


def carries_mutation(annotation: str) -> bool | None:
    """Whether a value of this annotated type can carry a change back to the caller.

    True / False when the annotation settles it, None when it does not (a bare
    name like `Poses` or `Client` is an alias we would have to resolve)."""
    if not annotation:
        return None
    head = annotation.split("[")[0].split(".")[-1]
    if head in IMMUTABLE_HINTS:
        return False
    if head in MUTABLE_HINTS:
        return True
    return None


def analyze(source: str, function: str = "run") -> Analysis:
    """Effects, versions, reads and write-backs for one function."""
    tree = ast.parse(source)
    target = next(
        (n for n in ast.walk(tree)
         if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == function),
        None,
    )
    if target is None:
        raise ValueError(f"no function named {function!r}")

    out = Analysis(function=function)
    params = [a.arg for a in target.args.args] + [a.arg for a in target.args.kwonlyargs]
    annotations = {a.arg: _annotation(a.annotation)
                   for a in target.args.args + target.args.kwonlyargs}
    out.parameters = [{"name": p, "type": annotations.get(p, ""),
                       "shared": carries_mutation(annotations.get(p, ""))} for p in params]

    # Version 0 of every parameter is the boundary port itself.
    for p in params:
        out.versions[p] = [Version(p, 0, None, "param", False)]

    def latest(name: str) -> Version | None:
        chain = out.versions.get(name)
        return chain[-1] if chain else None

    for index, statement in enumerate(target.body):
        # --- reads, before any write in the same statement takes effect ---
        for node in ast.walk(statement):
            if not isinstance(node, ast.Call):
                continue
            call = _call_name(node.func)
            receiver = _root_name(node.func.value) if isinstance(node.func, ast.Attribute) else None
            for argument in list(node.args) + [k.value for k in node.keywords]:
                if not isinstance(argument, ast.Name):
                    continue
                current = latest(argument.id)
                if current is None:
                    continue
                out.reads.append(Read(argument.id, index, call, current.index,
                                      "boundary" if current.statement is None else current.writer))
                # An opaque call receiving a name we cannot prove immutable.
                if (call not in MUTATING_METHODS and "." not in call
                        and carries_mutation(annotations.get(argument.id, "")) is not False):
                    out.unproven.append({"statement": index, "call": call, "argument": argument.id})
            if receiver is not None:
                current = latest(receiver)
                if current is not None:
                    out.reads.append(Read(receiver, index, call, current.index,
                                          "boundary" if current.statement is None else current.writer))

        # --- writes ---
        wrote: list[tuple[str, str, str]] = []   # (name, kind, detail)
        for node in ast.walk(statement):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if node.func.attr in MUTATING_METHODS:
                    receiver = _root_name(node.func.value)
                    if receiver is not None:
                        wrote.append((receiver, "method", ast.unparse(node)))
        if isinstance(statement, ast.Assign):
            for tgt in statement.targets:
                if isinstance(tgt, ast.Subscript):
                    root = _root_name(tgt)
                    if root is not None:
                        wrote.append((root, "subscript", ast.unparse(statement)))
                elif isinstance(tgt, ast.Attribute):
                    root = _root_name(tgt)
                    if root is not None:
                        wrote.append((root, "attribute", ast.unparse(statement)))
        if isinstance(statement, ast.Delete):
            for tgt in statement.targets:
                if isinstance(tgt, (ast.Subscript, ast.Attribute)):
                    root = _root_name(tgt)
                    if root is not None:
                        wrote.append((root, "subscript", ast.unparse(statement)))
        if isinstance(statement, ast.AugAssign):
            root = _root_name(statement.target)
            if root is not None and not isinstance(statement.target, ast.Name):
                wrote.append((root, "attribute", ast.unparse(statement)))

        for name, kind, detail in wrote:
            on_parameter = name in params
            out.effects.append(Effect(name, index, kind, detail, on_parameter))
            chain = out.versions.setdefault(name, [Version(name, 0, None, "local", False)])
            chain.append(Version(name, len(chain), index,
                                 detail.split("(")[0] if kind == "method" else f"{name}[]=", True))

        # --- rebinding: a plain assignment starts a new version too ---
        if isinstance(statement, (ast.Assign, ast.AnnAssign)):
            targets = statement.targets if isinstance(statement, ast.Assign) else [statement.target]
            value = statement.value
            writer = _call_name(value.func) if isinstance(value, ast.Call) else "value"
            for tgt in targets:
                names = ([e.id for e in tgt.elts if isinstance(e, ast.Name)]
                         if isinstance(tgt, (ast.Tuple, ast.List)) else
                         [tgt.id] if isinstance(tgt, ast.Name) else [])
                for name in names:
                    chain = out.versions.setdefault(name, [])
                    chain.append(Version(name, len(chain), index, writer, False))

    # --- write-backs: the last version of a mutated parameter must reach its port ---
    for parameter in params:
        chain = out.versions.get(parameter, [])
        if any(v.by_mutation for v in chain):
            out.writebacks.append({"parameter": parameter, "producer": chain[-1].writer,
                                   "statement": chain[-1].statement})

    # --- order hazard: two consumers of one mutated object, neither feeding the other ---
    for effect in out.effects:
        others = [r for r in out.reads
                  if r.name == effect.name and r.statement != effect.statement]
        after = [r for r in others if r.statement > effect.statement]
        before = [r for r in others if r.statement < effect.statement]
        if before and after:
            out.hazards.append({
                "name": effect.name, "mutation": effect.detail,
                "before": sorted({r.by for r in before}), "after": sorted({r.by for r in after}),
                "why": "readers on both sides of the mutation: the board must order them by wiring, "
                       "because position on the canvas does not.",
            })
    return out


# --------------------------------------------------------------------------
# Checking a real board against the analysis
# --------------------------------------------------------------------------

def read_board(path: Path) -> dict:
    """Blocks, ports and cables of a `.systemsketch` file, flattened."""
    document = json.loads(Path(path).read_text(encoding="utf-8"))
    records = document["records"]
    blocks, cables = {}, {}
    for record in records:
        if record.get("type") == "block":
            props = record["props"]
            blocks[record["id"]] = {
                "title": props.get("title", ""),
                "in": {p["id"]: p.get("name", p["id"]) for p in props.get("inputs", [])},
                "out": {p["id"]: p.get("name", p["id"]) for p in props.get("outputs", [])},
            }
    for record in records:
        if record.get("typeName") == "binding" and record.get("type") == "connection":
            props = record.get("props", {})
            edge = cables.setdefault(record["fromId"], {})
            edge[props.get("terminal")] = {
                "block": record["toId"], "port": props.get("portId"), "face": props.get("face"),
            }
    return {"blocks": blocks, "cables": cables}


def board_report(path: Path, analysis: Analysis) -> dict:
    """Does this board draw the write-back, and does every read leave the right producer?"""
    board = read_board(path)
    blocks, cables = board["blocks"], board["cables"]
    boundary = next((bid for bid, b in blocks.items()
                     if any(pid.startswith("boundary-input") for pid in b["in"])), None)
    lands_on = []
    for edge in cables.values():
        end = edge.get("end")
        if end and end["block"] == boundary and str(end["port"]).startswith("boundary-input"):
            lands_on.append(end["port"])
    missing = [w for w in analysis.writebacks
               if f"boundary-input-{w['parameter']}" not in lands_on]
    return {
        "blocks": len(blocks), "cables": len(cables),
        "titles": sorted(b["title"] for b in blocks.values()),
        "writebacks_required": analysis.writebacks,
        "cables_landing_on_a_boundary_input": lands_on,
        "writebacks_missing": missing,
        "draws_the_arc": not missing,
    }



def _chase(blocks: dict, cables: dict, block_id: str, port_id: str) -> tuple[str, list]:
    """Follow a cable back from an input port to the block that really produces it.

    A value node — one input, one output, both carrying the same name — is a
    relay the analyzer inserts for a rebinding, not a producer.  Chasing through
    it is what lets the check compare a board against the source's versions.
    """
    hops = []
    for _ in range(8):
        source = None
        for edge in cables.values():
            end, start = edge.get("end"), edge.get("start")
            if end and start and end["block"] == block_id and end["port"] == port_id:
                source = start
                break
        if source is None:
            return "unwired", hops
        block = blocks.get(source["block"], {})
        title = block.get("title", "?")
        if str(source["port"]).startswith("boundary-input"):
            return "boundary", hops
        names = set(block.get("in", {}).values()) | set(block.get("out", {}).values())
        is_relay = ("(" not in title and len(block.get("in", {})) == 1
                    and len(block.get("out", {})) == 1 and names == {title})
        if is_relay:
            hops.append(title)
            block_id, port_id = source["block"], next(iter(block["in"]))
            continue
        return title.removesuffix("()"), hops
    return "cycle", hops


def read_check(path: Path, analysis: Analysis) -> list[dict]:
    """Every read in the source, against the cable the board actually draws."""
    board = read_board(path)
    blocks, cables = board["blocks"], board["cables"]
    by_title = {}
    for bid, block in blocks.items():
        by_title.setdefault(block["title"].removesuffix("()"), bid)
    rows = []
    for read in analysis.reads:
        consumer = by_title.get(read.by)
        if consumer is None:
            continue
        port = next((pid for pid, name in blocks[consumer]["in"].items()
                     if name == read.name or pid == read.name
                     or name.split("#")[0] == read.name), None)
        if port is None:
            continue
        drawn, hops = _chase(blocks, cables, consumer, port)
        rows.append({
            "read": f"{read.by}({read.name})", "version": read.version,
            "required": read.producer, "drawn": drawn,
            "through": hops, "ok": drawn == read.producer,
        })
    return rows


def survey(root: Path, function: str = "run") -> list[dict]:
    """Every golden that proves an in-place mutation."""
    rows = []
    for case in sorted(root.iterdir()):
        source = case / "source.py"
        if not source.is_dir() and source.exists():
            try:
                analysis = analyze(source.read_text(encoding="utf-8"), function)
            except (ValueError, SyntaxError):
                continue
            if analysis.effects:
                rows.append({
                    "case": case.name,
                    "effects": [f"{e.detail} ({'parameter' if e.on_parameter else 'local'})"
                                for e in analysis.effects],
                    "writebacks": [w["parameter"] for w in analysis.writebacks],
                    "hazards": len(analysis.hazards),
                })
    return rows


if __name__ == "__main__":
    import sys
    goldens = Path(sys.argv[1] if len(sys.argv) > 1
                   else "/home/bam/pyblocks/examples/systemsketch_goldens")
    eleven = goldens / "11_receiver_mutation"
    analysis = analyze((eleven / "source.py").read_text(encoding="utf-8"))
    print(json.dumps(analysis.as_json(), indent=1))
    print("--- reads ---")
    print(json.dumps(read_check(eleven / "target.systemsketch", analysis), indent=1))
    print("--- board ---")
    print(json.dumps(board_report(eleven / "target.systemsketch", analysis), indent=1))
    print("--- survey ---")
    print(json.dumps(survey(goldens), indent=1))


# --------------------------------------------------------------------------
# Propagating outward: a mutation is visible at every level the object is on
# --------------------------------------------------------------------------
#
# Zach's question (2026-09-03): with a nested mutation, how does the mark keep
# going outward?  It is the same write-back rule applied at each level, and it
# terminates on its own.  A function mutates parameter `p` when it writes `p`
# in place, or when it hands `p` to a callee that mutates the parameter in that
# position.  Iterate to a fixpoint over the module's call graph: the sets only
# grow and the parameter list is finite, so it converges.  It stops where the
# object was *created* — a local is not on anybody's interface, so there is no
# port for the arc to land on and nothing to propagate.


def _positional_params(node: ast.AST) -> list:
    return [a.arg for a in node.args.args] + [a.arg for a in node.args.kwonlyargs]


def propagate(source: str) -> dict:
    """For every function in the module, which parameters it mutates — transitively.

    Returns {function: {"params": [...], "mutates": [name], "why": {name: reason},
             "rounds": n}} plus the chain each mutation travelled."""
    tree = ast.parse(source)
    functions = {}
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions[node.name] = node

    mutates: dict[str, set] = {}
    why: dict[str, dict] = {}
    for name, node in functions.items():
        analysis = analyze(source, name)
        direct = {w["parameter"] for w in analysis.writebacks}
        mutates[name] = set(direct)
        why[name] = {p: f"writes it in place ({e.detail})"
                     for p in direct
                     for e in analysis.effects if e.name == p}

    rounds = 0
    changed = True
    while changed:
        changed = False
        rounds += 1
        for name, node in functions.items():
            params = _positional_params(node)
            for call in ast.walk(node):
                if not isinstance(call, ast.Call):
                    continue
                callee = call.func.id if isinstance(call.func, ast.Name) else None
                if callee not in functions:
                    continue
                callee_params = _positional_params(functions[callee])
                for index, argument in enumerate(call.args):
                    if not isinstance(argument, ast.Name) or argument.id not in params:
                        continue
                    if index >= len(callee_params):
                        continue
                    if callee_params[index] in mutates[callee] and argument.id not in mutates[name]:
                        mutates[name].add(argument.id)
                        why[name][argument.id] = (
                            f"hands it to {callee}(), which mutates {callee_params[index]}")
                        changed = True

    return {
        name: {
            "params": _positional_params(node),
            "mutates": sorted(mutates[name]),
            "why": why[name],
        }
        for name, node in functions.items()
    } | {"__rounds__": rounds}


def chain(source: str, function: str, parameter: str) -> list:
    """The levels a mutation of `parameter` is visible at, outermost call first."""
    table = propagate(source)
    tree = ast.parse(source)
    functions = {n.name: n for n in ast.walk(tree)
                 if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
    steps, seen = [], set()
    current, name = parameter, function
    while name in functions and name not in seen:
        seen.add(name)
        entry = table[name]
        if current not in entry["mutates"]:
            break
        steps.append({"function": name, "port": current, "why": entry["why"][current]})
        following = None
        for call in ast.walk(functions[name]):
            if isinstance(call, ast.Call) and isinstance(call.func, ast.Name):
                callee = call.func.id
                if callee in functions:
                    callee_params = _positional_params(functions[callee])
                    for index, argument in enumerate(call.args):
                        if (isinstance(argument, ast.Name) and argument.id == current
                                and index < len(callee_params)
                                and callee_params[index] in table[callee]["mutates"]):
                            following = (callee, callee_params[index])
        if following is None:
            break
        name, current = following
    return steps


# --------------------------------------------------------------------------
# The channel: `list.append(self, object, /) -> None`
# --------------------------------------------------------------------------
#
# Zach's correction (2026-09-03).  `append` returns None, so there is no output
# port for the new list to leave by.  The mutation is not a second, redundant
# drawing of a data edge — it is the *only* channel, and an edge that leaves it
# is load-bearing: erase it and the consumers downstream have no input at all.
#
# Measured, not remembered: of the in-place methods this module knows, most
# return None, and five return a value *as well as* mutating.  `list.pop()`
# hands back the item it removed and shortens the list, so one call feeds two
# different edges.  That is why an effect edge cannot just be an output port
# under another name — a block can need both at once.

RETURNS_A_VALUE = {
    "pop",          # list.pop / dict.pop / set.pop — the element removed
    "popitem",      # dict.popitem — the (key, value) pair
    "setdefault",   # dict.setdefault — the value now stored
}


def channels(method: str) -> str:
    """What a call to this in-place method offers a board to wire from."""
    if method not in MUTATING_METHODS:
        return "return only"
    return "effect and return" if method in RETURNS_A_VALUE else "effect only"


def method_channel_table() -> list[dict]:
    """Every in-place method this module knows, and the channels it offers."""
    rows = []
    for container, names in sorted(IN_PLACE.items()):
        for name in sorted(names):
            rows.append({
                "method": f"{container}.{name}",
                "returns": "the element" if name in RETURNS_A_VALUE else "None",
                "channel": channels(name),
            })
    return rows


def effect_edges(analysis: Analysis) -> list[dict]:
    """The edges that only exist because of a mutation, and what each one carries.

    For every proven effect, each later read of that name is fed by the call that
    wrote it — through the *effect*, not through a return value, unless the method
    happens to hand one back as well.  These edges are structural: with
    `-> None` there is no other way for the value to reach the consumer."""
    edges = []
    for effect in analysis.effects:
        method = effect.detail.split("(")[0].split(".")[-1] if effect.kind == "method" else None
        for read in analysis.reads:
            if read.name != effect.name or read.statement <= effect.statement:
                continue
            if read.producer != effect.detail.split("(")[0]:
                continue
            edges.append({
                "from": effect.detail.split("(")[0],
                "to": f"{read.by}({read.name})",
                "carries": effect.name,
                "channel": channels(method) if method else "effect only",
                "load_bearing": True,
            })
    # the write-back to the boundary is an effect edge too
    for writeback in analysis.writebacks:
        edges.append({
            "from": writeback["producer"],
            "to": f"boundary-input-{writeback['parameter']}",
            "carries": writeback["parameter"],
            "channel": "effect only",
            "load_bearing": True,
        })
    return edges


def fictional_outputs(path: Path, analysis: Analysis) -> list[dict]:
    """Output ports a board draws on a mutating call that the call does not have."""
    board = read_board(path)
    rows = []
    for effect in analysis.effects:
        if effect.kind != "method":
            continue
        title = effect.detail.split("(")[0] + "()"
        method = effect.detail.split("(")[0].split(".")[-1]
        for block in board["blocks"].values():
            if block["title"] != title:
                continue
            for port_id, port_name in block["out"].items():
                rows.append({
                    "block": title, "port": f"{port_id} ({port_name})",
                    "real": method in RETURNS_A_VALUE,
                    "note": ("the element pop() hands back" if method in RETURNS_A_VALUE
                             else f"{title[:-2]} returns None — this port is the analyzer's, not Python's"),
                })
    return rows


# --------------------------------------------------------------------------
# Where an effect leaves the block
# --------------------------------------------------------------------------
#
# Zach's rule (2026-09-03), once the effect port turned out to be a real port
# you can wire by hand: the whiteboard may route a cable anywhere, but the
# linter should prefer an effect that leaves the *top* edge and travels right,
# because left-to-right is what lets an eye follow a board.  The left edge is
# values in, the right edge is named values out, the bottom is the loop lane —
# the top is the only edge not already spoken for.

EXIT_EDGES = ("top", "right", "bottom", "side", "none")
PREFERRED_EXIT = "top"


def exit_lint(edges: list[str]) -> dict:
    """How many effect cables leave by the preferred edge, and which do not."""
    offenders = [e for e in edges if e != PREFERRED_EXIT]
    return {
        "total": len(edges),
        "preferred": len(edges) - len(offenders),
        "offenders": sorted(set(offenders)),
        "clean": not offenders,
        "rule": "an effect edge leaves the block's top edge, then travels right",
    }

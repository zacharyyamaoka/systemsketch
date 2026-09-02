#!/usr/bin/env python3
"""Per-arm binding tables for an `if` region, from stdlib `ast` alone.

This is the happy-path lowering the branch-region design rests on, small
enough to read in one sitting.  Walk a def body top to bottom with one table
`name -> who produced it`.  On an `if`, every arm starts from a *copy* of that
table, so a name read inside an arm resolves either to something defined
before the region (an outside cable) or to something the same arm defined
(an inside cable).  A sibling arm's definitions are never in the copy, which
is why a cable can never run from one arm into another: the table cannot
produce one.  After the region, every name any arm wrote becomes a phi: one
producer per arm, a pass-through of the outer value where an arm did not
write it, or UNBOUND where nothing did.

Run it on a file:

    python3 docs/branch_arm_binding.py path/to/source.py [function]
"""

from __future__ import annotations

import ast
import json
import sys
from dataclasses import dataclass, field


def _callee(call: ast.Call) -> str:
    func = call.func
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return f"{ast.unparse(func.value)}.{func.attr}"
    return ast.unparse(func)


@dataclass
class Read:
    name: str
    producer: str
    origin: str  # "outside" | "inside"
    consumer: str


@dataclass
class Arm:
    label: str
    condition_reads: list[str]
    reads: list[Read] = field(default_factory=list)
    writes: dict[str, str] = field(default_factory=dict)
    returns: list[str] = field(default_factory=list)
    nested: list["Region"] = field(default_factory=list)


@dataclass
class Region:
    label: str
    line: int
    arms: list[Arm] = field(default_factory=list)
    phi: dict[str, dict[str, str]] = field(default_factory=dict)


def _flatten_if(node: ast.If) -> list[tuple[str, ast.expr | None, list[ast.stmt]]]:
    """`if / elif / elif / else` is one region with N arms, not N nested regions."""
    arms: list[tuple[str, ast.expr | None, list[ast.stmt]]] = [("if", node.test, node.body)]
    orelse = node.orelse
    while len(orelse) == 1 and isinstance(orelse[0], ast.If):
        nested = orelse[0]
        arms.append(("elif", nested.test, nested.body))
        orelse = nested.orelse
    if orelse:
        arms.append(("else", None, orelse))
    return arms


class _Lowerer:
    def __init__(self) -> None:
        self.regions: list[Region] = []

    def lower_body(self, body: list[ast.stmt], env: dict[str, str], arm: Arm | None,
                   local: set[str], regions_out: list[Region]) -> None:
        for statement in body:
            if isinstance(statement, ast.Assign) and isinstance(statement.value, ast.Call):
                producer = f"{_callee(statement.value)}()"
                self._record_reads(statement.value, env, arm, local, producer)
                for target in statement.targets:
                    for name in _names(target):
                        env[name] = producer
                        local.add(name)
                        if arm is not None:
                            arm.writes[name] = producer
            elif isinstance(statement, ast.Return) and statement.value is not None:
                if isinstance(statement.value, ast.Call):
                    producer = f"{_callee(statement.value)}()"
                    self._record_reads(statement.value, env, arm, local, producer)
                    if arm is not None:
                        arm.returns.append(producer)
                else:
                    for name in _loads(statement.value):
                        self._read(name, env, arm, local, "return")
                    if arm is not None:
                        arm.returns.append(ast.unparse(statement.value))
            elif isinstance(statement, ast.If):
                region = self.lower_if(statement, env, local)
                regions_out.append(region)
            elif isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Call):
                producer = f"{_callee(statement.value)}()"
                self._record_reads(statement.value, env, arm, local, producer)

    def lower_if(self, node: ast.If, env: dict[str, str], outer_local: set[str]) -> Region:
        region = Region(label=f"if {ast.unparse(node.test)}:", line=node.lineno)
        written: dict[str, dict[str, str]] = {}
        arm_envs: list[dict[str, str]] = []
        for keyword, test, body in _flatten_if(node):
            label = f"{keyword} {ast.unparse(test)}:" if test is not None else "else:"
            arm = Arm(label=label, condition_reads=sorted(_loads(test)) if test is not None else [])
            arm_env = dict(env)          # the copy is the whole rule
            arm_local: set[str] = set()
            self.lower_body(body, arm_env, arm, arm_local, arm.nested)
            region.arms.append(arm)
            arm_envs.append(arm_env)
            for name, producer in arm.writes.items():
                written.setdefault(name, {})
            for name in arm_local:
                written.setdefault(name, {})
        for name in sorted(written):
            per_arm: dict[str, str] = {}
            for arm, arm_env in zip(region.arms, arm_envs):
                if name in arm_env and arm_env[name] != env.get(name):
                    per_arm[arm.label] = arm_env[name]
                elif name in env:
                    per_arm[arm.label] = f"pass-through ({env[name]})"
                else:
                    per_arm[arm.label] = "UNBOUND"
            if not any(a.label == "else:" for a in region.arms):
                per_arm["(no else)"] = f"pass-through ({env[name]})" if name in env else "UNBOUND"
            region.phi[name] = per_arm
            env[name] = f"φ {name} @L{node.lineno}"
            outer_local.add(name)
        return region

    def _record_reads(self, call: ast.Call, env: dict[str, str], arm: Arm | None,
                      local: set[str], consumer: str) -> None:
        for argument in list(call.args) + [k.value for k in call.keywords]:
            for name in _loads(argument):
                self._read(name, env, arm, local, consumer)

    @staticmethod
    def _read(name: str, env: dict[str, str], arm: Arm | None, local: set[str], consumer: str) -> None:
        if arm is None:
            return
        producer = env.get(name, "UNBOUND")
        origin = "inside" if name in local else "outside"
        arm.reads.append(Read(name, producer, origin, consumer))


def _names(target: ast.expr) -> list[str]:
    if isinstance(target, ast.Name):
        return [target.id]
    if isinstance(target, (ast.Tuple, ast.List)):
        return [n for element in target.elts for n in _names(element)]
    return []


def _loads(expression: ast.expr | None) -> set[str]:
    if expression is None:
        return set()
    return {n.id for n in ast.walk(expression) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)}


def arm_tables(source: str, function: str = "run") -> dict:
    tree = ast.parse(source)
    target = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == function)
    env = {argument.arg: f"parameter {argument.arg}" for argument in target.args.args}
    lowerer = _Lowerer()
    regions: list[Region] = []
    lowerer.lower_body(target.body, env, None, set(env), regions)

    def region_dict(region: Region) -> dict:
        return {
            "label": region.label,
            "line": region.line,
            "arms": [
                {
                    "label": arm.label,
                    "conditionReads": arm.condition_reads,
                    "reads": [r.__dict__ for r in arm.reads],
                    "writes": arm.writes,
                    "returns": arm.returns,
                    "nested": [region_dict(n) for n in arm.nested],
                }
                for arm in region.arms
            ],
            "phi": region.phi,
        }

    all_regions: list[Region] = []

    def collect(region: Region) -> None:
        all_regions.append(region)
        for arm in region.arms:
            for nested in arm.nested:
                collect(nested)

    for region in regions:
        collect(region)
    sibling_reads = 0
    outside_reads = 0
    inside_reads = 0
    for region in all_regions:
        producers_by_arm = {arm.label: set(arm.writes.values()) for arm in region.arms}
        for arm in region.arms:
            for read in arm.reads:
                if read.origin == "inside":
                    inside_reads += 1
                else:
                    outside_reads += 1
                for other, producers in producers_by_arm.items():
                    if other != arm.label and read.producer in producers and read.origin != "inside":
                        sibling_reads += 1
    return {
        "function": function,
        "regions": [region_dict(r) for r in regions],
        "counts": {
            "regions": len(all_regions),
            "arms": sum(len(r.arms) for r in all_regions),
            "outsideReads": outside_reads,
            "insideReads": inside_reads,
            "siblingArmReads": sibling_reads,
            "phiNames": sum(len(r.phi) for r in all_regions),
        },
    }


if __name__ == "__main__":
    path = sys.argv[1]
    function = sys.argv[2] if len(sys.argv) > 2 else "run"
    print(json.dumps(arm_tables(open(path, encoding="utf-8").read(), function), indent=2, ensure_ascii=False))

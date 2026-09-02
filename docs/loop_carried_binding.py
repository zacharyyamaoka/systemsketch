#!/usr/bin/env python3
"""Loop-carried names for a `for` or `while`, from stdlib `ast` alone.

The same one-table lowering as `branch_arm_binding.py`, with one addition: the
body is walked twice.  A name that is *read* in the body before the body
*writes* it is loop-carried: on the first iteration it resolves to the value
before the loop (the seed), on every later iteration to the body's own last
write (the back-edge).  After the loop, every name the body wrote is a join of
two producers: the body's last write (one or more iterations) and the value
before the loop (zero iterations).  A `for` header additionally *produces* the
item name and *consumes* the iterable; a `while` header consumes the names in
its test.  That is the whole contract the loop boards draw.

    python3 docs/loop_carried_binding.py path/to/source.py [function]
"""

from __future__ import annotations

import ast
import json
import sys


def _callee(call: ast.Call) -> str:
    func = call.func
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return f"{ast.unparse(func.value)}.{func.attr}"
    return ast.unparse(func)


def _loads(expression: ast.AST | None) -> set[str]:
    if expression is None:
        return set()
    return {n.id for n in ast.walk(expression) if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load)}


def _names(target: ast.expr) -> list[str]:
    if isinstance(target, ast.Name):
        return [target.id]
    if isinstance(target, (ast.Tuple, ast.List)):
        return [n for element in target.elts for n in _names(element)]
    return []


def _walk_body(body: list[ast.stmt], env: dict[str, str], reads: list, writes: dict) -> None:
    for statement in body:
        if isinstance(statement, ast.Assign) and isinstance(statement.value, ast.Call):
            producer = f"{_callee(statement.value)}()"
            for argument in list(statement.value.args) + [k.value for k in statement.value.keywords]:
                for name in _loads(argument):
                    reads.append((name, env.get(name, "UNBOUND"), producer))
            for target in statement.targets:
                for name in _names(target):
                    env[name] = producer
                    writes[name] = producer
        elif isinstance(statement, ast.Expr) and isinstance(statement.value, ast.Call):
            producer = f"{_callee(statement.value)}()"
            for argument in statement.value.args:
                for name in _loads(argument):
                    reads.append((name, env.get(name, "UNBOUND"), producer))


def loop_tables(source: str, function: str = "run") -> dict:
    tree = ast.parse(source)
    target = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == function)
    env = {argument.arg: f"parameter {argument.arg}" for argument in target.args.args}
    loops = []
    for statement in target.body:
        if isinstance(statement, ast.Assign) and isinstance(statement.value, ast.Call):
            producer = f"{_callee(statement.value)}()"
            for t in statement.targets:
                for name in _names(t):
                    env[name] = producer
        elif isinstance(statement, (ast.For, ast.While)):
            before = dict(env)
            header: dict = {"kind": type(statement).__name__.lower(), "line": statement.lineno}
            if isinstance(statement, ast.For):
                header["item"] = _names(statement.target)
                header["iterable"] = ast.unparse(statement.iter)
                header["consumes"] = sorted(_loads(statement.iter))
                header["label"] = f"for {ast.unparse(statement.target)} in {ast.unparse(statement.iter)}:"
                for name in header["item"]:
                    env[name] = "header item"
            else:
                header["test"] = ast.unparse(statement.test)
                header["consumes"] = sorted(_loads(statement.test))
                header["label"] = f"while {ast.unparse(statement.test)}:"
            # pass one: what the body reads before it writes, resolved against the pre-loop table
            reads1: list = []
            writes: dict = {}
            env1 = dict(env)
            _walk_body(statement.body, env1, reads1, writes)
            # pass two: the same body with the first pass's writes already in the table
            reads2: list = []
            env2 = dict(env1)
            _walk_body(statement.body, env2, reads2, {})
            carried = {}
            for (name, seed, consumer), (_, back, _) in zip(reads1, reads2):
                if name in writes and seed != back:
                    carried[name] = {"seed": seed, "back": back, "consumer": consumer}
            exit_phi = {}
            for name, last in writes.items():
                exit_phi[name] = {"after ≥1 iteration": last, "after 0 iterations": before.get(name, "UNBOUND")}
                env[name] = f"φ {name} @L{statement.lineno}"
            item_reads = [r for r in reads1 if r[1] == "header item"]
            loops.append({
                "header": header,
                "carried": carried,
                "itemReads": [{"name": n, "consumer": c} for n, _, c in item_reads],
                "bodyReadsFromOutside": sorted({n for n, p, _ in reads1 if n not in writes and p != "header item"}),
                "exitPhi": exit_phi,
            })
        elif isinstance(statement, ast.Return) and statement.value is not None:
            loops.append({"return": ast.unparse(statement.value), "resolves": {n: env.get(n, "UNBOUND") for n in _loads(statement.value)}})
    return {"function": function, "loops": loops}


if __name__ == "__main__":
    path = sys.argv[1]
    function = sys.argv[2] if len(sys.argv) > 2 else "run"
    print(json.dumps(loop_tables(open(path, encoding="utf-8").read(), function), indent=2, ensure_ascii=False))

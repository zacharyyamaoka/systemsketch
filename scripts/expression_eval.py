"""Safe evaluation of one-line Python property expressions.

A property value can be a plain literal (``"0.42"``) or a Python expression
that references other named expressions from a "registry" (``"chassis_width
/ 4"``). This module evaluates that expression using real ``ast``-based
Python semantics — never regex/string hacking — against a small safe-math
namespace plus lazily-resolved registry lookups, with cycle detection and
precise per-identifier source spans so the frontend can underline exactly
the substring that is undefined or circular.

Only the Python standard library is used, matching the rest of ``scripts/``.
"""

from __future__ import annotations

import ast
import json
import math
from typing import Any


def clamp(x: float, lo: float, hi: float) -> float:
    """Constrain ``x`` to the closed range ``[lo, hi]``."""
    return max(lo, min(hi, x))


# WHY: builtins are empty in the eval namespace (see _evaluate) so this is the
# entire vocabulary a property expression can call — anything not listed here
# and not a registry name simply NameErrors, which is also how attempts to
# reach real builtins (open, __import__, exec, ...) are refused, with no
# separate blocklist to keep in sync.
_SAFE_NAMESPACE: dict[str, Any] = {
    "abs": abs,
    "round": round,
    "min": min,
    "max": max,
    "pow": pow,
    "sum": sum,
    "len": len,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "sqrt": math.sqrt,
    "floor": math.floor,
    "ceil": math.ceil,
    "pi": math.pi,
    "e": math.e,
    "radians": math.radians,
    "degrees": math.degrees,
    "log": math.log,
    "log2": math.log2,
    "log10": math.log10,
    "exp": math.exp,
    "clamp": clamp,
}


def _abs_offset(lines: list[str], lineno: int, col_offset: int) -> int:
    """Turn ast's (1-based lineno, line-relative col_offset) into a plain
    character offset into the original source string. A Name node never
    itself spans multiple lines, so lineno is the same for start and end;
    this still does the right thing if `expr` happens to contain a literal
    newline (this feature is for one-line values, but nothing here assumes
    it)."""
    return sum(len(line) for line in lines[: lineno - 1]) + col_offset


def _name_occurrences(tree: ast.AST, expr: str) -> list[dict]:
    lines = expr.splitlines(keepends=True) or [expr]
    occurrences = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Load):
            occurrences.append({
                "name": node.id,
                "start": _abs_offset(lines, node.lineno, node.col_offset),
                "end": _abs_offset(lines, node.end_lineno, node.end_col_offset),
            })
    # ast.walk is breadth-first, not source order; sort so occurrences read
    # left to right regardless of which AST field visits which child first.
    occurrences.sort(key=lambda item: item["start"])
    return occurrences


def extract_used_names(expr: str) -> list[dict]:
    """Every `ast.Name(Load)` occurrence in `expr`, as
    `{"name", "start", "end"}` character offsets — purely structural, no
    resolution or evaluation. Returns `[]` (never raises) on a syntax error;
    `evaluate_expression` owns reporting that as its `error` field."""
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError:
        return []
    return _name_occurrences(tree, expr)


def _check_ast_safety(tree: ast.AST) -> str | None:
    """Return a human-readable rejection reason, or None if `tree` is safe
    to compile and eval against the safe namespace."""
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            return "import statements are not allowed"
        if isinstance(node, ast.Lambda):
            return "lambda expressions are not allowed"
        if isinstance(node, ast.Attribute) and node.attr.startswith("__") and node.attr.endswith("__"):
            return f"attribute access to '{node.attr}' is not allowed"
    return None


def _to_json_safe(value: Any) -> Any:
    """Best-effort JSON-compatible cast. tuple/set/frozenset become lists;
    dict keys are stringified; everything else passes through and is caught
    by the `json.dumps` probe in the caller if it turns out not to encode."""
    if isinstance(value, (bool, int, float, str)) or value is None:
        return value
    if isinstance(value, dict):
        return {str(key): _to_json_safe(item) for key, item in value.items()}
    if isinstance(value, (list, tuple, set, frozenset)):
        return [_to_json_safe(item) for item in value]
    return value


def _used_name_value(value: Any) -> Any:
    """The value shown for a resolved identifier in `usedNames`. A safe-
    namespace function (e.g. `sin`) resolves fine but has no meaningful JSON
    value to show the frontend, so it reports None rather than a repr string
    dressed up as data."""
    if callable(value):
        return None
    try:
        json.dumps(_to_json_safe(value))
    except (TypeError, ValueError):
        return None
    return _to_json_safe(value)


def _resolve(
    name: str,
    registry: dict[str, str],
    stack: list[str],
    cache: dict[str, tuple[bool, Any, str | None]],
) -> tuple[bool, Any, str | None]:
    """Resolve one registry name to (ok, value, error), memoized, detecting
    a reference back to a name already being resolved on `stack`."""
    if name in cache:
        return cache[name]
    if name in stack:
        chain = stack[stack.index(name):] + [name]
        result = (False, None, "circular reference: " + " -> ".join(chain))
        cache[name] = result
        return result
    if name not in registry:
        result = (False, None, f"name '{name}' is not defined")
        cache[name] = result
        return result
    sub_expr = registry[name]
    if not isinstance(sub_expr, str):
        result = (False, None, f"registry entry '{name}' must be a string expression")
        cache[name] = result
        return result
    stack.append(name)
    try:
        sub_result = _evaluate(sub_expr, registry, stack, cache)
    finally:
        stack.pop()
    result = (True, sub_result["value"], None) if sub_result["ok"] else (False, None, sub_result["error"])
    cache[name] = result
    return result


def _evaluate(
    expr: str,
    registry: dict[str, str],
    stack: list[str],
    cache: dict[str, tuple[bool, Any, str | None]],
) -> dict:
    """Shared core for the top-level expression and every registry entry it
    depends on — a registry lookup is just this same evaluation recursing on
    a different source string, sharing one cycle-detection `stack` and one
    memoization `cache` for the whole resolution tree."""
    try:
        tree = ast.parse(expr, mode="eval")
    except SyntaxError as cause:
        return {"ok": False, "error": f"syntax error: {cause}", "usedNames": []}

    safety_error = _check_ast_safety(tree)
    occurrences = _name_occurrences(tree, expr)

    eval_namespace: dict[str, Any] = {}
    used_names: list[dict] = []
    first_error: str | None = None
    for occurrence in occurrences:
        name = occurrence["name"]
        if name in _SAFE_NAMESPACE:
            value = _SAFE_NAMESPACE[name]
            ok, error = True, None
        else:
            ok, value, error = _resolve(name, registry, stack, cache)
        eval_namespace.setdefault(name, value if ok else None)
        used_names.append({
            **occurrence,
            "defined": ok,
            "value": _used_name_value(value) if ok else None,
            "error": error,
        })
        if not ok and first_error is None:
            first_error = error

    if safety_error is not None:
        return {"ok": False, "error": safety_error, "usedNames": used_names}
    if first_error is not None:
        return {"ok": False, "error": first_error, "usedNames": used_names}

    eval_namespace["__builtins__"] = {}
    try:
        value = eval(compile(tree, "<expression>", "eval"), eval_namespace)  # noqa: S307
    except Exception as cause:  # eval'ing arbitrary-but-restricted code can raise almost anything
        return {"ok": False, "error": str(cause), "usedNames": used_names}

    text_repr = repr(value)
    safe_value = _to_json_safe(value)
    try:
        json.dumps(safe_value)
    except (TypeError, ValueError):
        safe_value = None
    return {"ok": True, "value": safe_value, "repr": text_repr, "usedNames": used_names}


def evaluate_expression(expr: str, registry: dict[str, str]) -> dict:
    """Evaluate `expr`, resolving any bare identifier it uses either from the
    small safe-math namespace or, lazily and recursively, from `registry`
    (name -> expression string). See module docstring for the full contract;
    the return shape is exactly one of:

        {"ok": True, "value": ..., "repr": "...", "usedNames": [...]}
        {"ok": False, "error": "...", "usedNames": [...]}
    """
    return _evaluate(expr, dict(registry or {}), [], {})

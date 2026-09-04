#!/usr/bin/env python3
"""Place source-derived ``break`` / ``continue`` badges onto a board.

The editor deliberately does not parse Python. This offline command is the
strict half of the contract: it walks Python's AST, then writes the resulting
plain ``controlIcons`` lists onto already-mapped Loop and Branch-arm records.
The map is explicit because a canvas position is presentation, not proof that a
particular region came from a particular source arm.

Usage::

    python3 scripts/place_control_icons.py \
      --board sketches/review/example.systemsketch \
      --source examples/solver.py \
      --map examples/solver.control-icons.json

The map names each source owner that can receive an icon. A Loop target omits
``armId``; a Branch-arm target includes it::

    {
      "owners": {
        "loop": {"shapeId": "shape:solve-loop"},
        "loop.branch0.arm0": {
          "shapeId": "shape:stop-branch", "armId": "arm_1"
        }
      }
    }

Use ``--loop-region`` when one board is populated from several source snippets
and their owner ids need a stable namespace (for example ``c4.loop``). Every
mapped target is rewritten, including an empty list. That makes a rerun remove
stale badges instead of leaving a prior source analysis painted on the board.
"""

from __future__ import annotations

import argparse
import ast
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Iterable


CONTROL_KINDS = {"break", "continue"}


class ControlIconPlacementError(ValueError):
    """A source/map/board mismatch that would otherwise silently misplace ink."""


def _flatten_if_chain(node: ast.If) -> list[list[ast.stmt]]:
    """Flatten Python's ``if / elif / else`` encoding into sibling arm bodies."""
    arms = [node.body]
    orelse = node.orelse
    while len(orelse) == 1 and isinstance(orelse[0], ast.If):
        arms.append(orelse[0].body)
        orelse = orelse[0].orelse
    if orelse:
        arms.append(orelse)
    return arms


def compute_placements(source: str, loop_region_id: str = "loop") -> dict[str, list[dict[str, int | str]]]:
    """Return the header owner of every exit in the source's first loop.

    ``if`` changes owners, nested loops stop the walk, and ``try`` / ``with``
    descend transparently. The latter is intentionally explicit: treating a
    transparent wrapper as a no-op silently loses every exit inside it.
    """
    tree = ast.parse(source)
    loop_node = next((node for node in ast.walk(tree) if isinstance(node, (ast.For, ast.While))), None)
    if loop_node is None:
        raise ControlIconPlacementError("source must contain a for or while loop")

    placements: dict[str, list[dict[str, int | str]]] = {}
    branch_counter = 0

    def walk(statements: Iterable[ast.stmt], owner: str) -> None:
        nonlocal branch_counter
        for statement in statements:
            if isinstance(statement, ast.Break):
                placements.setdefault(owner, []).append({"kind": "break", "line": statement.lineno})
            elif isinstance(statement, ast.Continue):
                placements.setdefault(owner, []).append({"kind": "continue", "line": statement.lineno})
            elif isinstance(statement, ast.If):
                branch_index = branch_counter
                branch_counter += 1
                for arm_index, arm_body in enumerate(_flatten_if_chain(statement)):
                    walk(arm_body, f"{owner}.branch{branch_index}.arm{arm_index}")
            elif isinstance(statement, (ast.For, ast.While)):
                # Python binds exits to the nearest loop, so this loop's pass
                # must not claim descendants of another loop's body.
                continue
            elif isinstance(statement, ast.Try):
                walk(statement.body, owner)
                for handler in statement.handlers:
                    walk(handler.body, owner)
                walk(statement.orelse, owner)
                walk(statement.finalbody, owner)
            elif isinstance(statement, (ast.With, ast.AsyncWith)):
                walk(statement.body, owner)
            # Assignments, expressions, and nested definitions are genuine
            # no-ops for this pass: no owner change and no recursion.

    walk(loop_node.body, loop_region_id)
    return placements


def _as_object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ControlIconPlacementError(f"{label} must be an object")
    return value


def read_owner_map(path: Path) -> dict[str, dict[str, str]]:
    """Read and validate the deliberate source-owner → shape-owner bridge."""
    try:
        document = _as_object(json.loads(path.read_text(encoding="utf-8")), "map")
    except json.JSONDecodeError as error:
        raise ControlIconPlacementError(f"invalid map JSON: {error.msg}") from error
    raw_owners = _as_object(document.get("owners"), "map.owners")
    owners: dict[str, dict[str, str]] = {}
    for owner_id, raw_target in raw_owners.items():
        if not isinstance(owner_id, str) or not owner_id:
            raise ControlIconPlacementError("map.owners keys must be non-empty source owner ids")
        target = _as_object(raw_target, f"map.owners[{owner_id!r}]")
        shape_id = target.get("shapeId")
        arm_id = target.get("armId")
        if not isinstance(shape_id, str) or not shape_id:
            raise ControlIconPlacementError(f"map owner {owner_id!r} needs a non-empty shapeId")
        if arm_id is not None and (not isinstance(arm_id, str) or not arm_id):
            raise ControlIconPlacementError(f"map owner {owner_id!r} has an invalid armId")
        owners[owner_id] = {"shapeId": shape_id, **({"armId": arm_id} if arm_id is not None else {})}
    if not owners:
        raise ControlIconPlacementError("map.owners cannot be empty")
    return owners


def _records(board: dict[str, Any]) -> list[dict[str, Any]]:
    records = board.get("records")
    if not isinstance(records, list):
        raise ControlIconPlacementError("board must contain a tldraw records array")
    return [record for record in records if isinstance(record, dict)]


def _icon_list(value: list[dict[str, int | str]]) -> list[dict[str, int | str]]:
    icons: list[dict[str, int | str]] = []
    for icon in value:
        kind = icon.get("kind")
        line = icon.get("line")
        if kind not in CONTROL_KINDS or not isinstance(line, int) or line <= 0:
            raise ControlIconPlacementError(f"invalid computed icon: {icon!r}")
        icons.append({"kind": kind, "line": line})
    return icons


def apply_placements(
    board: dict[str, Any],
    placements: dict[str, list[dict[str, int | str]]],
    owners: dict[str, dict[str, str]],
) -> int:
    """Mutate a decoded board with this pass's placements and return changes."""
    unmapped = sorted(set(placements) - set(owners))
    if unmapped:
        raise ControlIconPlacementError(
            "computed source owner(s) have no board target: " + ", ".join(unmapped)
        )

    shape_by_id = {
        record.get("id"): record
        for record in _records(board)
        if record.get("typeName") == "shape" and isinstance(record.get("id"), str)
    }
    changed = 0
    for owner_id, target in owners.items():
        shape = shape_by_id.get(target["shapeId"])
        if shape is None:
            raise ControlIconPlacementError(f"map owner {owner_id!r} names a missing shape {target['shapeId']!r}")
        props = _as_object(shape.get("props"), f"shape {target['shapeId']!r}.props")
        icons = _icon_list(placements.get(owner_id, []))
        arm_id = target.get("armId")
        if arm_id is None:
            if shape.get("type") != "loop":
                raise ControlIconPlacementError(f"map owner {owner_id!r} must target a loop when armId is absent")
            if props.get("controlIcons") != icons:
                props["controlIcons"] = icons
                changed += 1
            continue

        if shape.get("type") != "branch":
            raise ControlIconPlacementError(f"map owner {owner_id!r} must target a branch when armId is present")
        arms = props.get("arms")
        if not isinstance(arms, list):
            raise ControlIconPlacementError(f"branch {target['shapeId']!r} has no arms array")
        arm = next((candidate for candidate in arms if isinstance(candidate, dict) and candidate.get("id") == arm_id), None)
        if arm is None:
            raise ControlIconPlacementError(
                f"map owner {owner_id!r} names missing arm {arm_id!r} on {target['shapeId']!r}"
            )
        if arm.get("controlIcons") != icons:
            arm["controlIcons"] = icons
            changed += 1
    return changed


def _atomic_write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", dir=path.parent, delete=False) as temporary:
        temporary.write(content)
        temporary.flush()
        os.fsync(temporary.fileno())
        temporary_path = Path(temporary.name)
    temporary_path.replace(path)


def update_board(board_path: Path, source: str, owners: dict[str, dict[str, str]], loop_region_id: str) -> tuple[int, dict[str, list[dict[str, int | str]]]]:
    try:
        board = _as_object(json.loads(board_path.read_text(encoding="utf-8")), "board")
    except json.JSONDecodeError as error:
        raise ControlIconPlacementError(f"invalid board JSON: {error.msg}") from error
    placements = compute_placements(source, loop_region_id)
    changed = apply_placements(board, placements, owners)
    if changed:
        _atomic_write(board_path, json.dumps(board, ensure_ascii=False, indent=2) + "\n")
    return changed, placements


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--board", required=True, type=Path, help=".systemsketch board to update")
    parser.add_argument("--source", required=True, type=Path, help="Python source containing one target loop")
    parser.add_argument("--map", required=True, type=Path, dest="owner_map", help="explicit source owner → board owner JSON")
    parser.add_argument("--loop-region", default="loop", help="owner id for this source's outer loop (default: loop)")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        owners = read_owner_map(args.owner_map)
        changed, placements = update_board(args.board, args.source.read_text(encoding="utf-8"), owners, args.loop_region)
    except (OSError, ControlIconPlacementError, SyntaxError) as error:
        raise SystemExit(f"control-icon placement: {error}") from error
    print(json.dumps({"board": str(args.board), "updated": changed, "placements": placements}, indent=2))


if __name__ == "__main__":
    main()

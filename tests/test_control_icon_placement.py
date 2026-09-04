"""Regression proof for the offline control-icon placement pass."""

from __future__ import annotations

import copy
import importlib.util
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("place_control_icons", ROOT / "scripts" / "place_control_icons.py")
assert SPEC and SPEC.loader
placement = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = placement
SPEC.loader.exec_module(placement)

FROZEN_SPEC = importlib.util.spec_from_file_location(
    "frozen_control_icon_placement_rule", ROOT / "docs" / "control_icon_placement_rule.py"
)
assert FROZEN_SPEC and FROZEN_SPEC.loader
frozen = importlib.util.module_from_spec(FROZEN_SPEC)
sys.modules[FROZEN_SPEC.name] = frozen
FROZEN_SPEC.loader.exec_module(frozen)


class ControlIconPlacementTests(unittest.TestCase):
    def test_frozen_acceptance_cases(self) -> None:
        for name, source in frozen.CASES.items():
            with self.subTest(name=name):
                self.assertEqual(placement.compute_placements(source), frozen.compute_placements(source))

    def test_region_namespace_carries_through_nested_arms(self) -> None:
        source = frozen.CASES["c5_nested_branch"]
        expected = {
            key.replace("loop", "case5.loop", 1): value
            for key, value in frozen.compute_placements(source).items()
        }
        self.assertEqual(placement.compute_placements(source, "case5.loop"), expected)

    def test_apply_writes_lists_and_clears_mapped_siblings(self) -> None:
        board = {
            "records": [
                {"id": "shape:loop", "typeName": "shape", "type": "loop", "props": {"controlIcons": [{"kind": "break", "line": 1}]}},
                {"id": "shape:branch", "typeName": "shape", "type": "branch", "props": {"arms": [
                    {"id": "arm_1", "controlIcons": [{"kind": "continue", "line": 2}]},
                    {"id": "arm_2"},
                ]}},
            ],
        }
        owners = {
            "loop": {"shapeId": "shape:loop"},
            "loop.branch0.arm0": {"shapeId": "shape:branch", "armId": "arm_1"},
            "loop.branch0.arm1": {"shapeId": "shape:branch", "armId": "arm_2"},
        }
        changed = placement.apply_placements(
            board,
            {"loop.branch0.arm0": [{"kind": "break", "line": 5}]},
            owners,
        )
        self.assertEqual(changed, 3)
        loop, branch = board["records"]
        self.assertEqual(loop["props"]["controlIcons"], [])
        self.assertEqual(branch["props"]["arms"][0]["controlIcons"], [{"kind": "break", "line": 5}])
        self.assertEqual(branch["props"]["arms"][1]["controlIcons"], [])
        self.assertEqual(placement.apply_placements(board, {"loop.branch0.arm0": [{"kind": "break", "line": 5}]}, owners), 0)

    def test_apply_refuses_to_silently_drop_unmapped_owner(self) -> None:
        board = {"records": []}
        with self.assertRaisesRegex(placement.ControlIconPlacementError, "no board target"):
            placement.apply_placements(board, {"loop.branch0.arm0": [{"kind": "break", "line": 5}]}, {"loop": {"shapeId": "shape:loop"}})

    def test_apply_does_not_mutate_when_a_missing_target_is_rejected(self) -> None:
        board = {"records": [{"id": "shape:loop", "typeName": "shape", "type": "loop", "props": {}}]}
        before = copy.deepcopy(board)
        with self.assertRaisesRegex(placement.ControlIconPlacementError, "missing shape"):
            placement.apply_placements(board, {}, {"loop": {"shapeId": "shape:missing"}})
        self.assertEqual(board, before)


if __name__ == "__main__":
    unittest.main()

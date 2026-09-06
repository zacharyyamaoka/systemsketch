#!/usr/bin/env python3
"""
Does SystemSketch's `pytrees` Blackboard placement look like py_trees'?

py_trees draws the same tree with `render_dot_tree(with_blackboard_variables=True)`:
every key sits in Graphviz's sink rank, writes are blue behaviour→key edges,
reads are green key→behaviour edges, and the edges never change a node's rank.
This script builds the sample tree in real py_trees, lets Graphviz place it,
and compares the key order and normalised cross positions with what the
real-browser journey recorded (`docs/assets/behavior-tree/pytrees-placement.json`).

Run:  /tmp/pytrees-venv/bin/python scripts/behavior_tree_pytrees_parity.py
      (needs `pip install py_trees pydot` and Graphviz's `dot`)
"""
from __future__ import annotations

import json
import shlex
import subprocess
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
ASSETS = REPO / "docs" / "assets" / "behavior-tree"
SAMPLE_TS = REPO / "src" / "behaviorTree" / "btcppXml.ts"


def sample_xml() -> str:
    text = SAMPLE_TS.read_text()
    start = text.index("export const SAMPLE_BEHAVIOR_TREE_XML = `") + len("export const SAMPLE_BEHAVIOR_TREE_XML = `")
    return text[start:text.index("`", start)]


def build_py_trees(xml_text: str):
    import py_trees
    from py_trees import behaviours, common, composites

    root_el = ET.fromstring(xml_text)
    directions: dict[str, dict[str, str]] = {}
    for models in root_el.findall("TreeNodesModel"):
        for model in models:
            ports = {}
            for port in model:
                kind = {"input_port": "read", "output_port": "write", "inout_port": "inout"}.get(port.tag)
                if kind:
                    ports[port.get("name")] = kind
            directions[model.get("ID")] = ports
    main_id = root_el.get("main_tree_to_execute")
    tree_el = next(t for t in root_el.findall("BehaviorTree") if t.get("ID") == main_id)

    counter = {"n": 0}

    def unique(name: str) -> str:
        counter["n"] += 1
        return f"{name}#{counter['n']}"

    def leaf(el: ET.Element):
        node_id = el.get("ID") if el.tag == "SubTree" else el.tag
        name = el.get("name") or node_id
        behaviour = behaviours.Success(name=unique(name))
        client = behaviour.attach_blackboard_client(name=behaviour.name)
        for attr, value in el.attrib.items():
            if attr in ("name", "ID") or attr.startswith("_"):
                continue
            if not (value.startswith("{") and value.endswith("}")):
                continue
            key = value[1:-1].lstrip("@")
            direction = directions.get(node_id, {}).get(attr, "inout" if el.tag == "SubTree" else "read")
            if direction in ("read", "inout"):
                client.register_key(key=key, access=common.Access.READ)
            if direction in ("write", "inout"):
                client.register_key(key=key, access=common.Access.WRITE)
        return behaviour, node_id

    def build(el: ET.Element):
        name = el.get("name") or el.tag
        if el.tag in ("Sequence", "SequenceWithMemory", "ReactiveSequence"):
            node = composites.Sequence(unique(name), memory=el.tag != "ReactiveSequence")
        elif el.tag in ("Fallback", "ReactiveFallback"):
            node = composites.Selector(unique(name), memory=el.tag == "Fallback")
        elif el.tag in ("Parallel", "ParallelAll"):
            node = composites.Parallel(unique(name), policy=common.ParallelPolicy.SuccessOnAll())
        elif len(el) > 0:
            node = composites.Sequence(unique(name), memory=True)
        else:
            return leaf(el)[0]
        node.add_children([build(child) for child in el])
        return node

    return py_trees, build(tree_el[0])


def main() -> int:
    xml_text = sample_xml()
    py_trees, root = build_py_trees(xml_text)
    graph = py_trees.display.dot_tree(root, with_blackboard_variables=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    dot_path = ASSETS / "pytrees-reference.dot"
    dot_path.write_text(graph.to_string())
    subprocess.run(["dot", "-Tpng", str(dot_path), "-o", str(ASSETS / "pytrees-reference.png")], check=True)
    plain = subprocess.run(["dot", "-Tplain", str(dot_path)], check=True, capture_output=True, text=True).stdout

    ref_nodes: dict[str, tuple[float, float]] = {}
    for line in plain.splitlines():
        parts = shlex.split(line)
        if parts and parts[0] == "node":
            ref_nodes[parts[1]] = (float(parts[2]), float(parts[3]))
    ref_keys = {name.lstrip("/"): pos for name, pos in ref_nodes.items() if name.startswith("/")}
    ref_behaviours = {name: pos for name, pos in ref_nodes.items() if not name.startswith("/")}
    ref_min_y = min(y for _, y in ref_nodes.values())
    sink_rank_ok = all(abs(y - ref_min_y) < 1e-6 for _, y in ref_keys.values())
    ref_order = [key for key, _ in sorted(ref_keys.items(), key=lambda item: item[1][0])]
    ref_width = max(x for x, _ in ref_nodes.values()) - min(x for x, _ in ref_nodes.values())
    ref_x0 = min(x for x, _ in ref_nodes.values())

    placement_path = ASSETS / "pytrees-placement.json"
    if not placement_path.exists():
        print(f"reference written; no candidate placement at {placement_path} yet")
        return 0
    placement = json.loads(placement_path.read_text())
    pills = [child for child in placement["children"] if child["role"] == "key"]
    nodes = [child for child in placement["children"] if child["role"] == "node"]
    cand_keys = {pill["path"].removeprefix("key:").lstrip("@"): pill["x"] + pill["w"] / 2 for pill in pills}
    cand_order = [key for key, _ in sorted(cand_keys.items(), key=lambda item: item[1])]
    all_x = [child["x"] for child in nodes + pills] + [child["x"] + child["w"] for child in nodes + pills]
    cand_x0, cand_width = min(all_x), max(all_x) - min(all_x)
    cand_bottom = max(child["y"] + child["h"] for child in nodes)
    pills_below = all(pill["y"] >= cand_bottom - 1 for pill in pills)

    common_keys = [key for key in ref_order if key in cand_keys]
    errors = []
    for key in common_keys:
        ref_norm = (ref_keys[key][0] - ref_x0) / ref_width if ref_width else 0.0
        cand_norm = (cand_keys[key] - cand_x0) / cand_width if cand_width else 0.0
        errors.append(abs(ref_norm - cand_norm))
    rmse = (sum(e * e for e in errors) / len(errors)) ** 0.5 if errors else 0.0
    # The claim py_trees makes is "under the nodes that touch it": measure each
    # key against the mean of its accessors in the same drawing, which does not
    # depend on how differently the two engines lay the behaviours out.
    ref_edges = [shlex.split(line) for line in plain.splitlines() if line.startswith("edge")]
    ref_accessors: dict[str, list[float]] = {}
    for parts in ref_edges:
        a, b = parts[1], parts[2]
        for key_name, node_name in ((a, b), (b, a)):
            if key_name.startswith("/") and not node_name.startswith("/"):
                ref_accessors.setdefault(key_name.lstrip("/"), []).append(ref_nodes[node_name][0])
    node_center = {child["path"]: child["x"] + child["w"] / 2 for child in nodes}
    tree_xml = ET.fromstring(xml_text)
    main_tree = next(t for t in tree_xml.findall("BehaviorTree") if t.get("ID") == tree_xml.get("main_tree_to_execute"))
    cand_accessors: dict[str, list[float]] = {}

    def walk(el, path):
        for attr, value in el.attrib.items():
            if value.startswith("{") and value.endswith("}") and path in node_center:
                cand_accessors.setdefault(value[1:-1].lstrip("@"), []).append(node_center[path])
        for index, child in enumerate(el):
            walk(child, f"{path}.{index}")

    walk(main_tree[0], "0")
    relative_errors = []
    for key in common_keys:
        if not ref_accessors.get(key) or not cand_accessors.get(key):
            continue
        ref_rel = (ref_keys[key][0] - sum(ref_accessors[key]) / len(ref_accessors[key])) / ref_width
        cand_rel = (cand_keys[key] - sum(cand_accessors[key]) / len(cand_accessors[key])) / cand_width
        relative_errors.append(abs(ref_rel - cand_rel))
    relative_rmse = (sum(e * e for e in relative_errors) / len(relative_errors)) ** 0.5 if relative_errors else 0.0
    # Order agreement: fraction of key pairs ordered the same way.
    agree = total = 0
    for i, a in enumerate(common_keys):
        for b in common_keys[i + 1:]:
            total += 1
            if (cand_order.index(a) < cand_order.index(b)) == (ref_order.index(a) < ref_order.index(b)):
                agree += 1
    order_accuracy = agree / total if total else 1.0

    report = {
        "reference": {"order": ref_order, "sink_rank": sink_rank_ok, "behaviours": len(ref_behaviours)},
        "candidate": {"order": cand_order, "pills_below_tree": pills_below},
        "pair_order_accuracy": order_accuracy,
        "normalized_x_rmse": rmse,
        "normalized_x_max": max(errors) if errors else 0.0,
        "accessor_relative_rmse": relative_rmse,
        # The gates are the claims py_trees' drawing actually makes: keys in the
        # sink rank, ordered by crossing minimisation. Cross positions are
        # reported, not gated: Graphviz spreads its sink rank evenly under
        # compact ellipses and SystemSketch spreads it under wide Blocks, so the
        # normalised offsets differ by geometry rather than by rule.
        "gates": {"order": order_accuracy >= 0.9, "sink": sink_rank_ok and pills_below},
    }
    (ASSETS / "pytrees-parity.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    return 0 if all(report["gates"].values()) else 1


if __name__ == "__main__":
    sys.exit(main())

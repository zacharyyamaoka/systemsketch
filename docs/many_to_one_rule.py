"""The active-path rule and the many-to-one lint, as pure functions.

Zach's plan (2026-09-02): wire many-to-one directly, keep the region self
contained, and show the switch with transparency.  Written out, the rule is
phi-resolution under a chosen arm, and it needs no state a region does not
already have.

A *selection* maps region -> chosen arm (or nothing).  "Make the loop
inactive" is choosing the loop's implicit arm (zero iterations); "make the
if-without-else inactive" is choosing its implicit unchanged arm.  A region
with an explicit else has no inactive state, because one arm always runs.

A cable fades under a selection when any of these hold:
  (i)   its path passes through a region via an arm that is not the chosen one;
  (ii)  one of its ends sits inside a region's non-chosen arm (the seed into a
        loop body when zero iterations is chosen);
  (iii) phi-resolution: a cable from inside the chosen arm reaches the same
        port, and this cable does not come from inside that arm.
Control cables to a region's band never fade by (ii) or (iii): the condition
is evaluated whichever arm runs.  Nothing else is touched, which is why a
pass-through cable reads at full opacity when the arm it competes with is not
chosen.

The lint is the DAG rule Zach stated: many-to-one is legal only when the
producers are mutually exclusive by construction — sibling arms of one region,
or an inside-the-region producer against an outside one when the region has an
implicit arm (a loop's seed/back and last/zero pairs, an if-without-else's
pass-through).  Two outside producers into one port are never exclusive.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Region:
    key: str
    kind: str                 # "branch" | "loop"
    arms: tuple               # explicit arm keys in source order
    implicit: str | None      # "unchanged" for an if without else, "skip" for a loop, None otherwise
    path: tuple = ()          # ((region, arm), ...) of the enclosing arms


@dataclass(frozen=True)
class Cable:
    key: str
    src: str                  # "block.port" | "in:name" | "item:region"
    dst: str                  # "block.port" | "out:name" | "band:region"
    path: tuple = ()          # ((region, arm), ...): the arms the cable belongs to, outermost first
    src_path: tuple = ()      # the arms the SOURCE block sits in
    dst_path: tuple = ()      # the arms the DESTINATION block sits in
    control: bool = False


def arm_of(path: tuple, region: str):
    for r, a in path:
        if r == region:
            return a
    return None


def fades(cable: Cable, selection: dict, cables: list[Cable]) -> tuple[bool, str]:
    """Whether a cable fades under the selection, and which clause said so."""
    for region, chosen in selection.items():
        if chosen is None:
            continue
        # (i) the cable belongs to a non-chosen arm of this region
        mine = arm_of(cable.path, region)
        if mine is not None and mine != chosen:
            return True, f"(i) belongs to arm '{mine}' of {region}, chosen is '{chosen}'"
        # (ii) an end sits inside a non-chosen arm
        if not cable.control:
            for end_path, label in ((cable.src_path, "source"), (cable.dst_path, "destination")):
                inside = arm_of(end_path, region)
                if inside is not None and inside != chosen:
                    return True, f"(ii) {label} sits inside arm '{inside}' of {region}, chosen is '{chosen}'"
        # (iii) phi-resolution at the destination port
        if not cable.control and arm_of(cable.src_path, region) != chosen:
            for other in cables:
                if other is cable or other.dst != cable.dst or other.control:
                    continue
                if arm_of(other.src_path, region) == chosen and not fades_by_i_ii(other, selection):
                    return True, f"(iii) {other.key} comes from the chosen arm '{chosen}' of {region} and lands on the same port"
    return False, ""


def fades_by_i_ii(cable: Cable, selection: dict) -> bool:
    for region, chosen in selection.items():
        if chosen is None:
            continue
        mine = arm_of(cable.path, region)
        if mine is not None and mine != chosen:
            return True
        for end_path in (cable.src_path, cable.dst_path):
            inside = arm_of(end_path, region)
            if inside is not None and inside != chosen:
                return True
    return False


def opacity(cable: Cable, selection: dict, cables: list[Cable], dim: float = 0.18) -> float:
    faded, _ = fades(cable, selection, cables)
    return dim if faded else 1.0


# --------------------------------------------------------------------------
# The lint
# --------------------------------------------------------------------------


def exclusive(a: Cable, b: Cable, regions: dict[str, Region]) -> tuple[bool, str]:
    """Two producers into one port: are they mutually exclusive by construction?"""
    for key, region in regions.items():
        ra, rb = arm_of(a.src_path, key), arm_of(b.src_path, key)
        if ra is not None and rb is not None and ra != rb:
            return True, f"sibling arms '{ra}' and '{rb}' of {region.kind} '{key}'"
        if (ra is None) != (rb is None) and region.implicit:
            inside = ra or rb
            return True, f"'{inside}' of {region.kind} '{key}' against its implicit '{region.implicit}' arm"
    return False, "no region makes them exclusive"


def lint(cables: list[Cable], regions: dict[str, Region], defaults: set[str] = frozenset()) -> list[dict]:
    """One row per port with two or more data producers; ok iff every pair is exclusive."""
    by_port: dict[str, list[Cable]] = {}
    for c in cables:
        if c.control:
            continue
        by_port.setdefault(c.dst, []).append(c)
    rows = []
    for port, producers in by_port.items():
        if len(producers) < 2:
            continue
        reasons, ok = [], True
        for i in range(len(producers)):
            for j in range(i + 1, len(producers)):
                e, why = exclusive(producers[i], producers[j], regions)
                ok = ok and e
                reasons.append(f"{producers[i].src} × {producers[j].src}: {'exclusive — ' if e else 'NOT exclusive — '}{why}")
        rows.append({"port": port, "producers": [p.src for p in producers], "ok": ok, "reasons": reasons})
    return rows


def live_counts(cables: list[Cable], selection: dict, defaults: set[str] = frozenset()) -> list[dict]:
    """Under a selection, every port must have exactly one live producer (or a default)."""
    by_port: dict[str, list[Cable]] = {}
    for c in cables:
        if c.control:
            continue
        by_port.setdefault(c.dst, []).append(c)
    rows = []
    for port, producers in by_port.items():
        # a port on a block inside a non-chosen arm is dormant: its block does not run, so it needs no live wire
        dormant = any(
            chosen and arm_of(producers[0].dst_path, region) not in (None, chosen)
            for region, chosen in selection.items()
        )
        live = [p.src for p in producers if not fades(p, selection, cables)[0]]
        if dormant:
            state = "dormant (block does not run)"
        elif len(live) == 1:
            state = "one live"
        elif not live:
            state = "no live wire" + ("" if port in defaults else " and no default")
        else:
            state = f"{len(live)} live (neutral)"
        rows.append({"port": port, "live": live, "state": state, "dormant": dormant})
    return rows

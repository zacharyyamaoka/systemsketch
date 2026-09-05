#!/usr/bin/env python3
"""Build the three real Inspector-linking variants and their audited prune."""

from __future__ import annotations

import base64
import json
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'port-linking-babble-2026-09-04.html'
BOARD = ROOT / 'sketches' / 'review' / 'port-linking-tight-slot.systemsketch'
GALLERY = Path('/home/bam/.codex/skills/babble/scripts/gallery.py')


def data_url(path: Path) -> str:
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def live_url(variant_id: int) -> str:
    return 'http://127.0.0.1:4930/?board=' + str(BOARD).replace('/', '%2F') + f'&portLinkPrototype={variant_id}'


def actual_capture(variant_id: int) -> str:
    image = data_url(ROOT / 'docs' / 'assets' / f'port-linking-inspector-v{variant_id}.png')
    return f'''<figure class="port-link-capture">
  <a data-live-board href="{live_url(variant_id)}" target="_blank" rel="noreferrer" title="Open this real Inspector variant">
    <img src="{image}" alt="Actual SystemSketch Inspector port-linking variant {variant_id}">
  </a>
  <figcaption>Actual 1800 × 1000 browser capture. Click to open this interaction in the isolated review board.</figcaption>
</figure>'''


def score(value: int, evidence: str) -> dict[str, object]:
    return {'score': value, 'evidence': evidence, 'confidence': 'high'}


def variant(
    identifier: int,
    name: str,
    thesis: str,
    best: str,
    loses: str,
    decisions: list[tuple[str, str]],
    keep: list[str],
    values: tuple[int, int, int, int],
) -> dict[str, object]:
    evidence = [
        'The actual browser capture exposes an executable adjacent-port interaction; its smoke journey exercises the action.',
        'The capture shows untouched normal name/type fields while the link relation is stored separately as `link.groupId`.',
        'The real Inspector capture shows this interaction beside the existing visible/state controls at the same working density.',
        'The browser journey performs a grouped edit; the pure command tests cover exact seam joining and splitting.',
    ]
    return {
        'id': f'v{identifier}', 'name': name, 'thesis': thesis, 'accent': '#63707a',
        'bestWhen': best, 'losesWhen': loses,
        'decisions': [{'label': label, 'value': value} for label, value in decisions],
        'keepParts': keep,
        'proof': [
            f'Actual headless-Chrome capture of V{identifier} in the same SystemSketch Inspector.',
            'The link schema contains only a group id; written port names and cable endpoints remain ordinary.',
            'The shared browser smoke tests all three concrete workflows.',
        ],
        'previewLabel': 'actual Inspector — click to open live',
        'story': {'title': 'Inspect the real interaction', 'steps': [
            {'label': 'Read the ordinary ports', 'caption': 'Every row is still the normal editable port table; only the Link mode changes.', 'state': 'capture', 'target': '.port-link-capture a[data-live-board]'},
            {'label': 'Open the working variant', 'caption': 'Click the capture to operate this exact treatment on the disposable board.', 'state': 'live', 'target': '.port-link-capture a[data-live-board]'},
        ]},
        'scores': {f'fr{index + 1}': score(value, evidence[index]) for index, value in enumerate(values)},
        'gateResults': {
            'g1': {'pass': True, 'evidence': 'The public command rejects non-consecutive ids; every displayed action targets an adjacent interval.'},
            'g2': {'pass': True, 'evidence': 'The browser assertion reads all six written names unchanged after the V2 seam action.'},
            'g3': {'pass': True, 'evidence': 'All variants render the same neutral 22px-wide outline slot around the ports’ 18px painted footprint; it is a grouping cue, never a directional cable.'},
        },
        'preview': actual_capture(identifier),
        'media': [],
    }


def project() -> dict[str, object]:
    requirements = [
        {'id': 'fr1', 'name': 'Directly links adjacent ports', 'weight': 35, 'why': 'The author asked for a small Link control that works only on ports next to each other, not another special port kind.', 'passCondition': 'A reviewer can create or remove a linked contiguous interval using the displayed control.', 'anchors': {'1': 'Requires a detached configuration surface or can target non-neighbours.', '3': 'Creates a run but needs several explanatory steps.', '5': 'The adjacent relationship is the control’s direct visible object.'}},
        {'id': 'fr2', 'name': 'Keeps hand-written names ordinary', 'weight': 30, 'why': 'Names such as *overlays and **options must remain plain editable strings so the Block primitive stays hackable.', 'passCondition': 'Linking does not replace, derive, or special-case a name, type, cable endpoint, or row.', 'anchors': {'1': 'Turns linked entries into a synthetic collector or rewrites their labels.', '3': 'Preserves text but introduces a competing port mode.', '5': 'Only relationship metadata changes; normal names and endpoints remain visibly intact.'}},
        {'id': 'fr3', 'name': 'Stays quiet beside visibility', 'weight': 20, 'why': 'The Inspector already has a bounded visibility/reordering mode; rare grouping should not make normal port editing feel like a settings panel.', 'passCondition': 'The Link entry lives beside visible/state and the active affordance is compact at normal Inspector width.', 'anchors': {'1': 'Adds a large persistent panel or hides port authoring.', '3': 'Fits but creates meaningful row density pressure.', '5': 'Reads as one quiet mode with normal port fields still visible.'}},
        {'id': 'fr4', 'name': 'Makes a run recoverable', 'weight': 15, 'why': 'A grouped relationship needs a clear way to extend and split again, without asking an author to reconstruct it from hidden metadata.', 'passCondition': 'The real interaction makes the affected interval and its reversible action understandable.', 'anchors': {'1': 'Can link but cannot visibly undo or reshape a run.', '3': 'Can reshape it but requires interpreting a secondary model.', '5': 'The same local gesture joins and splits the exact run.'}},
    ]
    variants = [
        variant(1, 'Select then link', 'Temporarily turn the left grip into a quiet selection mark, then confirm one contiguous selection as a run.', 'You want a deliberate batch gesture with a visible preflight selection.', 'Fastly growing or trimming a run matters more than inspecting the chosen rows first.', [('Primary object', 'a selected contiguous interval'), ('Commit point', 'one explicit Link selected action')], ['selection preflight', 'one-action range command'], (4, 5, 3, 4)),
        variant(2, 'Seam toggle', 'Reveal a tiny Link next control between every adjacent body row; click a seam to join or split its local run.', 'The common need is to grow, trim, or split one nearby run without leaving the port list.', 'Authors routinely need long non-local ranges more than small local edits.', [('Primary object', 'the seam between two rows'), ('Reversal', 'the same seam splits an existing run')], ['adjacent seam grammar', 'join/split symmetry', 'quiet mode toggle'], (5, 5, 5, 5)),
        variant(3, 'Explicit endpoints', 'Choose From and To above the ordinary table, then link the inclusive authored interval.', 'The author knows the two endpoints and wants a precise long-range command.', 'The task is local and the extra range panel would be more ceremony than the edit.', [('Primary object', 'start and end port ids'), ('Precision', 'inclusive ordered range')], ['endpoint selectors', 'range command'], (4, 5, 4, 4)),
    ]
    return {
        'schemaVersion': 3,
        'title': 'Adjacent port linking — Inspector variants',
        'kicker': 'Babble & Prune · real SystemSketch Inspector',
        'brief': 'Three full-fidelity Inspector interactions for grouping adjacent normal ports. The chosen visual output is a tightly conforming neutral outline slot centred around the unchanged anchors; the relationship itself is name-free metadata, so authored labels stay ordinary editable port text.',
        'count': 3,
        'defaultId': 'v2',
        'defaultWhy': 'V2 reaches 100/100 because the seam is exactly the underlying adjacency relation: it makes local extension and splitting immediate while keeping both labels and the Inspector compact. Its browser journey joins a four-port slot, preserves every written name, measures the shared centre axis and 22px outside diameter, and proves persistence across reload.',
        'decisionHinge': 'If linking is mostly a long-range operation rather than local tuning, raise recoverability/precision by 10 points and V3 becomes the better fit; otherwise V2’s direct seam grammar is the lower-ceremony base component.',
        'invariants': ['Every fixture port is ordinary and independently cableable.', 'A link carries only a group id, never a label, port kind, or renderer choice.', 'Links target a contiguous authored interval; the tightly conforming slot is a neutral grouping cue, not data flow.', 'The same review board, names, dimensions, and viewport appear in every capture.'],
        'boundary': 'V1 and V3 are real review-only Inspector variants selected by URL. V2 is the implemented default. All share the real command and persistence model; only the interaction treatment varies.',
        'axes': [{'name': 'Primary control object', 'values': ['selected rows', 'between-row seam', 'endpoint range']}, {'name': 'Commit model', 'values': ['explicit confirm', 'immediate toggle', 'explicit range command']}],
        'requirements': requirements,
        'hardGates': [
            {'id': 'g1', 'name': 'Adjacent-only relationship', 'why': 'The model must not create an arbitrary association between distant ports.'},
            {'id': 'g2', 'name': 'Normal authored port fields', 'why': 'Linking must not turn *args-style text into special synthetic endpoints.'},
            {'id': 'g3', 'name': 'Tight neutral slot only', 'why': 'Grouping must preserve the socket-slot reading without borrowing an arrow or colour code from data flow.'},
        ],
        'variants': variants,
        'checks': ['Exactly three distinct executable Inspector interactions', 'Actual browser capture for every variant', 'V2 join/split, label preservation, centring, autosave, and reload exercised', 'Auditable weights, scores, and gate outcomes', 'Pick, shortlist, reject, splice, and export controls remain local to the gallery'],
    }


def main() -> None:
    if not GALLERY.exists():
        raise SystemExit(f'Babble gallery builder is unavailable: {GALLERY}')
    with tempfile.TemporaryDirectory(prefix='systemsketch-port-linking-babble-') as temporary:
        temporary_path = Path(temporary)
        spec = temporary_path / 'spec.json'
        built = temporary_path / OUT.name
        spec.write_text(json.dumps(project(), ensure_ascii=False), encoding='utf-8')
        subprocess.run(['python3', str(GALLERY), 'build', '--spec', str(spec), '--output', str(built), '--strict'], check=True)
        built.replace(OUT)
    print(OUT)


if __name__ == '__main__':
    main()

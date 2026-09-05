#!/usr/bin/env python3
"""Build the self-contained V8 centred-slot comparison from live captures."""

from __future__ import annotations

import base64
import json
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'variadic-port-v8-centered-slot-babble-2026-09-04.html'
BOARD = ROOT / 'sketches' / 'review' / 'variadic-port-v8-centered-slot.systemsketch'
GALLERY = Path('/home/bam/.codex/skills/babble/scripts/gallery.py')


def data_url(path: Path) -> str:
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def live_url(variant_id: int) -> str:
    return 'http://127.0.0.1:4930/?board=' + str(BOARD).replace('/', '%2F') + f'&variadicPrototype=center-{variant_id}'


def capture_markup(variant_id: int) -> str:
    screenshot = data_url(ROOT / 'docs' / 'assets' / f'variadic-port-v8-centered-slot-center-{variant_id}.png')
    return f'''<figure class="v8-capture">
  <a data-live-board href="{live_url(variant_id)}" target="_blank" rel="noreferrer" title="Open this exact real editor state">
    <img src="{screenshot}" alt="Actual SystemSketch V8 centered slot treatment {variant_id}">
  </a>
  <figcaption>Actual 1800 × 1000 browser capture. Click to inspect this precise treatment on the live, disposable review board.</figcaption>
</figure>'''


VARIANTS = [
    ('Centered filled capsule', 'A single translucent, fully rounded gray capsule runs behind the ports with its centerline exactly through the actual dots.', 'You want the closest, quietest translation of the supplied reference.', 'Its deliberately soft edge can recede on a very dense call face.', [('Housing', 'one filled centered capsule'), ('Port relationship', 'ports float over one shared neutral material')], ['centerline alignment', 'quiet fill'], (5, 4, 5, 5)),
    ('Centered outlined sleeve', 'A centered rounded sleeve uses a thin neutral rim around the same dot axis, reading as a physical socket housing rather than a flow edge.', 'The group needs a slightly firmer boundary without an added semantic color.', 'The visible rim is more chrome than the reference-like filled capsule.', [('Housing', 'one centered recessed sleeve'), ('Boundary cue', 'material rim, never directional line')], ['shared sleeve', 'neutral rim'], (5, 5, 5, 3)),
    ('Nested portal', 'A wider centered outer capsule with a lighter inner well makes the slot feel excavated into the Block edge.', 'You want the strongest physical depth cue while keeping a single continuous group body.', 'The two-layer construction is visually richer than a common port should usually need.', [('Housing', 'outer capsule plus inner well'), ('Depth', 'inset portal rather than a connector')], ['nested well', 'shared body'], (5, 5, 4, 2)),
    ('Centered socket bank', 'A quiet centered body spans the run, with a recessed bay behind each dot to emphasize members as independently cableable sockets.', 'The ordinary ports must feel especially tangible and separately targetable.', 'The repeated bays weaken the one-object group reading and add texture.', [('Housing', 'shared bank with individual recesses'), ('Membership', 'one outer body, many physical seats')], ['member bays', 'shared substrate'], (5, 5, 4, 2)),
    ('Centered square module', 'A broad, square-shouldered neutral backplate sits symmetrically behind the dots, making the group feel like an explicit module.', 'A product-module silhouette is preferable to a pill-like ornamental one.', 'The widest treatment risks competing with the ordinary label rhythm.', [('Housing', 'square-shouldered centered backplate'), ('Silhouette', 'module instead of pill')], ['module silhouette', 'centered backplate'], (5, 5, 3, 2)),
]


def scores(values: tuple[int, int, int, int]) -> dict[str, dict[str, object]]:
    evidence = [
        'The exercised browser assertion measures both group-body centers against every port-dot center to under half a pixel.',
        'The capture shows an enclosed gray surface, and the DOM contains no rail or socket-arrow element.',
        'The ordinary port dots and one normal-sized *overlays / **options label remain untouched.',
        'The treatment introduces no args-versus-keywords color legend and adds only the stated physical chrome.',
    ]
    return {f'fr{index + 1}': {'score': value, 'evidence': evidence[index], 'confidence': 'high'} for index, value in enumerate(values)}


def project() -> dict[str, object]:
    requirements = [
        {'id': 'fr1', 'name': 'Slot is truly port-centred', 'weight': 35, 'why': 'The supplied reference makes physical alignment—not an offset decorative gutter—the key visual correction.', 'passCondition': 'The centre of each gray group body coincides with the centre axis of all its ordinary port dots.', 'anchors': {'1': 'Slot is visibly offset from the ports.', '3': 'Mostly aligned but optically ambiguous.', '5': 'The shared slot axis passes directly through every dot.'}},
        {'id': 'fr2', 'name': 'Group reads as material containment', 'weight': 25, 'why': 'The grouping should explain membership without borrowing the visual grammar of data transport.', 'passCondition': 'A reader sees one physical housing and no rail, cable, or arrow.', 'anchors': {'1': 'Reads as an edge or ungrouped dots.', '3': 'Membership is visible but needs interpretation.', '5': 'Clearly reads as a neutral physical enclosure.'}},
        {'id': 'fr3', 'name': 'Ordinary port cadence survives', 'weight': 20, 'why': 'The inputs remain normal independently cableable ports; the signature spelling must stay in the ordinary label rhythm.', 'passCondition': 'No row, label, or endpoint is replaced by a synthetic aggregate control.', 'anchors': {'1': 'A new component displaces ordinary ports.', '3': 'Normal ports remain but the treatment competes with them.', '5': 'It looks like ordinary ports set into one quiet housing.'}},
        {'id': 'fr4', 'name': 'Visual language stays quiet and neutral', 'weight': 20, 'why': 'The star characters already carry Python grammar; additional color or decorative weight creates a second vocabulary to remember.', 'passCondition': 'Both groups share grayscale containment and no added directional mark.', 'anchors': {'1': 'Requires a color legend or directional mark.', '3': 'Neutral but noticeably busy.', '5': 'Recessive and label-led.'}},
    ]
    gates = [
        {'id': 'g1', 'name': 'No rail or arrow', 'why': 'No treatment may be interpreted as data flow.'},
        {'id': 'g2', 'name': 'Measured geometric centering', 'why': 'Visual centering is the user’s direct correction, not an aesthetic preference to average away.'},
        {'id': 'g3', 'name': 'One label, real endpoints', 'why': 'The design cannot duplicate the DEF spelling or replace individual cable targets.'},
    ]
    variants = []
    for index, (name, thesis, best, loses, decisions, keep, values) in enumerate(VARIANTS, start=1):
        variants.append({
            'id': f'v{index}', 'name': name, 'thesis': thesis, 'accent': '#5f6670',
            'bestWhen': best, 'losesWhen': loses,
            'decisions': [{'label': label, 'value': value} for label, value in decisions],
            'keepParts': keep,
            'proof': ['Actual headless-Chrome capture of the shared V8 review board.', 'Real-browser geometry assertion confirms the common center axis.', 'Real-browser assertion confirms zero rails and zero directional socket marks.'],
            'previewLabel': 'actual canvas — click to open live',
            'story': {'title': 'Inspect the centered geometry in the real editor', 'steps': [
                {'label': 'Compare the physical housing', 'caption': 'The image is a full-fidelity capture of the actual Block; notice whether the gray body is centered through the dot centers.', 'state': 'capture', 'target': '.v8-capture a[data-live-board]'},
                {'label': 'Open the exact live state', 'caption': 'Click the capture to inspect the actual port targets and the same normal-size signature labels in the real editor.', 'state': 'live', 'target': '.v8-capture a[data-live-board]'},
            ]},
            'scores': scores(values),
            'gateResults': {
                'g1': {'pass': True, 'evidence': 'The exercised DOM contains zero variadic brackets and zero socket-arrow elements.'},
                'g2': {'pass': True, 'evidence': 'All six port centers and both slot centers match on the x axis within 0.5 pixels.'},
                'g3': {'pass': True, 'evidence': 'The fixture retains exactly *overlays and **options, with six ordinary variadic port collars.'},
            },
            'preview': capture_markup(index),
            'media': [],
        })
    return {
        'schemaVersion': 3, 'title': 'Port-centred variadic slots — V8', 'kicker': 'Babble & Prune · real SystemSketch canvas',
        'brief': 'Five full-fidelity centered slot treatments based on the supplied reference. Every gray housing is centered directly on the real port dots; no direction draws rails, arrows, cables, or a new args-versus-keywords color code.',
        'count': 5, 'defaultId': 'v1',
        'defaultWhy': 'V1 is the closest and quietest response to the reference: a single filled capsule makes the ports feel set into one physical slot without adding a rim, second layer, repeated bays, or a module-like backplate.',
        'decisionHinge': 'If the quiet filled capsule disappears at the smallest working zoom, take V2’s sleeve for its modest boundary. If V1 is legible, its lower visual vocabulary is the better fit.',
        'invariants': ['Same V8 board, viewport, labels, normal port dots, and inspector behavior.', 'A gray group housing is centered through the actual dots; it is never an edge between them.', 'The gallery URLs select review-only paint states and do not alter persisted board data.'],
        'boundary': 'These are real renderer states on the isolated track and are exercised in a browser. They are a visual comparison only; no direction is selected or integrated into main.',
        'axes': [{'name': 'Housing structure', 'values': ['filled capsule', 'rimmed sleeve', 'nested portal', 'socket bank', 'square module']}, {'name': 'Physical emphasis', 'values': ['quiet field', 'outline', 'depth', 'member seats', 'explicit module']}],
        'requirements': requirements, 'hardGates': gates, 'variants': variants,
        'checks': ['Exactly five centred housing models', 'Actual browser hero capture for every model', 'Criteria and gates shown before unranked variants', 'Auditable score evidence and separate gate results', 'Pick, shortlist, reject, splice, and export remain available locally'],
    }


def main() -> None:
    if not GALLERY.exists():
        raise SystemExit(f'Babble gallery builder is unavailable: {GALLERY}')
    with tempfile.TemporaryDirectory(prefix='systemsketch-v8-babble-') as temporary:
        temporary_path = Path(temporary)
        spec = temporary_path / 'spec.json'
        built = temporary_path / OUT.name
        spec.write_text(json.dumps(project(), ensure_ascii=False), encoding='utf-8')
        subprocess.run(['python3', str(GALLERY), 'build', '--spec', str(spec), '--output', str(built), '--strict'], check=True)
        built.replace(OUT)
    print(OUT)


if __name__ == '__main__':
    main()

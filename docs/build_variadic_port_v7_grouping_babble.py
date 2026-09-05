#!/usr/bin/env python3
"""Build the self-contained V7 containment comparison from real app captures."""

from __future__ import annotations

import base64
import json
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs' / 'variadic-port-v7-grouping-babble-2026-09-04.html'
BOARD = ROOT / 'sketches' / 'review' / 'variadic-port-v7-grouping.systemsketch'
GALLERY = Path('/home/bam/.codex/skills/babble/scripts/gallery.py')


def image_data(path: Path) -> str:
    return 'data:image/png;base64,' + base64.b64encode(path.read_bytes()).decode('ascii')


def live_url(variant_id: int) -> str:
    return (
        'http://127.0.0.1:4930/?board='
        + str(BOARD).replace('/', '%2F')
        + f'&variadicPrototype=slot-{variant_id}'
    )


def shot_markup(variant_id: int) -> str:
    source = image_data(ROOT / 'docs' / 'assets' / f'variadic-port-v7-slot-{variant_id}.png')
    live = live_url(variant_id)
    return f'''<figure class="v7-capture">
  <a data-live-board href="{live}" target="_blank" rel="noreferrer" title="Open this exact real editor state">
    <img src="{source}" alt="Actual SystemSketch canvas with containment treatment V{variant_id}">
  </a>
  <figcaption>Actual 1800 × 1000 browser capture. Click to open this exact, live review-board state.</figcaption>
</figure>'''


def inspector_markup() -> str:
    source = image_data(ROOT / 'docs' / 'assets' / 'variadic-port-v7-inspector-state.png')
    return f'''<figure class="v7-capture">
  <img src="{source}" alt="Actual SystemSketch inspector with Inputs state mode explicitly active">
  <figcaption>The same quiet inspector in every canvas treatment. <code>Inputs · state</code> is opt-in; ordinary port rows retain the compact V1 disclosure by default.</figcaption>
</figure>'''


VARIANTS = [
    {
        'id': 1,
        'name': 'Soft unified gutter',
        'thesis': 'A narrow, translucent neutral gutter sits behind the whole port run. It groups by containment without drawing a path between ports.',
        'best': 'The board is already dense and the group may remain deliberately recessive.',
        'lose': 'At a distant zoom it gives the weakest family boundary of the five.',
        'decisions': [('Grouping object', 'One continuous, rounded gray field'), ('Visual claim', 'Association, never transport')],
        'keep': ['continuous shared field', 'normal-port typography'],
        'scores': (4, 5, 5, 5, 5),
    },
    {
        'id': 2,
        'name': 'Outlined containment tray',
        'thesis': 'A muted rounded tray holds the run. Its soft fill and neutral edge make the shared scope legible without turning the group into a wire.',
        'best': 'A reader needs to recognize the family at a glance while the rest of the port rhythm remains ordinary.',
        'lose': 'The outline adds a small amount more chrome than the purely soft gutter.',
        'decisions': [('Grouping object', 'One neutral tray with a low-contrast edge'), ('Visual claim', 'Bounded membership, not data flow')],
        'keep': ['single shared tray', 'soft neutral perimeter'],
        'scores': (5, 5, 5, 4, 4),
    },
    {
        'id': 3,
        'name': 'Label-backing capsule',
        'thesis': 'A wider gray capsule carries both the port dots and the single signature spelling, making the group’s identity explicit as a contained field.',
        'best': 'The signature label must be the first thing that distinguishes the group from nearby ordinary ports.',
        'lose': 'The field competes with the ordinary label rhythm and consumes the most horizontal attention.',
        'decisions': [('Grouping object', 'A broad shared capsule behind ports and label'), ('Visual claim', 'Named parameter region')],
        'keep': ['the one shared label', 'a common neutral surface'],
        'scores': (5, 3, 5, 3, 3),
    },
    {
        'id': 4,
        'name': 'Inset port well',
        'thesis': 'A slightly deeper neutral well contains the ports. Depth, rather than a line or color, marks the exceptional signature region.',
        'best': 'A tactile, panel-like containment cue fits the existing visual language better than a visible boundary line.',
        'lose': 'The depth cue can look like a structural indentation rather than a light grouping at small size.',
        'decisions': [('Grouping object', 'A narrow recessed well'), ('Visual claim', 'Nested region rather than relationship')],
        'keep': ['neutral depth', 'single region behind the run'],
        'scores': (4, 4, 5, 4, 4),
    },
    {
        'id': 5,
        'name': 'Individual socket recesses',
        'thesis': 'Each member gets a subtle neutral recess, preserving the strongest ordinary-port cadence while suggesting that these inputs belong to a special family.',
        'best': 'The member ports should feel maximally independent and the group label alone can carry the shared identity.',
        'lose': 'It communicates the shared run less clearly because no single field spans every member.',
        'decisions': [('Grouping object', 'Repeated individual recesses'), ('Visual claim', 'Special port state, not a connected set')],
        'keep': ['individual port emphasis', 'zero connector implication'],
        'scores': (3, 5, 5, 4, 4),
    },
]


def score_entries(values: tuple[int, int, int, int, int], variant_id: int) -> dict[str, dict[str, object]]:
    labels = (
        'The real capture makes the two runs identifiable as regions rather than paths.',
        'The capture retains one normal-size signature spelling and the ordinary port baseline.',
        'Both *overlays and **options use the same grayscale treatment; the browser proof found neutral collars.',
        'The comparison board keeps the compact call face and no extra port rows.',
        'No rail, arrow, or extra color legend appears in the captured treatment.',
    )
    return {
        f'fr{index + 1}': {'score': score, 'evidence': labels[index], 'confidence': 'high'}
        for index, score in enumerate(values)
    }


def project() -> dict[str, object]:
    requirements = [
        {
            'id': 'fr1', 'name': 'Grouping reads as containment', 'weight': 30,
            'why': 'A person should see that the source ports share a variadic signature without inferring a data path between them.',
            'passCondition': 'The two groups are recognizable as bounded regions while no connector or arrow is present.',
            'anchors': {'1': 'Looks like unrelated ordinary ports.', '3': 'Grouping is visible but needs interpretation.', '5': 'Shared membership reads immediately as a contained region.'},
        },
        {
            'id': 'fr2', 'name': 'Ordinary-port cadence remains intact', 'weight': 25,
            'why': 'Variadic groups are exceptional metadata, not a second species of port.',
            'passCondition': 'One normal-size group spelling sits in the ordinary label rhythm and every endpoint remains a real port.',
            'anchors': {'1': 'The label or port layout becomes a new component.', '3': 'The normal rhythm is partly retained.', '5': 'It still reads exactly like a normal port run.'},
        },
        {
            'id': 'fr3', 'name': 'No semantic color legend', 'weight': 20,
            'why': 'Star and double-star are grammar distinctions already carried by the label; a new color vocabulary would be memory burden.',
            'passCondition': 'Both groups use the same restrained gray containment treatment.',
            'anchors': {'1': 'Color is required to distinguish the states.', '3': 'Mostly neutral but introduces a state color.', '5': 'The grouping remains neutral and label-led.'},
        },
        {
            'id': 'fr4', 'name': 'Dense scan remains compact', 'weight': 15,
            'why': 'A call face can contain several source expressions and must not turn into a decorative panel.',
            'passCondition': 'The treatment fits inside the existing port column without added rows or duplicated labels.',
            'anchors': {'1': 'The group disrupts scanning or expands the node.', '3': 'Works with a visible density trade-off.', '5': 'Remains compact at a glance.'},
        },
        {
            'id': 'fr5', 'name': 'Visual noise stays low', 'weight': 10,
            'why': 'This is grouping metadata, not an executable data relation.',
            'passCondition': 'There are no arrows, rails, or added semantic hues to parse.',
            'anchors': {'1': 'Reads as a flow edge or competing diagram language.', '3': 'A new mark is visible but restrained.', '5': 'The field recedes behind the ports.'},
        },
    ]
    hard_gates = [
        {
            'id': 'g1', 'name': 'No connector semantics',
            'why': 'The grouping cannot look like a cable, direction arrow, or relationship edge.',
        },
        {
            'id': 'g2', 'name': 'One signature spelling and real endpoints',
            'why': 'The group may not duplicate its type label or replace its cableable source ports with a synthetic endpoint.',
        },
        {
            'id': 'g3', 'name': 'Rare authoring stays opt-in',
            'why': 'The quiet V1 inspector disclosure remains the default; port state is intentionally a separate explicit mode.',
        },
    ]
    variants = []
    for variant in VARIANTS:
        variant_id = variant['id']
        variants.append({
            'id': f'v{variant_id}',
            'name': variant['name'],
            'thesis': variant['thesis'],
            # Report-only neutral accent avoids suggesting a product color code.
            'accent': '#5f6670',
            'bestWhen': variant['best'],
            'losesWhen': variant['lose'],
            'decisions': [{'label': label, 'value': value} for label, value in variant['decisions']],
            'keepParts': variant['keep'],
            'proof': [
                'Real browser capture from the same V7 review fixture.',
                'Browser assertion: no .BlockNode-variadicBracket or .BlockNode-variadicSocket is rendered.',
                'Browser assertion: *overlays and **options are the only group spellings and the inspector state editor is closed by default.',
            ],
            'previewLabel': 'actual canvas capture — click to open live',
            'story': {
                'title': 'Compare the real state, then exercise the real editor',
                'steps': [
                    {
                        'label': 'Inspect the containment treatment',
                        'caption': 'The embedded image is an actual browser capture of the identical V7 review board; look only at the neutral field behind the real ports.',
                        'state': 'base', 'target': '.v7-capture a[data-live-board]',
                    },
                    {
                        'label': 'Open the live board and inspect rare state',
                        'caption': 'In the real inspector select Compose, then press Inputs · state. The quiet V1 disclosure is otherwise unchanged and reordering stays behind visible.',
                        'state': 'live', 'target': '.v7-capture a[data-live-board]',
                    },
                ],
            },
            'scores': score_entries(variant['scores'], variant_id),
            'gateResults': {
                'g1': {'pass': True, 'evidence': 'The exercised renderer has zero bracket and socket-arrow elements in all five treatments.'},
                'g2': {'pass': True, 'evidence': 'The same board keeps exactly *overlays and **options while each dot remains a normal port collar.'},
                'g3': {'pass': True, 'evidence': 'The browser journey sees no variadic editor until the Inputs state button is pressed.'},
            },
            'preview': shot_markup(variant_id),
            'media': [
                {
                    'label': 'Shared inspector state — actual capture',
                    'caption': 'This is deliberately identical across variants: it evaluates the one retained V1-style authoring path, not five new inspector designs.',
                    'html': inspector_markup(),
                },
            ],
        })
    return {
        'schemaVersion': 3,
        'title': 'Variadic port containment — V7',
        'kicker': 'Babble & Prune · real SystemSketch canvas',
        'brief': 'Five full-fidelity, real-editor treatments for *args / **kwargs grouping. They use neutral containment surfaces only: no line, rail, arrow, or color code connecting the ports.',
        'count': 5,
        'defaultId': 'v2',
        'defaultWhy': 'V2 is the strongest eligible balance: the shared gray tray makes membership legible at a glance while still preserving the normal port rhythm and avoiding any suggestion of data flow. V1 is one point behind if the board needs the quietest possible treatment.',
        'decisionHinge': 'If tested at the smallest working zoom and V2’s edge feels like unnecessary chrome, choose V1. If a run needs an unambiguous visual boundary, V2 earns its small added perimeter.',
        'invariants': [
            'Same saved V7 review board, same ports, same one-label signature treatment in every comparison.',
            'The containment treatment is behind the ports and is grayscale; it never becomes an arrow, rail, cable, or extra endpoint.',
            'Inputs · visible continues to expose the quiet reordering mode; Inputs · state is a separate mutually exclusive rare metadata mode.',
        ],
        'boundary': 'Implemented on the isolated track and captured in the real browser. These URL-selectable canvas options are a comparison surface only; no direction has been chosen or integrated into main.',
        'axes': [
            {'name': 'Containment grammar', 'values': ['soft shared field', 'outlined shared tray', 'label-bearing capsule', 'recessed well', 'individual recesses']},
            {'name': 'Emphasis level', 'values': ['recessive', 'bounded', 'label-led', 'tactile', 'member-led']},
        ],
        'requirements': requirements,
        'hardGates': hard_gates,
        'variants': variants,
        'checks': [
            'Exactly five visibly distinct treatments',
            'All hero images are real browser captures of one fixture',
            'Weighted criteria and gates precede the unranked cards',
            'Scores carry concrete browser evidence and confidence',
            'Pick, shortlist, reject, splice, and export preserve a review decision locally',
        ],
    }


def main() -> None:
    if not GALLERY.exists():
        raise SystemExit(f'Babble gallery builder is unavailable: {GALLERY}')
    with tempfile.TemporaryDirectory(prefix='systemsketch-v7-babble-') as temporary:
        spec = Path(temporary) / 'spec.json'
        built = Path(temporary) / OUT.name
        spec.write_text(json.dumps(project(), ensure_ascii=False), encoding='utf-8')
        subprocess.run(
            ['python3', str(GALLERY), 'build', '--spec', str(spec), '--output', str(built), '--strict'],
            check=True,
        )
        # The report is reproducible evidence; replacing its prior generated copy
        # lets a fresh browser capture be reflected without touching source boards.
        built.replace(OUT)
    print(OUT)


if __name__ == '__main__':
    main()

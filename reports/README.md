# `reports/` — durable review pages

`reports/<feature>-<date>.html` is the lightweight, committed account of a completed
piece of work. It is opened through the retained review runtime, not as a `file://` page.
That means its ordinary relative media links work, while the report itself remains useful
to read in GitHub and survives deletion of the implementation worktree.

```
reports/
├── <feature>-<date>.html       tracked: prose, CSS, small diagrams
└── media/
    └── <review-name>/          ignored: PNGs, MP4s, GIFs, raw capture evidence
```

## Authoring a review

Build report HTML to `reports/<feature>-<date>.html`. Put substantial visual evidence
under `reports/media/<review-name>/` and use normal relative references such as
`media/<review-name>/hero.mp4` from the page. Do not inline a capture as a data URI:
`tests/test_report_weight.py` guards the tracked side of the boundary.

The initial verified publish retains both sides together:

```bash
python3 /home/bam/systemsketch/scripts/review_runtime.py up <review-name> --ref HEAD --board sketches/review/<feature>.systemsketch --report reports/<feature>-<date>.html --report-media reports/media/<review-name> --report-builder docs/build_<feature>.py
```

The runtime copies the ignored media into its pinned worktree before it starts Vite. From
then on the concise handoff command needs only the review name and committed ref; it can
restart after an agent track or ordinary dev server is gone. The optional builder reruns in
that pinned tree with `SYSTEMSKETCH_REPORT_OUTPUT` and `SYSTEMSKETCH_REPORT_MEDIA_DIR` set.
Use those environment values rather than a hard-coded checkout path when adding a new
builder.

Never add `reports/media/` to Git. It is a retained local review cache, not source history.

## Current explorations

- [Five ways to hand off a mixed review](review-artifact-handoff-babble-2026-09-07.html) — a runnable five-artifact comparison of flat, grouped, version-paired, action-first, and timeline review cards.
- [tldraw styling lab — the plan](tldraw-styling-lab-plan-2026-09-07.html) — stock tldraw plus one Figma-shaped inspector on Base UI + shadcn: reference choice (open-pencil's grammar), the stack cell by cell, a measured Tailwind-vs-tldraw pixel probe, five milestones with gates, and the decision surface.

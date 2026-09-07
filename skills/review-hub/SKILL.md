---
name: review-hub
description: Hand finished SystemSketch work to a human with one concise retained-review relaunch command. Use when work has a report, board, or runnable surface that must remain reviewable after the agent's shell ends.
---

# Retained review handoff

The deliverable is proof plus one reliable way to reopen it. The retained review runtime
owns that surface: one pinned worktree, one Vite server, one command that serves the app,
review board, report, and report media together. Do not give separate `file://` report
links, a Markdown “Open it” table, long board URLs, or a list of stop instructions.

## Prepare the evidence

- Commit the review board, report page, and optional report builder. The report page lives
  in `reports/<feature>-<date>.html`; it is the small durable account that stays in Git.
- Put captures, hero video, GIF fallback, and other heavy evidence in the ignored
  `reports/media/<review-name>/` directory. Link to them relatively from the report, for
  example `media/<review-name>/hero.mp4`. Never inline capture payloads in the tracked
  HTML; `tests/test_report_weight.py` enforces this boundary.
- On the first publish, run the runtime from the implementation checkout with the complete
  manifest. It copies ignored media into the review's pinned worktree before starting Vite:

```bash
python3 /home/bam/systemsketch/scripts/review_runtime.py up <review-name> --ref HEAD --board sketches/review/<feature>.systemsketch --report reports/<feature>-<date>.html --report-media reports/media/<review-name> --report-builder docs/build_<feature>.py
```

  `--report-builder` is optional. When used, it runs in the pinned checkout with
  `SYSTEMSKETCH_REPORT_OUTPUT` and `SYSTEMSKETCH_REPORT_MEDIA_DIR` set, so the page is
  rebuilt immediately before it is served. A builder must honor those values rather than
  write to a developer-specific absolute path.
- Drive the retained review once. Verify the report loads its relative captures and the app
  opens the intended board. The runtime prints a compact review card with clickable **Board**
  and **Report** labels, not raw URLs. A later `up` on an
  already-healthy review intentionally leaves it untouched; a cold restart reuses the
  media retained in its own review worktree even after the original track is gone.

## The final handoff

End the final response with exactly a level-two review heading followed by one one-line
`bash` fence. The heading identifies the feature; the command relaunches the immutable
commit and prints clickable report and board labels. There is no introductory “Open it” section,
no table, no raw URL, and no stop command in the response.

````markdown
## Review · <feature>

```bash
python3 /home/bam/systemsketch/scripts/review_runtime.py up <review-name> --ref <committed-sha>
```
````

The command must use the absolute script path, be one physical line, and be safe to run
repeatedly. Do not pre-launch a new review merely for handoff; first publication and
verification are implementation work, while the user-owned command is the durable opening
gesture. `down` and `remove` are deliberately absent from the final response because their
buttons would make a destructive action too easy to press.

## Why this is one surface

A browser-served report has a real URL base, so `media/<name>/…` resolves normally. The
old `file://` preview rewrote HTML into a non-hierarchical `data:` URL, forcing every
capture into a base64 blob and permanently inflating Git history. The retained runtime
separates the durable source page from regenerated/raw evidence without leaving a report
stranded in a disposable worktree. Its own pinned copy is the retention boundary: remove
the named review explicitly only when its local visual evidence is no longer needed.

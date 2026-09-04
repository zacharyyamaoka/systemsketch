# Work order · finish the History-panel round (3 parallel variants)

For a fresh agent picking this up mid-flight. The prior session ran out of
context right after dispatching three background builder agents; those agent
processes died with the session (a harness restart, not a crash in the work
itself — this has happened repeatedly in this project and never destroys
committed git work or a running dev server). **All three worktrees have real,
substantial, uncommitted work already sitting in them right now.** Your job is
to inspect what each one actually built, finish/verify it, and get it
committed — not to start over.

## Where this sits in the larger project

This is one round in a long-running "git diff for blocks" effort: a visual
diff system for SystemSketch backed by a real diff engine in the sibling repo
`/home/bam/pyblocks`. Prior rounds converged on a working Compare dialog
(`track/diff-ui-converged-persistent-bar`, commit `cb5f93e` — "Group the diff
by element, and move the controls where the hand already goes"). That commit
is the shared ancestor all three worktrees below forked from, and everything
it contains is **already verified and must not regress**: drop-shadow cable
selection marks, element-first grouping with two switchable table layouts
(`By element` / `Flat table`), a compact `.block-inspector__tabs` fix applied
app-wide, blue "Modified" (not orange), a git-highlighting toggle, and a
bottom fullscreen bar.

Full architectural background (identity ladder, one-engine-two-profiles, the
Group schema, the contract) lives in:
- [`/home/bam/pyblocks/docs/block-diff-contract.md`](file:///home/bam/pyblocks/docs/block-diff-contract.md)
- [`/home/bam/pyblocks/docs/block-diff-serving-work-order.md`](file:///home/bam/pyblocks/docs/block-diff-serving-work-order.md) — **a separate, not-yet-started** piece of work (wiring the real Python diff engine live into a UI). Not your job unless Zach explicitly asks for it next.
- Obsidian vault: `Sources/Notes/PROJECT - System Sketch.md` (§ Version Control) and `Projects/pyblocks/PROJECT - pyblocks.md` (§ Diffs on block view) carry the full narrative history if you need more context than fits here.

## What Zach actually asked for (verbatim, this round)

> "What you have now is looking much better. Before finalizing, can you please
> do 3 variants of this area (the properties/code view) and also the history
> area... Can you please also have a small button perhaps where I can move the
> code/property area to be on the bottom of the screen like it's in Figma
> instead of on the right hand side — I am not sure what is best but it will
> be nice to be able to switch between the two... Also please come up with 5
> proposals about where you can properly put the compare button. Right now it
> just floats in the middle of the screen... For a more mature history panel I
> think we can copy what Figma has already done here [dark-mode list: avatar +
> short title + relative timestamp, e.g. 'Button colour updates · Mitch · 7
> minutes ago', selected entry highlighted] — perhaps accounting though maybe
> for richer descriptions? I think we should use the same design language for
> that history panel for the entire board that we show on the history panel
> for just individual elements that if you click, you can see in the right
> side panel inspector [pasted an IcePanel screenshot: per-node 'Details /
> Connections / History' tabs, rows like 'Updated App tags to Private cloud ·
> Zach · 7 days ago at 23:09'] — actually, I don't think that design IcePanel
> has is very nice at all. All I'm saying is whatever you implement for the
> history panel in the modal, let's please use potentially a similar, or
> perhaps more compacted, design in also the history panel you see on the
> per-element [inspector] — just so there's a bit of unity and you only have
> to understand the interaction pattern once. Here's also an example from
> Onshape [pasted Onshape's own 'Versions and history' panel: a coloured
> branching timeline rail, full names, 'Merge from Rook · Robert Anselmi',
> 'Show changes...' expandable disclosure] ... I think if you look at the
> prior [art], there's really just a basic thing you need to be able to show:
> the time it was made, a short title about what the change was, potentially
> an optional more detailed description, and potentially a user who made it.
> Those seem like the main things."

I read the "OmniCheck"-labelled screenshot as almost certainly Onshape's own
panel (chess-piece part names, named engineers, "Merge from", the disclosure
pattern are unmistakably Onshape) — **I never got explicit confirmation of
that from Zach before running out of context.** Say this plainly if you talk
to him: worth a one-line check ("you called it OmniCheck, I built it as
Onshape's Versions panel — right reading?") rather than silently assuming.

## The three worktrees — dispatched, and what's actually in them right now

All three were forked from `track/diff-ui-converged-persistent-bar` @
`cb5f93e` via `scripts/new_track.py`. Each got an independent brief to build
the **same shared requirements** (below) along a **different visual axis** for
the history list. **Do not try to resume the original background agent IDs —
they belonged to a Claude Code session that no longer exists.** Treat each
worktree as a normal in-progress branch: read the diff, run it, finish it.

| worktree | branch | dev port | API port | axis |
|---|---|---|---|---|
| `/home/bam/systemsketch-track-diff-ui-history-figma` | `track/diff-ui-history-figma` | 5080 | 5081 | Figma's own list: avatar + title + relative timestamp, selected-row tint |
| `/home/bam/systemsketch-track-diff-ui-history-onshape` | `track/diff-ui-history-onshape` | 5130 | 5131 | Onshape's own list: coloured branching rail, full names, "Show changes..." disclosure |
| `/home/bam/systemsketch-track-diff-ui-history-compact` | `track/diff-ui-history-compact` | 5100 | 5101 | Zach's own "perhaps more compacted" idea: no avatar, no rail, dense single-line rows, author/description hidden until hover/click |

**As of this work order, all three dev servers (`vite`) and API servers
(`python3 scripts/server.py`) are still running** — the agent processes died,
but the servers they launched via `nohup .../serve.sh & disown` did not. You
can open all three URLs right now:
- `http://localhost:5080`
- `http://localhost:5130`
- `http://localhost:5100`

Before touching anything, re-run `ss -ltnp | grep -E ':(5080|5081|5100|5101|5130|5131) '` yourself — if a port is no longer listening, restart that
one worktree's `./serve.sh` (nohup + disown so it survives you exiting), don't
assume the table above is still accurate by the time you read it.

### What each worktree actually contains (verified by reading git status/diff, not the agents' own claims)

All three have a genuinely new `src/history/` module (not a stub — real
`historyModel.ts`, `HistoryList.tsx`, `history.css`, and a `historyModel.test.ts`
in every one), plus real diffs to `src/blocks/ui/BlockInspector.tsx` (adding
the new History tab) and `src/compare/CompareDialog.tsx` (restyling the
board-level History rail). All of this is **uncommitted** — nothing has been
staged or committed on any of the three branches beyond the inherited
`cb5f93e`.

- **`diff-ui-history-figma`** is the furthest along: `src/history/` has 7
  files including a dedicated `ElementHistoryPanel.tsx` and `boardHistory.ts`
  (13.6 KB — the biggest of the three, worth reading first). It already has
  **5 real screenshots** captured under `docs/assets/history-figma-*.png`
  (`board-rail`, `dock-bottom-code`, `dock-bottom`, `element-tab`,
  `trigger-in-shell`) and a dedicated smoke test
  `tests/compare_history_figma_smoke.mjs`. This one may be close to done —
  verify it first and it may set the pattern for finishing the other two.
  Also modified: `sketches/review/diff-review-modal.systemsketch`,
  `src/App.tsx`, `src/chrome/SystemSketchChrome.tsx`,
  `src/compare/CompareLauncher.tsx`, `src/compare/compare.css`,
  `src/compare/index.ts`, `src/workspace/LocalWorkspace.tsx`,
  `tests/compare_modal_smoke.mjs`.
- **`diff-ui-history-onshape`** has `src/history/` with 8 files, including a
  `HistoryFootnote.tsx` not present in the other two (likely the "Show
  changes..." disclosure footer). No screenshots captured yet under
  `docs/assets/`. Has its own smoke test, `tests/history_onshape_smoke.mjs`
  (note: differently named than the figma one's `compare_history_*` pattern —
  check both actually run under `npm run check` or whatever your journey
  runner needs). **`src/compare/compareSource.ts` shows as deleted (`D`)** in
  git status — this needs specific attention: read the diff to understand
  whether it was intentionally replaced by something in `src/history/`, or
  whether this is a bug/incomplete refactor. Do not assume either way.
- **`diff-ui-history-compact`** has `src/history/` with a
  `BoardHistoryProvider.tsx` not present in the other two, but is the least
  outwardly finished signal: no `docs/assets/` screenshots, no dedicated
  smoke-test file showing in `git status` (it may have modified an existing
  test file instead of adding a new one — check `tests/compare_modal_smoke.mjs`'s
  diff). `src/compare/compareSource.ts` is modified here (not deleted, unlike
  onshape) — worth diffing against the onshape worktree's version once you
  understand what changed, since they started from the same ancestor and
  diverged.

## The shared requirements every one of the three must satisfy

(From the original dispatch brief — verify each worktree actually did all of
these, don't assume partial completion means the rest follows.)

1. **One history-list component, used in two places, not two implementations.**
   (a) The board-level History rail inside `CompareDialog.tsx` (restyled to
   the worktree's axis). (b) A **new** `History` tab on the ordinary,
   everyday Block inspector (`BlockInspector.tsx`) — alongside its existing
   `Details`/`Notes` tabs, using the already-fixed compact
   `.block-inspector__tabs` pattern, showing that one element's own history in
   the *same* visual language as (a). If real per-element history data
   doesn't exist (see below — it almost certainly doesn't), the UI should
   still be built against the same data shape, honestly showing something
   like "current state, no prior history recorded" rather than fabricated
   entries.

2. **Every history row must be able to carry: timestamp, short title, an
   optional/expandable longer description, and an author** — this is Zach's
   own explicit field list. Check `src/history/historyModel.ts` in each
   worktree for the type definition and confirm all four fields exist on it,
   and that real values populate whatever fields this app can actually supply
   truthfully (see the "ground truth on real data" section below — this is
   the single most important thing to get right, and the most likely place an
   agent guessed rather than verified).

3. **A button toggling the Properties/Code panel between right-side and
   bottom placement, Figma-style.** Small, findable, not intrusive. State
   (selected row, active tab, other UI toggles) must survive switching back
   and forth — same discipline as the existing fullscreen-mode state
   preservation.

4. **The Compare-changes entry button gets a deliberate position** (it
   currently floats center-screen, which Zach explicitly disliked), plus each
   worktree's agent was asked to *describe* (not necessarily build) two more
   candidate positions with one-sentence tradeoffs each, contributing toward
   Zach's ask for "5 proposals" across all three variants combined. Check each
   agent's intended final report/commit message for whether it left these
   written down anywhere (commit message, a code comment, or nothing — if
   nothing, you'll need to look at what each worktree actually built for the
   button and describe the alternatives yourself when you report back).

## Ground truth on real history/version/author data — verify, don't trust

Before you (or the agents) can honestly claim these history rows show real
data, confirm what actually exists. Partial scout research already ran inside
each worktree (visible in this session's transcript, not repeated here) —
re-verify it yourself rather than trusting it secondhand:

- Check `src/compare/compareSource.ts` (per-worktree, since onshape deleted
  it and compact modified it) and `src/workspace/` (`workspaceClient.ts`,
  `workspaceModel.ts`, `systemSketchFile.ts`) for whether the app persists any
  list of prior board versions, or only ever holds the current file.
- Grep for `author`, `user`, `whoami` across `src/` and any Python host code —
  confirm whether this app has ANY user-identity concept at all (tldraw
  itself has `editor.user.getName()` — check whether SystemSketch sets it or
  leaves tldraw's own default in place).
- Check whether real file mtimes are available via whatever API endpoint
  lists board files, as the only truthful timestamp source if there's no
  explicit `savedAt` field.
- **If real author/title/description data does not exist** (this is the
  expected finding — flag it plainly rather than let fabricated names like
  "Robert Anselmi" or invented commit messages slip into a merged UI), each
  worktree's UI must degrade honestly: a real timestamp (from mtime or a save
  event) plus a generic truthful title ("Saved") and no invented author,
  rather than fictional demo data dressed up to look real.

## Environment — read before touching anything

- **Several other sessions and agents edit this repo concurrently, live,
  right now** — this has been true throughout the project. `ls
  --time-style=full-iso <file>` before rewriting anything; if it moved in the
  last few minutes, it's someone else's in-flight work. Prefer surgical,
  exact-match edits over whole-file rewrites.
- **Never `git add -A`.** Stage explicit paths per worktree. Read `git diff
  --cached --name-only` before every commit.
- **Do not merge to `main`. Do not push. Do not merge these track branches
  into each other or into `track/diff-ui-converged-persistent-bar`.** Zach
  reviews and picks a direction before any of that happens — commit each
  worktree's finished work to its own track branch only.
- Never touch Zach's Stable (4321) / Preview (4322) / API (4323). Never point
  any test, fixture, or generator at `~/SystemSketch/` — use
  `sketches/review/diff-review-modal.systemsketch` (already present, inherited
  from `cb5f93e`) or a scratch board.
- `node_modules` is already symlinked into each worktree (from
  `scripts/new_track.py`) — no `npm install` needed.
- Headless browser only for any journey/screenshot work — never front a
  window or steal focus. A pre-tool-use hook rejects any Bash command
  containing the browser's literal name; use `/usr/bin/google-chrome`
  directly, or grep process lists for `--type=gpu-process` instead of the
  name.
- Don't kill a server you didn't start yourself — check `ss -ltnp` before
  assuming a port is free, and don't tear down the three ports above unless
  you're intentionally restarting that worktree's own `serve.sh`.

## Proof required, per worktree, before you call any of the three done

- `npm run check` green (tsc + vitest + the Python tests) in that worktree.
- A real CDP browser journey exercising: the board-level History panel in its
  new visual language, opening a Block's inspector and seeing its new History
  tab in the same language, toggling Properties/Code between right-side and
  bottom placement with state surviving the switch, and the chosen
  Compare-button position. (`diff-ui-history-figma` already has
  `tests/compare_history_figma_smoke.mjs` and 5 real screenshots — read that
  file first as the likely template for what the other two still need.)
- Screenshots of the real running app, actually opened and inspected with
  vision by you — not assumed from reading the component code. At minimum:
  both history panels side by side (board-level and per-element) to prove
  visual unity, the bottom-docked Properties/Code placement, and the Compare
  button in its new position. Onshape's variant additionally needs a
  screenshot of an expanded "Show changes..." disclosure row.
- A real commit per worktree, on that worktree's own track branch, with an
  honest message (what was built, what was left, what the ground-truth
  finding on real history data was).

## Report back to Zach with

- Three working URLs (or updated ones if you had to restart a server).
- Per worktree: what's done, what's the honest state of real vs. placeholder
  history data, and screenshots he can look at without opening a browser
  himself (attach or describe what you captured).
- The `compareSource.ts` divergence between the onshape (deleted) and compact
  (modified) worktrees — explain what actually happened there, since it's the
  one structural inconsistency between otherwise-parallel builds.
- Confirmation (or correction) of the "OmniCheck = Onshape's own Versions
  panel" reading — ask him directly if you can't resolve it from the pasted
  reference alone.
- The full set of Compare-button position candidates across all three
  worktrees, converged into the "5 proposals" he asked for.
- Whether a vault note update is still owed for this round (check
  `Sources/Notes/PROJECT - System Sketch.md` § Version Control for whether the
  last entry already covers this round or predates it).

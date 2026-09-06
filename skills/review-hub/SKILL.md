---
name: review-hub
description: Publish durable, versioned reports and optional launchable previews to a local Review Hub. Use when an agent begins, updates, blocks, or finishes a task that should remain reviewable after its server or chat session ends; do not use for ordinary transient development output.
---

# Review Hub

Use Review Hub as the durable human-facing record for a reviewable work item. It owns
the work item's Kanban status, immutable report revisions, and optional on-demand
preview recipes. It does **not** turn a temporary agent server into a deliverable.

## First check whether the Hub is available

The Hub may not be installed or running yet. Discover its installed CLI/help before
attempting any mutation; use its actual accepted commands rather than inventing
flags. If it is unavailable or rejects a record:

- still create and hand off the self-contained report in the project;
- do not claim that the report, revision, URI, or preview was published; and
- state the exact local failure concisely so the user can install or repair the Hub.

Read [the Review Hub contract](references/contract.md) before registering a report,
status, revision, or preview. It defines the durable concepts that a conforming CLI
or API must preserve even if its command spelling differs.

## Publish the right thing

1. Keep one stable work-item identity for one ongoing user objective. Obtain its ID
   from the Hub when creating it; reuse it for later iterations.
2. Update the work status at meaningful transitions:
   `working` when implementation actually starts, `needs-user` when a concrete
   decision or external condition blocks progress, and `ready-for-review` only once
   the static review result is published. Treat `done` and `archived` as
   user-owned unless the user explicitly delegates them.
3. Produce a self-contained HTML report first. It must remain useful without a
   server, task shell, or Internet connection. Give it a clear snapshot timestamp,
   provenance, and an honest boundary between observed behavior and simulated or
   unavailable behavior.
4. Publish every material update as a new immutable revision. Never overwrite a
   previous report, launch manifest, capture, or result note. Move the item's
   `current` pointer only after the new revision was accepted.
5. Register a preview only when exercising the real interaction adds value beyond
   the report. Pin source and launch information, provide a health check, and make
   the preview's static report fallback explicit. The Hub launches it on demand;
   never hand the user a raw task-owned port as the only review link.

## Preserve the two independent states

Work status answers *what the user needs to do*; preview runtime answers *whether an
optional server happens to be running*. Never encode one in the other. For example,
an item can be `ready-for-review` with its preview `stopped`, or `needs-user` while
an earlier preview remains `running` for comparison.

The Hub, not the agent, owns runtime transitions such as `stopped`, `starting`,
`running`, and `failed`. An agent may register or update a manifest but must not
guess a runtime result.

## Handle history deliberately

- Link an update to its parent revision. The current revision is a convenience
  pointer, not a destructive replacement.
- Use a named variant lane only for genuinely competing directions. Do not create a
  variant merely because a normal iteration changed a report.
- A historical preview must restore from its own source pin into an isolated or
  detached workspace. The Hub chooses a fresh port at launch time; a recorded port
  is never a stable review address.
- Mark a historical launch as `reproducible`, `best-effort`, or `report-only`.
  Missing secrets, hardware, or dependencies must make the limitation visible, not
  silently substitute a broken URL.

## Safety and handoff

- Never put secrets, tokens, private environment values, or arbitrary shell text in
  an HTML `review-hub://` link. A deep link identifies a Hub record; the Hub shows
  and validates the saved launch recipe before it runs anything new or changed.
- Do not stop another agent's process or reuse its port. Let the Hub allocate and
  manage preview processes.
- In a final handoff, give the durable report/revision link and, when registered,
  the Hub's launch link. State the work status, preview state, and whether the
  preview was actually exercised.

## Agent-facing outcome

The desired user experience is: open the report immediately; inspect the current
card and its history at any time; click **Launch preview** only when live behavior
is useful; and reopen any old revision without depending on the original agent
session.

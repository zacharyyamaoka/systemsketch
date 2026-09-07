> [!warning] RETIRED 2026-09-07 — historical record only.
> The local Review Hub described below was built, verified, and then retired the same day:
> *"This is better so I don't have an app I need to maintain."* Nothing should conform to
> this contract any more. The live rule is [the skill](../SKILL.md): one retained runtime
> command serving a committed lightweight report, its retained ignored media, and any board.
>
> Kept because the distinction it drew is still worth reading — **work status is what a
> human must do; preview runtime is whether a server happens to run** — and because
> collapsing the two is the mistake the replacement also has to avoid.

# Review Hub contract

This is the provider-neutral contract for a local Review Hub. It is a behavioral
contract, not a promise that an uninstalled CLI accepts the examples verbatim.
Agents must inspect the installed command/API before publishing.

## Stable work item and immutable revision

A **work item** is the stable identity for one user-facing objective. It has a
Kanban status, an optional current revision, and one or more revision lanes.

A **revision** is append-only. It contains a self-contained report imported into
the Hub's durable store, provenance, an optional preview manifest, and a parent
revision. Publishing a revision never deletes or mutates an older one.

An illustrative record shape:

```json
{
  "schemaVersion": 1,
  "item": {
    "id": "port-layout",
    "title": "Port layout prototype",
    "status": "ready-for-review"
  },
  "revision": {
    "id": "r5",
    "parent": "r4",
    "lane": "main",
    "note": "Revised spacing after narrow-screen review.",
    "report": {
      "importPath": "/absolute/path/to/report.html",
      "selfContained": true
    },
    "source": {
      "repository": "/absolute/path/to/repository",
      "commit": "a1b2c3d4"
    },
    "preview": null
  }
}
```

The Hub imports report bytes and assets into its own content-addressed store; it
must not make an old revision depend only on an agent worktree that may disappear.

## Status and runtime vocabulary

Use these work statuses:

| Work status | Meaning | Normal owner |
| --- | --- | --- |
| `queued` | Known but not started | user or dispatcher |
| `working` | An agent is actively progressing it | agent |
| `needs-user` | A specific decision or external condition is needed | agent sets; user resolves |
| `ready-for-review` | Static evidence is published and worth human attention | agent |
| `done` | The user accepted the outcome | user |
| `archived` | History retained but removed from active board | user |

Preview runtime is a different, Hub-owned value: `stopped`, `starting`, `running`,
or `failed`. Do not use it as a Kanban column.

## Preview manifest

Only include a preview when it is meaningful beyond the static report. A launch
recipe must use an argv array, a pinned source state, a local health check, and
named missing requirements. It must not carry secret values.

```json
{
  "kind": "command",
  "source": {
    "repository": "/absolute/path/to/repository",
    "commit": "a1b2c3d4"
  },
  "workingDirectory": "/absolute/path/to/repository",
  "argv": ["npm", "run", "dev", "--", "--port", "{port}"],
  "health": {
    "url": "http://127.0.0.1:{port}/api/health",
    "timeoutSeconds": 30
  },
  "requirements": [
    "Install project dependencies",
    "Set DEMO_API_KEY locally before launch"
  ],
  "runnability": "best-effort"
}
```

The Hub launches a historical revision from its pinned source state in an isolated
workspace and allocates a new port. A URI such as `review-hub://launch/port-layout/r5`
identifies that record; it never embeds a command or preserves a stale port.

## URI behavior

The report may safely link to stable item/revision records:

```text
review-hub://open/port-layout
review-hub://open/port-layout/r5
review-hub://launch/port-layout/r5
```

`open` opens the Hub's card/history. `launch` requests a launch; the Hub validates
the registered recipe and displays new or changed commands and requirements before
executing them. If the preview cannot be restored, it opens the static report and
explains the reason.

## Publication checklist

- Report is self-contained and useful with the preview stopped.
- Revision records source pin and parent (or explicitly begins a new lane).
- Status note tells a person what changed or what is needed.
- Preview recipe names a health check and does not include secrets.
- Final handoff uses revision URIs, never bare localhost ports.

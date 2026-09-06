#!/usr/bin/env python3
"""Build a five-way, artifact-first proposal gallery for durable agent results."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SKILL_GALLERY = Path("/home/bam/.codex/skills/babble/scripts/gallery.py")
SPEC = ROOT / "docs/durable-agent-review-proposals-2026-09-06.json"
OUTPUT = ROOT / "docs/durable-agent-review-proposals-2026-09-06.html"


def flow_preview(
    *,
    destination: str,
    kind: str,
    base_note: str,
    later_note: str,
    destination_color: str,
    available_label: str = "Open result",
) -> str:
    """Draw the shared return-later scenario with a real toggleable state."""
    return f"""
    <div style="min-height:288px;padding:24px;background:#f4f5f1;color:#29302f;font:600 12px/1.35 ui-sans-serif,system-ui,sans-serif">
      <div style="display:flex;align-items:stretch;gap:8px;min-height:134px">
        <div style="display:grid;flex:1;place-items:center;padding:12px;border:1px solid #c8cbc5;border-radius:12px;background:#fff;text-align:center">
          <span style="color:#727973;font-size:10px;letter-spacing:.08em">AGENT FINISHES</span><b style="margin-top:7px;font-size:15px">Claude / Codex</b><small style="margin-top:4px;color:#626963">report · app · captures</small>
        </div>
        <span style="align-self:center;color:#88908a;font-size:20px">→</span>
        <div style="display:grid;flex:1;place-items:center;padding:12px;border:1px solid {destination_color};border-radius:12px;background:#fff;text-align:center">
          <span style="color:#727973;font-size:10px;letter-spacing:.08em">{kind}</span><b style="margin-top:7px;font-size:15px">{destination}</b><small style="margin-top:4px;color:#626963">stable result identity</small>
        </div>
        <span style="align-self:center;color:#88908a;font-size:20px">→</span>
        <div style="display:grid;flex:1;place-items:center;padding:12px;border:1px solid #c8cbc5;border-radius:12px;background:#fff;text-align:center">
          <span style="color:#727973;font-size:10px;letter-spacing:.08em">YOU RETURN</span><b style="margin-top:7px;font-size:15px">{available_label}</b><small style="margin-top:4px;color:#626963">from the chat card</small>
        </div>
      </div>
      <div class="demo-base-only" style="margin-top:16px;padding:11px 12px;border-radius:10px;background:#e9ece7;color:#525a54">Now · {base_note}</div>
      <div class="demo-alt-only" style="margin-top:16px;padding:11px 12px;border-radius:10px;background:#e4f3e9;color:#1e6a42">Three days later · Agent server is gone. {later_note}</div>
      <button class="demo-button" data-demo-toggle data-base-label="Simulate returning later" data-alt-label="Show completion state" style="margin-top:16px">Simulate returning later</button>
    </div>"""


def lifecycle_media(stages: list[tuple[str, str]], caption: str) -> dict[str, str]:
    cells = "".join(
        f'<div style="flex:1;min-width:90px;padding:10px;border:1px solid #d8dbd6;border-radius:9px;background:#fff"><b style="display:block;font-size:11px">{name}</b><span style="display:block;margin-top:4px;color:#68706a;font-size:10px">{detail}</span></div>'
        for name, detail in stages
    )
    return {
        "label": "Lifecycle contract",
        "caption": caption,
        "html": f'<div style="display:flex;flex-wrap:wrap;gap:7px;padding:16px;background:#f4f5f1;font-family:ui-sans-serif,system-ui,sans-serif">{cells}</div>',
    }


REQUIREMENTS = [
    {
        "id": "return",
        "name": "Reliable return later",
        "weight": 35,
        "why": "The stated failure is that a result is dead by the time its recipient opens the chat again.",
        "passCondition": "A result opened three days later remains useful without the original agent process or its ephemeral port.",
        "anchors": {
            "1": "A raw localhost or task URL fails when the agent session ends.",
            "3": "A result usually survives but has an unhandled expiry, device, or process dependency.",
            "5": "The result is retained by contract and its non-live fallback also opens independently.",
        },
    },
    {
        "id": "instant",
        "name": "Instant inspection",
        "weight": 25,
        "why": "A review link should feel like opening an attachment, not resuming an operations task.",
        "passCondition": "The recipient sees a useful rendered result immediately after activating the chat’s review card.",
        "anchors": {
            "1": "The recipient must find a terminal, revive a server, or diagnose a broken URL.",
            "3": "A progress state appears before a usable result, but recovery is automatic.",
            "5": "A useful static result is visible at once, with no recovery action.",
        },
    },
    {
        "id": "fidelity",
        "name": "Truthful interactive fidelity",
        "weight": 20,
        "why": "For an app or canvas, a screenshot alone can conceal the behavior the user needs to judge.",
        "passCondition": "When interaction is the result, the approach preserves a truthful way to exercise it or clearly labels the retained evidence as static.",
        "anchors": {
            "1": "The result silently degrades into an unlabelled or misleading picture.",
            "3": "A recording or reconstruction survives but cannot exercise the original interaction.",
            "5": "A live version remains available when relevant and the static evidence is a clear fallback.",
        },
    },
    {
        "id": "ownership",
        "name": "User control and privacy",
        "weight": 10,
        "why": "Results may contain local code, data, or work-in-progress and should remain understandable and recoverable by their owner.",
        "passCondition": "The recipient can identify where the bytes live, how long they remain, and how to export or remove them.",
        "anchors": {
            "1": "Retention, access, or deletion is opaque.",
            "3": "The storage is understandable but controlled mainly by a provider or a fragile machine state.",
            "5": "Retention, access, export, and deletion are explicit user-facing controls.",
        },
    },
    {
        "id": "agent_cost",
        "name": "Low agent-operational burden",
        "weight": 10,
        "why": "Reliability should be a product default, not something a user must remember to request on every task.",
        "passCondition": "An ordinary result is published and health-checked automatically with minimal per-task setup.",
        "anchors": {
            "1": "Every task needs bespoke ports, manual deployment, or cleanup.",
            "3": "The provider automates some lifecycle work but special cases are routine.",
            "5": "The durable result is the normal completion path and lifecycle is automatic.",
        },
    },
]


GATES = [
    {
        "id": "stable-reference",
        "name": "No raw ephemeral server link as the only result",
        "why": "A bare task-owned port has no retention contract and cannot meet the return-later promise.",
    },
    {
        "id": "honest-fallback",
        "name": "A visible, labelled fallback exists for every live result",
        "why": "A user should still get a useful report, recording, or explanation if a live runtime cannot be restored.",
    },
]


def score(score: int, evidence: str, confidence: str = "medium") -> dict[str, object]:
    return {"score": score, "evidence": evidence, "confidence": confidence}


def gates(evidence: str) -> dict[str, dict[str, object]]:
    return {
        "stable-reference": {"pass": True, "evidence": evidence},
        "honest-fallback": {"pass": True, "evidence": "The review card exposes a retained static or recorded fallback instead of silently failing."},
    }


def project() -> dict[str, object]:
    return {
        "schemaVersion": 3,
        "title": "Results that are still there when you return",
        "kicker": "Five provider-neutral proposals for Claude and Codex",
        "brief": "Replace perishable agent-server links with a result contract: after an agent finishes, a recipient opening the chat days later should get an immediately useful, honest result without reviving a terminal or discovering which port once hosted it.",
        "count": 5,
        "defaultId": "v5",
        "defaultWhy": "The Review Resolver wins at 94/100 because it makes one durable Result card responsible for resolving to the best available representation, while requiring a static fallback for every live experience. It is a product protocol rather than merely another place to host a server.",
        "decisionHinge": "This recommendation assumes Claude and Codex can agree to implement a small shared result manifest. If cross-provider coordination is unavailable, shift the 10% agent-cost weight to immediate delivery: V1’s attached Review Bundle becomes the strongest independent default (90/100).",
        "invariants": [
            "Use the same return-later fixture: a user opens a completed chat three days after the agent process has stopped.",
            "Each proposal retains a report, a visual capture, source/revision provenance, and a clearly marked live-versus-static state.",
            "A raw localhost port or agent-shell process is never the sole review destination.",
            "Retention, access, and deletion are visible to the user rather than implied by an agent’s lifetime.",
        ],
        "boundary": "This is a product-concept gallery, not an implementation or a proof of either provider’s current capabilities. The interactive diagrams model the return-later contract; scores are reasoned design judgments, not operational measurements.",
        "axes": [
            {"name": "Durable home", "values": ["chat attachment", "local library", "immutable host", "hibernating capsule", "resolver manifest"]},
            {"name": "Live-app strategy", "values": ["recorded only", "local reopen", "static + hosted", "wake on open", "choose best available"]},
            {"name": "Ownership boundary", "values": ["conversation", "user device", "user/provider storage", "runtime image", "portable manifest"]},
            {"name": "Failure behavior", "values": ["open bundle", "open shelf", "serve immutable build", "show cover then wake", "automatically fall back"]},
        ],
        "requirements": REQUIREMENTS,
        "hardGates": GATES,
        "variants": [
            {
                "id": "v1",
                "name": "Attached Review Bundle",
                "thesis": "Make a self-contained result attachment—not a server URL—the default thing an agent leaves in chat.",
                "accent": "#2f7f74",
                "bestWhen": "The output is a report, HTML prototype, images, diff, or short interaction capture; maximum reliability and a one-click result matter more than a running backend.",
                "losesWhen": "The essential result depends on a real multi-user service, writable state, hardware, or a large dataset that cannot sensibly be packaged.",
                "decisions": [
                    {"label": "Canonical object", "value": "A content-addressed bundle: rendered HTML, media, source revision, and a small result manifest."},
                    {"label": "Chat surface", "value": "A first-class Result card opens the bundle inside the provider, with download/export rather than a raw port."},
                    {"label": "Live boundary", "value": "Interactive behavior is captured as an annotated replay or video when the actual runtime cannot travel in the bundle."},
                ],
                "keepParts": ["one permanent chat card", "content-addressed bundle", "explicit static/live label"],
                "proof": ["The direct control switches from completion to the three-days-later state without relying on a server.", "This concept is static evidence by design; it does not prove a live backend can be preserved."],
                "previewLabel": "zero-server result",
                "story": {"title": "Try the return-later path", "steps": [{"label": "Agent attaches the result", "caption": "The canonical deliverable is an immutable Review Bundle already resident in the conversation.", "state": "base", "target": "[data-demo-toggle]"}, {"label": "Return after the server died", "caption": "The attachment still opens because no task-owned server was part of the basic path.", "state": "alt", "target": "[data-demo-toggle]"}]},
                "scores": {"return": score(5, "The bundle is independent of the original task process once persisted.", "medium"), "instant": score(5, "Opening an attachment can render immediately in the chat client.", "medium"), "fidelity": score(3, "A replay is honest but cannot retain arbitrary server-side interaction.", "high"), "ownership": score(4, "Conversation-owned retention and export can be explicit, but provider retention remains a policy dependency.", "medium"), "agent_cost": score(5, "Packaging can be the ordinary completion operation rather than task-specific server management.", "medium")},
                "gateResults": gates("The chat card resolves to a stored bundle ID, never to a one-off port."),
                "preview": flow_preview(destination="Review Bundle", kind="IMMUTABLE ATTACHMENT", base_note="The agent writes its report, captures, and provenance into one card.", later_note="The bundle opens immediately; no dev server needs to wake.", destination_color="#75a99d"),
                "media": [lifecycle_media([("Build", "render + capture"), ("Attach", "write manifest"), ("Return", "open bundle")], "The entire normal path is static: this proposal removes the server from the delivery contract.")],
            },
            {
                "id": "v2",
                "name": "User-owned Result Library",
                "thesis": "Give each desktop client a durable, browsable shelf of every finished result, stored locally and indexed by task.",
                "accent": "#7667c6",
                "bestWhen": "The user primarily returns on the same personal machine and values private local artifacts, search, and durable offline access.",
                "losesWhen": "Results must open from another device or be shared with people who lack that local library; syncing then becomes a separate product commitment.",
                "decisions": [
                    {"label": "Canonical object", "value": "A local content-addressed result directory, plus a task/result index and retention controls."},
                    {"label": "Chat surface", "value": "The chat card deep-links to a native review pane; it does not expose localhost routing."},
                    {"label": "Recovery", "value": "A finished result is independent of the task terminal and can be searched, exported, or pinned from the Library."},
                ],
                "keepParts": ["offline shelf", "result search", "per-result retain/export/delete"],
                "proof": ["The alternate state models the desktop client reading stored bytes after the agent’s task has disappeared.", "Cross-device sync is deliberately outside this proposal’s stop line."],
                "previewLabel": "local, durable shelf",
                "story": {"title": "Try the library reopen", "steps": [{"label": "Result enters the shelf", "caption": "Completion persists a local package and registers its task and revision metadata.", "state": "base", "target": "[data-demo-toggle]"}, {"label": "Open it later", "caption": "The app serves the stored result directly rather than asking an old dev server to answer.", "state": "alt", "target": "[data-demo-toggle]"}]},
                "scores": {"return": score(5, "Local persisted content survives agent/task lifetime while the device and library are retained.", "medium"), "instant": score(5, "The desktop can open the saved artifact without network or runtime startup.", "medium"), "fidelity": score(3, "It preserves static captures and client-side prototypes; arbitrary services remain out of scope.", "high"), "ownership": score(5, "The user controls the files, retention, export, and deletion on their device.", "high"), "agent_cost": score(3, "The client needs indexing, storage management, and eventually sync, though individual agents need little setup.", "medium")},
                "gateResults": gates("The card resolves to a durable library record, with an exportable bundle as the fallback."),
                "preview": flow_preview(destination="Result Library", kind="LOCAL CONTENT STORE", base_note="The desktop indexes the completed result by task and revision.", later_note="The task terminal is gone, but the Library opens its stored artifact offline.", destination_color="#9a90d7"),
                "media": [lifecycle_media([("Persist", "content hash"), ("Index", "task + revision"), ("Open", "native pane"), ("Export", "portable bundle")], "The durable home is the user’s own device; syncing is an explicit optional layer.")],
            },
            {
                "id": "v3",
                "name": "Immutable Review Site",
                "thesis": "Publish each completed result to a stable, authenticated web address backed by immutable static hosting.",
                "accent": "#b7791f",
                "bestWhen": "The result should open from any device, be shareable, and consist largely of a built app, report, media, or read-only browser interaction.",
                "losesWhen": "Sensitive local data cannot leave the machine or the cost/governance of hosted retention is unacceptable.",
                "decisions": [
                    {"label": "Canonical object", "value": "An immutable build addressed by result ID and source revision, with a retention policy shown in the card."},
                    {"label": "Chat surface", "value": "A persistent authenticated URL points to a static deployment—not the agent’s Vite or notebook port."},
                    {"label": "Live boundary", "value": "Read-only browser behavior can be built into the site; server-dependent behavior links to an honest captured fallback."},
                ],
                "keepParts": ["cross-device URL", "build/revision provenance", "static-first CDN delivery"],
                "proof": ["The later state represents an immutable deployment that has no relationship to the agent’s finished shell.", "Actual ACL, retention period, and cloud cost are product-policy questions, not proven by this concept."],
                "previewLabel": "cross-device immutable URL",
                "story": {"title": "Try the hosted return", "steps": [{"label": "Publish the review build", "caption": "The agent publishes a signed immutable build, then the card records its stable result ID.", "state": "base", "target": "[data-demo-toggle]"}, {"label": "Open from a later chat", "caption": "The hosted static build remains directly available after the originating runtime ends.", "state": "alt", "target": "[data-demo-toggle]"}]},
                "scores": {"return": score(5, "Immutable object storage/CDN retention can be contractual and decoupled from the agent process.", "medium"), "instant": score(5, "Static hosting can serve a useful initial document immediately.", "medium"), "fidelity": score(4, "Read-only browser apps and static interactions survive; an arbitrary backend still needs a separate strategy.", "high"), "ownership": score(3, "Access can be controlled, but the bytes and retention live in provider-operated infrastructure.", "medium"), "agent_cost": score(4, "A standard publish pipeline is automatable, with hosting governance as the fixed operational cost.", "medium")},
                "gateResults": gates("The review ID maps to a retained immutable object, not to a port on the task host."),
                "preview": flow_preview(destination="Review Site", kind="IMMUTABLE HOST", base_note="A final build is uploaded under a stable result ID and access policy.", later_note="The URL serves the same retained build even though the agent runner no longer exists.", destination_color="#d4a550"),
                "media": [lifecycle_media([("Build", "hash + manifest"), ("Publish", "immutable object"), ("Authorize", "user/account"), ("Open", "any device")], "This is a deployment deliverable, not a long-running agent-owned development server.")],
            },
            {
                "id": "v4",
                "name": "Hibernating Preview Capsule",
                "thesis": "Preserve the actual live preview in a snapshotable capsule that sleeps when idle and wakes when its result URL is opened.",
                "accent": "#3f6fa8",
                "bestWhen": "The behavior itself matters—e.g. a real API, data transform, integrated app, or richer test fixture—and a static reconstruction would be misleading.",
                "losesWhen": "The user expects true instant opening, the environment is difficult to snapshot securely, or the cost of keeping restorable runtimes is unjustified.",
                "decisions": [
                    {"label": "Canonical object", "value": "A signed runtime image plus data snapshot, static cover page, health contract, and expiry policy."},
                    {"label": "Chat surface", "value": "The review card first shows a retained cover and status; it wakes the capsule automatically rather than surfacing a dead port."},
                    {"label": "Fallback", "value": "When wake fails or the lease has expired, the same card opens the bundled report, captures, logs, and provenance."},
                ],
                "keepParts": ["wake-on-open", "health status", "static cover before live runtime", "snapshot lease"],
                "proof": ["The toggle models automatic restoration after the original agent service has ended.", "Startup latency, secret stripping, and real snapshot restoration need operational acceptance testing before this could be a promise."],
                "previewLabel": "live interaction with fallback",
                "story": {"title": "Try the wake path", "steps": [{"label": "Capsule hibernates", "caption": "The result card keeps a static cover while idle, so a completed task no longer owns an exposed port.", "state": "base", "target": "[data-demo-toggle]"}, {"label": "Return and wake", "caption": "Opening the card restores the snapshot; the fallback remains available if the wake cannot complete.", "state": "alt", "target": "[data-demo-toggle]"}]},
                "scores": {"return": score(4, "A retained image can be restored, but its lease and dependencies introduce more failure modes than a static object.", "medium"), "instant": score(3, "The cover is immediate, but faithful live interaction requires a wake delay.", "high"), "fidelity": score(5, "The actual application and service state can remain exerciseable rather than merely recorded.", "medium"), "ownership": score(4, "A user-visible lease and export can give control, though a runtime platform still operates the capsule.", "medium"), "agent_cost": score(2, "Snapshotting, safe wake-up, health checks, and expiry handling are substantial platform operations.", "high")},
                "gateResults": gates("The capsule URL resolves through a retained result record and always has a static cover/fallback."),
                "preview": flow_preview(destination="Preview Capsule", kind="SNAPSHOT + WAKE", base_note="The interactive environment sleeps; its cover and evidence remain visible.", later_note="The card starts the capsule automatically—or opens its retained static fallback if wake fails.", destination_color="#76a0d2", available_label="Open / wake result"),
                "media": [lifecycle_media([("Finish", "snapshot + scrub"), ("Sleep", "no exposed port"), ("Return", "cover first"), ("Wake", "health check"), ("Fallback", "bundle")], "The live runtime is a recoverable enhancement, never the only thing the recipient gets.")],
            },
            {
                "id": "v5",
                "name": "Review Resolver Contract",
                "thesis": "Standardize one Result card and manifest that selects the best surviving representation—live, hosted, local, or static—then visibly falls back.",
                "accent": "#e05a3f",
                "bestWhen": "A person uses more than one agent or device and wants every result link to behave predictably, even though the underlying output types vary widely.",
                "losesWhen": "The providers cannot coordinate on a portable manifest or the platform cannot afford to retain even a minimal static fallback for every completed result.",
                "decisions": [
                    {"label": "Canonical object", "value": "A portable `review.json` references immutable static evidence, optional live endpoints, provenance, access, and retention policy."},
                    {"label": "Chat surface", "value": "Every agent emits one Result card. The client resolves it in order: live healthy preview → immutable site/local copy → self-contained bundle."},
                    {"label": "Reliability promise", "value": "The user never receives a naked port; health checks and automatic fallback are owned by the resolver, not improvised by each agent."},
                ],
                "keepParts": ["one result vocabulary", "health-aware resolver", "portable manifest", "mandatory static fallback"],
                "proof": ["The direct control demonstrates the core state change: a live endpoint can disappear while the card still resolves to a retained result.", "The cross-provider manifest and resolver would require a shared product/API decision; this gallery does not claim either exists today."],
                "previewLabel": "one durable card, many backends",
                "story": {"title": "Try the resolver’s failure path", "steps": [{"label": "Use the highest-fidelity view", "caption": "When a live preview is healthy, the Result card can open it while preserving the manifest and fallback choices.", "state": "base", "target": "[data-demo-toggle]"}, {"label": "Resolve after live loss", "caption": "When the agent runtime disappears, the same card automatically picks the immutable/static representation and labels why.", "state": "alt", "target": "[data-demo-toggle]"}]},
                "scores": {"return": score(5, "The resolver makes retained fallback part of the contract rather than relying on a single runtime destination.", "medium"), "instant": score(5, "It can resolve directly to a ready static representation while a higher-fidelity option is unavailable or waking.", "medium"), "fidelity": score(5, "It may choose a verified live view when available but never hides the static evidence path.", "medium"), "ownership": score(4, "The manifest can expose storage, policy, export, and deletion across destinations, though some bytes remain provider-hosted.", "medium"), "agent_cost": score(3, "The shared resolver is a meaningful platform investment, but it eliminates per-agent lifecycle improvisation afterward.", "medium")},
                "gateResults": gates("The durable Result card resolves a manifest, which must contain static evidence even when it also offers live URLs."),
                "preview": flow_preview(destination="Result Resolver", kind="PORTABLE MANIFEST", base_note="The card selects a healthy live view when it is genuinely available.", later_note="Live has vanished; the resolver switches to the retained immutable bundle and says so.", destination_color="#ec8d77", available_label="Open best result"),
                "media": [lifecycle_media([("Manifest", "IDs + policy"), ("Check", "live healthy?"), ("Prefer", "highest fidelity"), ("Fallback", "static bundle"), ("Explain", "why this view")], "Unlike a hosting choice, this is the reliability control plane: it unifies the user experience across all result homes.")],
            },
        ],
        "checks": [
            "Exactly five structurally distinct durable-result models",
            "The same three-days-later return scenario in every hero",
            "Frozen weights sum to 100% before scoring",
            "Every live-oriented concept supplies an explicit retained fallback",
            "The gallery offers pick, shortlist, reject, splice, and Markdown export controls",
        ],
    }


def main() -> None:
    SPEC.write_text(json.dumps(project(), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    subprocess.run(
        ["python3", str(SKILL_GALLERY), "build", "--spec", str(SPEC), "--output", str(OUTPUT)],
        check=True,
    )
    print(OUTPUT)


if __name__ == "__main__":
    main()

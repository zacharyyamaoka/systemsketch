# 004 — Cursor usage limit vs 2% monthly usage

## Goal

Understand why Cursor reported a maximum / model-usage limit and forced Grok, even though the account still looked like only ~2% of monthly usage.

## What we found

Cursor Pro is active (`stripeMembershipType: pro`). The product does **not** have one monthly battery.

There are two separate included pools, both on the billing-cycle clock:

1. **Cursor Models** — Grok 4.6, Grok 4.5, Composer 2.5. Cursor calls this “generous / significantly more included usage.” No public dollar figure. This is the bar people usually read as “2% of monthly usage.”
2. **Other Models** — Claude, GPT, Gemini, and other third-party models, billed at each model’s API price. On Pro this is a small dollar allowance (commonly cited as **$20/mo**). Pro Plus is ~$70, Ultra ~$400.

When Other Models is empty, the editor says the selected model’s usage is taken up. Grok and Composer keep working because they draw from pool 1, which can still be almost unused.

Official refs:

- https://cursor.com/help/models-and-usage/usage-limits
- https://cursor.com/docs/models-and-pricing

## Why this is easy to hit on Pro

- Long Agent runs (tool calls, retries, large context) burn Other Models much faster than “number of chats” suggests.
- Auto / Cursor Router can send a request to a third-party model and charge pool 2 even if the chat later continues on Grok.
- The in-app percentage and the dashboard Spending tab can disagree; Spending is the source of truth for both pools.

## Other possibilities we considered

- **Temporary provider rate limit / High Load** — capacity, not monthly quota. Message is usually “try again” or “high demand,” not “use Grok because usage is taken up.”
- **On-demand spend cap** — only if pay-as-you-go was enabled and a hard limit was set.
- **Hobby / Free limit** — ruled out; this machine’s Cursor auth is Pro, active.

We could not open `cursor.com/dashboard` from this session (browser hit the public login page), so we did not read live dollar remaining. Diagnosis is from plan + product docs + the exact Grok-fallback behavior.

## Options

- Keep working on Grok / Composer from the Cursor Models pool (intended fallback).
- Enable on-demand usage to keep Claude/GPT at API rates.
- Upgrade if third-party models are the default (Pro Plus / Ultra enlarge Other Models).
- Check **Cursor Settings → Usage** and **cursor.com/dashboard → Spending** and look at both pool bars, not one percentage.

## Follow-up: Cursor vs using Grok directly

Zach’s read: Cursor is becoming a Grok IDE, the Other Models allowance is a sampler, and they will keep pushing first-party models.

Checked against current public prices (2026-09-03):

| Buy | Price | What you actually get |
|---|---|---|
| Cursor Pro | $20/mo | IDE + generous Grok/Composer pool + ~$20 of Claude/GPT at API list |
| Cursor Teams Standard | $40/user/mo | Same two pools, plus **$0.25 / 1M tokens Cursor Token Rate on every third-party token, including BYOK**. Grok/Composer exempt. |
| SuperGrok (grok.com) | $30/mo | Chat / voice / Imagine / Grok Bot. Not an IDE, not API credits. |
| SuperGrok Plus | $100/mo | Higher grok.com usage, 1080p video, priority. Still not Cursor. |
| xAI API Grok 4.6 | $2 / $0.50 cached / $6 per 1M tokens | Same published token rates as Cursor’s Grok 4.6 table. Pay only for tokens. No editor. |

Cursor Grok is not cheaper than Grok-the-API. It is Grok list price wrapped in the agent/editor. SuperGrok is a different product (consumer chat), so “just use Grok directly” only matches if the job is chat, not coding in the repo.

The $20 Other Models pool is the sampler. Cursor’s own usage guide says daily Agent users typically run $60–$100/mo total. Pro’s third-party allowance is sized to run out if Claude/GPT is the default.

Incentive is explicit on Teams: tax third-party, exempt Grok and Composer. Composer 2.5 is even cheaper still ($0.50 in / $2.50 out). India Start plan has **no** Other Models pool at all.

## Follow-up: Grok 4.6 vs 4.5 as the daily driver

Zach will stay on Cursor and use first-party Grok as the default. Question: 4.6 or 4.5?

Recommendation: **default to Grok 4.6**, standard (not Fast), effort **high**.

Same Cursor Models pool and same $2 / $0.50 / $6 list price as 4.5. 4.6 is the current general model: longer agent runs, better instruction-following with many rules/skills, stronger first passes on interactive/visual work. That matches SystemSketch (multi-step agents, UI, large tree). Cursor’s own “use 4.6 when 4.5 stalled or felt short” is the usual case here, not the exception.

Keep 4.5 as a fallback when 4.6 is High Load or feels slow on short turns. Skip Fast unless waiting on tokens (2× from the same pool). `xhigh` only for a stuck hard task.

Composer 2.5 remains the cheap/fast everyday option; Zach said he is fine living on Grok.

## Not doing

No code change. This is an account-billing diagnosis, not a SystemSketch bug.

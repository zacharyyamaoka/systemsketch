# 006 — Pre reactor (Lingua Franca BT) in SystemSketch

**Goal.** Explain how the generated Pre reactor works in *Behavior Trees with Dataflow: Coordinating Reactive Tasks in Lingua Franca* (Schulz-Rosengarten et al., ICSE 2024 / arXiv:2401.09185), and draw that contract in SystemSketch so a backward-in-time relationship is never a normal data cable.

**Visual contract (this board).**

| Mark | Means | Must not mean |
| --- | --- | --- |
| Solid data cable | A typed **within-tick** value dependency (same LF tag / same BT tick) | A loop, a later observation, a mutation |
| Dashed async cable | A **latest-value observation** or other cross-tick *read of whatever was last published* | A one-tick delay of a specific writer; “some vague async thing” |
| Effect / `mut` cable | A **named write** (`state.camera`, `state.config`, …) | An opaque mutation of `self`; a time machine |
| `z⁻¹` / Pre | The **only** sanctioned backwards-in-time relationship: the previous tick’s value of this channel | A solid arrow drawn the wrong way |

**What the paper actually does.**

BT ticks in that embedding are driven by a `start` input, not by LF’s usual `after` time delay. If a Reader sits sequentially *before* a Writer on channel `x`, a direct `Writer.x → Reader.x` is a causality cycle (same tag, Reader already ran). The compiler inserts a **Pre reactor**: store this tick’s write, and re-emit it when the *next* `start` fires. Forward writers on the same tick still win over the stored previous value.

**How to draw it in SystemSketch (options considered).**

1. **Literal Pre Block** (paper Fig. 7d). `tick` fans `start` into Reader and Pre; Writer’s `x` is a solid store into Pre; Pre’s `x` is solid *this-tick* data into Reader. The delay lives **in the Block**, gated by `start`, not on a backward data cable.
2. **Compact `z⁻¹` cable** (SystemSketch’s existing delayed edge). Same Reader/Writer graph; Pre is compiled onto the back edge. This is the drawing for a loop-carried or “next evaluation” value. Still not a solid backward cable.
3. **Both, plus a contrast row** (chosen). Keep Pre as a Block when the tick is an external `start` (BT / timer / “on next camera tick”). Use the delayed cable when the tick is already a Loop iteration. Show async and `mut` beside them so they cannot be mistaken for Pre.

**Not chosen.** Drawing a solid Writer→Reader back cable and hoping colour or a label will save it. The paper rejects that graph; LF would too.

**Live Preview (this session).** Paste this unescaped (do not percent-encode `=` or `/`):

`http://127.0.0.1:4340/?board=/home/bam/systemsketch/sketches/review/pre-reactor-lingua-franca.systemsketch`

Agent-owned ports 4340/4341. Not a retained review_runtime URL. Encoding `?board=` as `?board%3D…` is rejected as an invalid board link.


**Layout notes.** Legend is 2×2 so titles (`Writer`, `setattr`, `observe`) are not clipped. Mut pair sits top-right so the effect stub leaves upward. Panel B is the paper-faithful Pre Block; panel C is the delayed cable. Panel D contrasts camera latest-frame (async) with `state.camera` (mut).


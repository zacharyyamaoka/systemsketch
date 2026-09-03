# Review recipe

Use a recipe to describe intent while the helper lets the current SystemSketch editor fill defaults, validate custom records, serialize the installed schema, and write the `.systemsketch` envelope.

## Shape

```json
{
  "feature": "Short human name",
  "viewport": { "width": 1280, "height": 720 },
  "pages": [
    { "id": "review", "name": "Review" },
    { "id": "secondary", "name": "Secondary" }
  ],
  "shapes": [],
  "bindings": [],
  "callouts": []
}
```

- `feature` is required.
- `viewport` is optional and controls the generated screenshot. The default is a conservative 1280×720 so a saved camera fits common review surfaces; use a larger viewport only when the interaction genuinely needs it.
- `pages` is optional. The first entry becomes the visible review page; later entries seed real additional pages for cross-page navigation features. Use safe local ids such as `review` and `secondary`.
- `shapes` contains partials accepted by `Editor.createShapes`. Use a safe local `id` such as `subject`; the helper expands it to `shape:subject`. `parentId`, `fromId`, and `toId` accept the same shorthand. A top-level shape may use `pageId: "secondary"` to live on a page declared above; nested shapes still use `parentId`.
- `bindings` contains partials accepted by `Editor.createBindings`. A stable `id` is optional; the helper mints one from the binding type and position when omitted. Use this for actual semantic connections, never for decorative cue arrows.
- `callouts` become stock tldraw geo cards. A callout with a `target` also gets a stock orange elbow arrow bound to the card and, for shape targets, the target shape. They remain editable in the resulting board.

The helper accepts a `text` shorthand on any stock text-bearing shape and converts it to current tldraw rich text. Keep custom shape props native to that feature.

## Chrome and derived-panel features

Comments, Problems, and Find & Replace are real chrome/read-model interactions, not fixture record types. Seed the smallest honest board state that makes the panel useful, put the literal keyboard or menu gesture in the callouts, and drive it after generation. Do not hand-author comment records, diagnostic rows, or search results in recipe JSON: comments must be created through the live Comments panel, while diagnostics and search results must be derived from the real board.

## Callouts

```json
{
  "id": "step-1",
  "kind": "step",
  "text": "1 · Drag this Block 200 px right",
  "x": 80,
  "y": 200,
  "w": 400,
  "h": 110,
  "target": { "shapeId": "subject", "anchor": "left" }
}
```

`kind` is `step`, `note`, or `pass`. A shape target is `{ "shapeId": "subject", "anchor": "top|right|bottom|left", "dx": 0, "dy": 0 }`; an absolute target is `{ "x": 700, "y": 320 }`. A `pass` callout normally has no target and should begin with `PASS WHEN`.

The `anchor` is a geometry contract, not a label. Put the card outside that edge. Use `dy` to choose a point along a `left` or `right` edge and `dx` along a `top` or `bottom` edge; never offset away from the edge. The helper rejects ambiguous center anchors and cross-axis offsets. It binds stock elbow-arrow terminals at precise edge points so moving either object preserves the connection and the arrow's last segment approaches normally.

If several callouts target the same shape edge, give their along-edge offsets at least 48 units of separation. This reserves distinct final approach lanes instead of letting arrowheads and shafts converge at the edge.

## Common SystemSketch objects

A partial Block lets the current `BlockShapeUtil` fill every omitted default:

```json
{
  "id": "subject",
  "type": "block",
  "x": 700,
  "y": 330,
  "props": {
    "title": "decode()",
    "description": "Interaction target",
    "blockType": "Function",
    "view": "port",
    "w": 340,
    "h": 198,
    "inputs": [{ "id": "in_1", "name": "image", "type": "Image", "visible": true }],
    "outputs": [{ "id": "out_1", "name": "latent", "type": "Latent", "visible": true }]
  }
}
```

For an Expanded Block, set `view`, `w`, and `h`, then make child shapes use the Block's shorthand id as `parentId`. For a semantic cable, create a `connection` shape plus its two `connection` bindings with the exact current props from the feature source or an existing acceptance test. Do not imitate a semantic cable with a stock arrow.

For a Branch, seed only the semantic `branch` and its ordinary direct children, stamping each child with `meta.branchArm`. The live editor projects those children into internal `branch-arm` frames when the board loads. Never put `branch-arm` records in a recipe: they are derived implementation details that the current document format persists automatically, while older boards are upgraded on load.

## Review quality

- Pre-arrange the state immediately before the primary gesture.
- Use one step per physical action. If setup takes three gestures, encode the setup into the file.
- State observable success, not internal implementation: “children disappear and return after re-expanding,” not “visibility callback returns hidden.”
- Leave at least 80 canvas units between a cue card and the target's interaction bounds.
- Leave at least 48 canvas units between cue cards. Do not stack borders flush, and avoid routing two arrows through the same narrow corridor.
- Use cards at least 340×100 canvas units. Prefer more width over more height; shorten prose or enlarge a card before accepting dense wrapping.
- Keep the full scene inside the declared viewport with margin. `zoomToFit` is not permission to place a card partly outside the screenshot.
- Inspect the PNG for text clipping, edge cropping, crossings, and arrow approach angles. For changes to the generator itself, run `scripts/create_layout_sweep.mjs` on the same seed before/after and once more on a fresh seed.
- Keep the saved board small enough that `zoomToFit` leaves labels legible.

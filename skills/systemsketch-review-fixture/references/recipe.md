# Review recipe

Use a recipe to describe intent while the helper lets the current SystemSketch editor fill defaults, validate custom records, serialize the installed schema, and write the `.systemsketch` envelope.

## Shape

```json
{
  "feature": "Short human name",
  "viewport": { "width": 1280, "height": 720 },
  "shapes": [],
  "bindings": [],
  "callouts": []
}
```

- `feature` is required.
- `viewport` is optional and controls the generated screenshot. The default is a conservative 1280×720 so a saved camera fits common review surfaces; use a larger viewport only when the interaction genuinely needs it.
- `shapes` contains partials accepted by `Editor.createShapes`. Use a safe local `id` such as `subject`; the helper expands it to `shape:subject`. `parentId`, `fromId`, and `toId` accept the same shorthand.
- `bindings` contains partials accepted by `Editor.createBindings`. Use this for actual semantic connections, never for decorative cue arrows.
- `callouts` become stock tldraw geo cards. A callout with a `target` also gets a stock orange arrow. They remain editable in the resulting board.

The helper accepts a `text` shorthand on any stock text-bearing shape and converts it to current tldraw rich text. Keep custom shape props native to that feature.

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

`kind` is `step`, `note`, or `pass`. A target is either `{ "shapeId": "subject", "anchor": "top|right|bottom|left|center", "dx": 0, "dy": 0 }` or `{ "x": 700, "y": 320 }`. A `pass` callout normally has no target and should begin with `PASS WHEN`.

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

## Review quality

- Pre-arrange the state immediately before the primary gesture.
- Use one step per physical action. If setup takes three gestures, encode the setup into the file.
- State observable success, not internal implementation: “children disappear and return after re-expanding,” not “visibility callback returns hidden.”
- Leave at least 80 canvas units between a cue card and the target's interaction bounds.
- Keep the saved board small enough that `zoomToFit` leaves labels legible.

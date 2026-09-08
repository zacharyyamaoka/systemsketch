from PIL import Image, ImageChops
import json, os

SHOTS = "/home/bam/.claude/jobs/c3a25911/tmp/tw-tldraw-probe/shots"
CANVAS_BOX = (0, 0, 1000, 800)  # the <div> holding <Tldraw>, per App.tsx layout

def count_changed(a_path, b_path, box):
    a = Image.open(a_path).convert("RGB").crop(box)
    b = Image.open(b_path).convert("RGB").crop(box)
    diff = ImageChops.difference(a, b)
    bbox = diff.getbbox()
    diff_px = diff.load()
    w, h = a.size
    changed = 0
    for y in range(h):
        for x in range(w):
            if diff_px[x, y] != (0, 0, 0):
                changed += 1
    return {"changed_px": changed, "total_px": w * h, "pct": round(100.0 * changed / (w * h), 4), "bbox": bbox}

results = {}
for pair in (("none", "layers"), ("none", "full")):
    for what in ("board", "panel"):
        a_path = os.path.join(SHOTS, f"{pair[0]}-{what}.png")
        b_path = os.path.join(SHOTS, f"{pair[1]}-{what}.png")
        results[f"{pair[0]}-vs-{pair[1]}-{what}-CANVASONLY"] = count_changed(a_path, b_path, CANVAS_BOX)

print(json.dumps(results, indent=2))
with open(os.path.join(SHOTS, "diff-canvas-only-results.json"), "w") as f:
    json.dump(results, f, indent=2)

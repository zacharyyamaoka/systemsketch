from PIL import Image, ImageChops
import json, os

SHOTS = "/home/bam/.claude/jobs/c3a25911/tmp/tw-tldraw-probe/shots"

def diff_pair(a_name, b_name, what):
    a = Image.open(os.path.join(SHOTS, f"{a_name}-{what}.png")).convert("RGB")
    b = Image.open(os.path.join(SHOTS, f"{b_name}-{what}.png")).convert("RGB")
    if a.size != b.size:
        return {"error": f"size mismatch {a.size} vs {b.size}"}
    diff = ImageChops.difference(a, b)
    bbox = diff.getbbox()
    # count pixels where any channel differs
    px_a = a.load()
    px_b = b.load()
    w, h = a.size
    changed = 0
    diff_px = diff.load()
    for y in range(h):
        for x in range(w):
            r, g, bch = diff_px[x, y]
            if r or g or bch:
                changed += 1
    total = w * h
    pct = 100.0 * changed / total

    # amplified diff image: scale differences up, floor at 0
    amp = diff.point(lambda v: min(255, v * 8))
    amp_path = os.path.join(SHOTS, f"diff-{a_name}-vs-{b_name}-{what}.png")
    amp.save(amp_path)

    return {
        "changed_px": changed,
        "total_px": total,
        "pct": round(pct, 4),
        "bbox": bbox,
        "diff_image": amp_path,
    }

results = {}
for what in ("board", "panel"):
    for pair in (("none", "layers"), ("none", "full")):
        key = f"{pair[0]}-vs-{pair[1]}-{what}"
        results[key] = diff_pair(pair[0], pair[1], what)

print(json.dumps(results, indent=2))
with open(os.path.join(SHOTS, "diff-results.json"), "w") as f:
    json.dump(results, f, indent=2)

# panel side-by-side compare image
panels = [Image.open(os.path.join(SHOTS, f"{m}-panel.png")).convert("RGB") for m in ("none", "full", "layers")]
# crop to the right-most ~360px (style panel area) plus some canvas context; use full width since panel could be anywhere
# We'll crop each to its right 400px x full height for a fair compare
crops = []
for im in panels:
    w, h = im.size
    crop = im.crop((max(0, w - 400), 0, w, h))
    crops.append(crop)
total_w = sum(c.width for c in crops)
max_h = max(c.height for c in crops)
combined = Image.new("RGB", (total_w, max_h), (255, 255, 255))
x = 0
for c in crops:
    combined.paste(c, (x, 0))
    x += c.width
combined.save(os.path.join(SHOTS, "panel-compare.png"))
print("wrote panel-compare.png")

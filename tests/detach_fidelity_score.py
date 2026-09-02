#!/usr/bin/env python3
"""Deterministic perceptual score for identically framed Block snapshots."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image


def rgb(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)


def edge_map(image: np.ndarray) -> np.ndarray:
    gray = image @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    dx = np.abs(np.diff(gray, axis=1, prepend=gray[:, :1]))
    dy = np.abs(np.diff(gray, axis=0, prepend=gray[:1, :]))
    return np.clip(dx + dy, 0, 255)


def main() -> None:
    before_path, after_path, diff_path = map(Path, sys.argv[1:4])
    before = rgb(before_path)
    after = rgb(after_path)
    if before.shape != after.shape:
        raise SystemExit(f"image sizes differ: {before.shape} != {after.shape}")

    delta = np.abs(before - after)
    background = np.median(
        np.concatenate([before[:4, :4], after[:4, :4]], axis=0), axis=(0, 1)
    )
    foreground = np.logical_or(
        np.max(np.abs(before - background), axis=2) > 3,
        np.max(np.abs(after - background), axis=2) > 3,
    )
    if not foreground.any():
        foreground[:] = True

    whole_similarity = 1.0 - float(delta.mean() / 255.0)
    foreground_similarity = 1.0 - float(delta[foreground].mean() / 255.0)
    before_edge = edge_map(before)
    after_edge = edge_map(after)
    edge_union = np.logical_or(before_edge > 4, after_edge > 4)
    edge_similarity = 1.0 - float(
        np.abs(before_edge[edge_union] - after_edge[edge_union]).mean() / 255.0
    )
    score = 0.2 * whole_similarity + 0.55 * foreground_similarity + 0.25 * edge_similarity

    heat = np.max(delta, axis=2)
    heat_rgb = np.stack(
        [np.clip(heat * 4, 0, 255), np.clip(heat * 0.45, 0, 255), np.zeros_like(heat)],
        axis=2,
    ).astype(np.uint8)
    Image.fromarray(heat_rgb, mode="RGB").save(diff_path)

    print(json.dumps({
        "score": round(score, 6),
        "wholeSimilarity": round(whole_similarity, 6),
        "foregroundSimilarity": round(foreground_similarity, 6),
        "edgeSimilarity": round(edge_similarity, 6),
        "foregroundPixels": int(foreground.sum()),
        "totalPixels": int(foreground.size),
    }))


if __name__ == "__main__":
    main()

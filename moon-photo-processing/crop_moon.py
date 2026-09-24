#!/usr/bin/env python3
"""Center every frame on the moon and crop to a common size for Lynkeos.

Usage:
    pip3 install opencv-python numpy
    python3 center_moon.py /path/to/jpgs --out /path/to/centered
"""
import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}


def to_gray8(img):
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    if gray.dtype == np.uint16:
        gray = (gray / 256).astype(np.uint8)
    return gray


def find_moon(img):
    """Return (cx, cy, extent, touches_edge) of the largest bright blob, or None."""
    gray = cv2.GaussianBlur(to_gray8(img), (0, 0), 3)
    _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    n, _, stats, cents = cv2.connectedComponentsWithStats(mask)
    if n < 2:
        return None
    i = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    x, y, w, h = stats[i, :4]
    H, W = gray.shape
    edge = x <= 0 or y <= 0 or x + w >= W or y + h >= H
    return cents[i][0], cents[i][1], max(w, h), edge


def crop_centered(img, cx, cy, size):
    half = size // 2
    x0, y0 = int(round(cx)) - half, int(round(cy)) - half
    padded = cv2.copyMakeBorder(img, size, size, size, size, cv2.BORDER_CONSTANT, value=0)
    return padded[y0 + size:y0 + 2 * size, x0 + size:x0 + 2 * size]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", type=Path, help="folder with the moon frames")
    ap.add_argument("--out", type=Path, default=None, help="output folder (default: <src>/centered)")
    ap.add_argument("--margin", type=float, default=1.3, help="crop size as a multiple of moon size (default 1.3)")
    args = ap.parse_args()

    out = args.out or args.src / "centered"
    out.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in args.src.iterdir() if p.suffix.lower() in EXTS)
    if not files:
        sys.exit(f"No images found in {args.src}")

    # Pass 1: locate the moon in every frame.
    found = {}
    for p in files:
        img = cv2.imread(str(p), cv2.IMREAD_UNCHANGED)
        res = find_moon(img) if img is not None else None
        if res is None:
            print(f"skip (no moon found): {p.name}")
            continue
        if res[3]:
            print(f"warning (moon touches frame edge): {p.name}")
        found[p] = res

    size = int(max(r[2] for r in found.values()) * args.margin)
    size += size % 2
    print(f"Cropping {len(found)} frames to {size}x{size} px")

    # Pass 2: crop each frame around its moon centroid; save lossless TIFF.
    for p, (cx, cy, _, _) in found.items():
        img = cv2.imread(str(p), cv2.IMREAD_UNCHANGED)
        cv2.imwrite(str(out / f"{p.stem}.tif"), crop_centered(img, cx, cy, size))

    print(f"Done. Load the files in {out} into Lynkeos.")


if __name__ == "__main__":
    main()
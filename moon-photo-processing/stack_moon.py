#!/usr/bin/env python3
"""Stack centered moon frames: rank by sharpness, sub-pixel align, average, deconvolve.

Run center_moon.py first, then point this at its "centered" folder.

Usage:
    pip3 install opencv-python numpy
    python3 stack_moon.py /path/to/centered --keep 0.4 --radius 1.5 --iterations 15

Writes two 16-bit TIFFs next to the frames' folder:
    stacked.tif    plain average (sharpen it yourself if you prefer)
    sharpened.tif  after Richardson-Lucy deconvolution (+ optional unsharp mask)
"""
import argparse
import sys
from pathlib import Path

import cv2
import numpy as np

EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff"}


def load(path):
    img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED)
    if img is None:
        return None
    scale = 65535.0 if img.dtype == np.uint16 else 255.0
    img = img.astype(np.float32) / scale
    return img if img.ndim == 3 else img[..., None]


def gray(img):
    return img.mean(axis=2) if img.shape[2] > 1 else img[..., 0]


def sharpness(g):
    """Variance of the Laplacian after light smoothing, so noise doesn't win."""
    g = cv2.GaussianBlur(g, (0, 0), 1.0)
    return float(cv2.Laplacian(g, cv2.CV_32F).var())


def shift_image(img, dx, dy):
    h, w = img.shape[:2]
    m = np.float32([[1, 0, dx], [0, 1, dy]])
    out = cv2.warpAffine(img, m, (w, h), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REFLECT)
    return out if out.ndim == 3 else out[..., None]


def richardson_lucy(img, sigma, iterations):
    """RL deconvolution with a Gaussian PSF of the given radius (sigma, px)."""
    img = np.clip(img, 1e-6, None)
    est = img.copy()
    for _ in range(iterations):
        blurred = cv2.GaussianBlur(est, (0, 0), sigma)
        ratio = img / np.clip(blurred, 1e-6, None)
        est *= cv2.GaussianBlur(ratio, (0, 0), sigma)
    return est


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src", type=Path, help="folder with centered frames")
    ap.add_argument("--keep", type=float, default=0.4,
                    help="fraction (0-1) or count (>1) of sharpest frames to stack (default 0.4)")
    ap.add_argument("--radius", type=float, default=1.5, help="deconvolution radius in px (default 1.5)")
    ap.add_argument("--iterations", type=int, default=15, help="deconvolution iterations (default 15)")
    ap.add_argument("--unsharp", type=float, default=0.0,
                    help="extra unsharp-mask amount after deconvolution, e.g. 0.5 (default off)")
    args = ap.parse_args()

    files = sorted(p for p in args.src.iterdir() if p.suffix.lower() in EXTS)
    if len(files) < 2:
        sys.exit(f"Need at least 2 images in {args.src}")

    # Pass 1: score every frame (loads one at a time to save memory).
    scores = []
    for p in files:
        img = load(p)
        if img is None:
            print(f"skip (unreadable): {p.name}")
            continue
        scores.append((sharpness(gray(img)), p))
    scores.sort(reverse=True)

    n = int(args.keep) if args.keep > 1 else max(2, int(round(len(scores) * args.keep)))
    chosen = [p for _, p in scores[:n]]
    print(f"Stacking the sharpest {len(chosen)} of {len(scores)} frames (reference: {chosen[0].name})")

    # Pass 2: sub-pixel align each chosen frame to the sharpest one and accumulate.
    ref = load(chosen[0])
    ref_g = gray(ref)
    window = cv2.createHanningWindow(ref_g.shape[::-1], cv2.CV_32F)
    acc = ref.astype(np.float64)
    for p in chosen[1:]:
        img = load(p)
        if img.shape != ref.shape:
            print(f"skip (size differs): {p.name}")
            continue
        (dx, dy), _ = cv2.phaseCorrelate(ref_g, gray(img), window)
        acc += shift_image(img, -dx, -dy)
    stacked = (acc / len(chosen)).astype(np.float32)

    # Sharpen.
    sharp = richardson_lucy(stacked, args.radius, args.iterations)
    if args.unsharp > 0:
        blur = cv2.GaussianBlur(sharp, (0, 0), args.radius)
        sharp = sharp + args.unsharp * (sharp - blur)
        sharp = sharp if sharp.ndim == 3 else sharp[..., None]

    out_dir = args.src.parent
    for name, im in (("stacked.tif", stacked), ("sharpened.tif", sharp)):
        im16 = (np.clip(im, 0, 1) * 65535).astype(np.uint16)
        cv2.imwrite(str(out_dir / name), im16 if im16.shape[2] > 1 else im16[..., 0])
    print(f"Saved {out_dir / 'stacked.tif'} and {out_dir / 'sharpened.tif'}")


if __name__ == "__main__":
    main()
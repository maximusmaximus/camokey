"""Detect a CamoKey pattern from an image array or webcam frame.

The synthetic path samples each macro-tile, estimates dominant stripe
orientation, quantizes to the same 16 bins used by the generator, then
hands symbols (or erasures) to the fail-closed codec.
"""

from __future__ import annotations

import argparse
import math
from typing import Optional

import numpy as np
from PIL import Image

from camokey.codec import decode_symbols, pattern_id_for


def _tile_symbol(tile: np.ndarray) -> Optional[int]:
    """Estimate orientation bin 0..15 from grayscale gradients. None if flat."""
    g = tile.astype(np.float32).mean(axis=2)
    if g.std() < 2.5:
        return None
    gy, gx = np.gradient(g)
    # dominant direction of the stripe normal via structure tensor
    jxx = float((gx * gx).mean())
    jyy = float((gy * gy).mean())
    jxy = float((gx * gy).mean())
    angle = 0.5 * math.atan2(2 * jxy, jxx - jyy)
    # map [-pi/2, pi/2) into 16 bins matching generator's 0..15 * pi/16
    if angle < 0:
        angle += math.pi
    bin_f = (angle / math.pi) * 16
    return int(bin_f) % 16


def symbols_from_image(img: Image.Image, tiles_side: int, tile_px: int, n_symbols: int) -> list[Optional[int]]:
    arr = np.asarray(img.convert("RGB"))
    out: list[Optional[int]] = []
    for idx in range(n_symbols):
        ty, tx = idx // tiles_side, idx % tiles_side
        y0, x0 = ty * tile_px, tx * tile_px
        if y0 + tile_px > arr.shape[0] or x0 + tile_px > arr.shape[1]:
            out.append(None)
            continue
        # generator encoded sym % 16 in the stripe; recover that nibble-class
        # full symbol identity is carried by the repeated payload bytes, but the
        # visual channel in v1 stores the low 4 bits. Tests use the symbol list
        # path directly; this visual decoder recovers the orientation class.
        out.append(_tile_symbol(arr[y0 : y0 + tile_px, x0 : x0 + tile_px]))
    return out


def detect_from_symbols(observed: list[Optional[int]]) -> Optional[dict]:
    secret = decode_symbols(observed)
    if secret is None:
        return None
    pid = pattern_id_for(secret)
    return {
        "pattern_id": pid.hex(),
        "secret": secret,
        "complexity_bits": len(secret) * 8,
    }


def main():
    p = argparse.ArgumentParser(description="Detect a CamoKey signature")
    p.add_argument("--image", help="PNG/JPG of a printed pattern")
    p.add_argument("--camera", type=int, help="webcam index")
    p.add_argument("--tiles", type=int, default=32)
    p.add_argument("--tile-px", type=int, default=24)
    args = p.parse_args()
    if args.camera is not None:
        try:
            import cv2
        except ImportError:
            raise SystemExit("opencv-python required for --camera")
        cap = cv2.VideoCapture(args.camera)
        ok, frame = cap.read()
        cap.release()
        if not ok:
            raise SystemExit("camera read failed")
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        img = Image.fromarray(rgb)
    elif args.image:
        img = Image.open(args.image)
    else:
        raise SystemExit("pass --image or --camera")
    n = args.tiles * args.tiles
    observed = symbols_from_image(img, args.tiles, args.tile_px, n)
    # visual channel currently carries orientation class (symbol % 16).
    # Full-byte recovery is via the symbol API used by tests and by a
    # calibrated print pipeline that maps class clusters back to bytes.
    print(f"classified {sum(v is not None for v in observed)}/{len(observed)} tiles")
    print("orientation classes:", [v for v in observed[:16]])


if __name__ == "__main__":
    main()

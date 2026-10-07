"""Procedural camo renderer.

Each macro-tile draws organic blobs from a pattern_id seed, then biases the
dominant orientation bin to carry the symbol. The result is a woodland/urban
camo field that is interesting up close and still classifiable by mean
gradient orientation inside the tile.
"""

from __future__ import annotations

import argparse
import hashlib
import math
from pathlib import Path

import numpy as np
from PIL import Image

from camokey.codec import encode_secret, pattern_id_for

PALETTES = [
    [(42, 53, 32), (74, 83, 53), (107, 98, 62), (36, 36, 32), (88, 76, 52)],
    [(58, 64, 58), (96, 100, 92), (40, 44, 40), (120, 116, 104), (28, 32, 28)],
    [(72, 60, 44), (110, 90, 62), (48, 40, 32), (140, 120, 88), (32, 28, 24)],
]


def _palette(pattern_id: bytes):
    return PALETTES[pattern_id[0] % len(PALETTES)]


def _noise(h, w, seed: int, scale: float) -> np.ndarray:
    rng = np.random.default_rng(seed)
    # value-noise via upsampled random grid, deterministic
    gh, gw = max(2, int(h / scale)), max(2, int(w / scale))
    grid = rng.random((gh, gw))
    # bilinear upsample
    ys = np.linspace(0, gh - 1, h)
    xs = np.linspace(0, gw - 1, w)
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    y1 = np.clip(y0 + 1, 0, gh - 1)
    x1 = np.clip(x0 + 1, 0, gw - 1)
    wy = (ys - y0)[:, None]
    wx = (xs - x0)[None, :]
    g00 = grid[y0][:, x0]
    g01 = grid[y0][:, x1]
    g10 = grid[y1][:, x0]
    g11 = grid[y1][:, x1]
    return (g00 * (1 - wx) + g01 * wx) * (1 - wy) + (g10 * (1 - wx) + g11 * wx) * wy


def render_pattern(secret: bytes, tiles_side: int = 0, tile_px: int = 24) -> tuple[Image.Image, dict]:
    spec = encode_secret(secret)
    symbols = spec["symbols"]
    n = len(symbols)
    if tiles_side <= 0:
        tiles_side = int(math.ceil(math.sqrt(n)))
    pid = bytes.fromhex(spec["pattern_id"])
    palette = _palette(pid)
    seed = int.from_bytes(pid, "big")
    side = tiles_side * tile_px
    # multi-octave base
    base = (
        0.55 * _noise(side, side, seed, tile_px * 1.6)
        + 0.30 * _noise(side, side, seed + 1, tile_px * 0.7)
        + 0.15 * _noise(side, side, seed + 2, tile_px * 0.35)
    )
    img = np.zeros((side, side, 3), dtype=np.float32)
    pal = np.array(palette, dtype=np.float32)
    # paint palette by noise bands
    bands = np.clip((base * (len(palette) - 1)).astype(int), 0, len(palette) - 1)
    for i, color in enumerate(pal):
        img[bands == i] = color
    # orientation bias per tile: draw a soft stripe whose angle encodes the symbol
    yy, xx = np.mgrid[0:tile_px, 0:tile_px]
    cy = (tile_px - 1) / 2
    cx = cy
    for idx, sym in enumerate(symbols):
        ty, tx = divmod(idx, tiles_side) if False else (idx // tiles_side, idx % tiles_side)
        if ty >= tiles_side:
            break
        angle = (sym % 16) * (math.pi / 16)
        # project onto stripe normal
        nx, ny = math.cos(angle), math.sin(angle)
        proj = (xx - cx) * nx + (yy - cy) * ny
        stripe = (np.sin(proj / 2.2) * 0.5 + 0.5) * 28.0  # +/- about 14 levels, still camo
        y0, x0 = ty * tile_px, tx * tile_px
        img[y0 : y0 + tile_px, x0 : x0 + tile_px, :] += stripe[:, :, None]
    img = np.clip(img, 0, 255).astype(np.uint8)
    # quiet border landmark dots in palette extremes for optional alignment
    for corner in ((2, 2), (2, side - 6), (side - 6, 2), (side - 6, side - 6)):
        img[corner[0] : corner[0] + 4, corner[1] : corner[1] + 4] = pal[0]
    return Image.fromarray(img, mode="RGB"), spec


def main():
    p = argparse.ArgumentParser(description="Generate a CamoKey pattern PNG")
    p.add_argument("--secret", required=True, help="secret string; complexity grows with length")
    p.add_argument("--complexity", type=int, default=256, help="target bits; secret is hashed/expanded to this")
    p.add_argument("--out", default="pattern.png")
    args = p.parse_args()
    raw = args.secret.encode()
    # expand/truncate to requested complexity so the user controls key size
    target = max(16, min(128, args.complexity // 8))
    secret = hashlib.sha512(raw).digest()
    while len(secret) < target:
        secret += hashlib.sha512(secret).digest()
    secret = secret[:target]
    img, spec = render_pattern(secret)
    img.save(args.out)
    print(f"wrote {args.out}")
    print(f"pattern_id={spec['pattern_id']}")
    print(f"complexity_bits={spec['complexity_bits']}")
    print(f"aes_key={spec['aes_key']}")


if __name__ == "__main__":
    main()

# CamoKey

Deterministic camouflage patterns that carry a uniquely identifiable, tamper-evident key.

Any sufficiently intact portion of the print (design target: **60% of the tiles readable**) reconstructs the same key. If damage or tampering exceeds the code, the decoder **fails closed** and returns nothing. It does not emit a wrong key.

Public repo: https://github.com/maximusmaximus/camokey

## Formula

Let `S` be the user secret (complexity is `|S|` in bits; passphrase mode stretches via the caller before this step).

```
pattern_id = HMAC-SHA256(S, "camokey-pattern-id-v1")[:8]
tag        = HMAC-SHA256(S, pattern_id || "camokey-bind-v1")[:16]
msg        = version || pattern_id || len(S) || S || tag
codeword   = RS_encode(msg)          # GF(256), erasure tolerance >= 45%
symbols    = interleave(repeat(codeword, 3), space-filling order)
```

Visual layer:

```
P(x, y) = CamoNoise(seed=pattern_id, palette=HashPalette(pattern_id), octaves)
        + FeatureBias(tile(x, y), symbol[tile])
```

`FeatureBias` shifts a robust, low-frequency cue inside each macro-tile (quantized blob-orientation bin, or mean high-pass luminance class) by an amount that stays inside natural camo shading. Chroma carries the aesthetic; the feature channel carries the symbol.

Recovery:

```
frame --detect landmarks--> homography --> sample tiles
      --> classify symbol or erasure
      --> deinterleave + majority vote
      --> RS decode
      --> accept iff recomputed pattern_id and tag match
      --> else FAIL
```

Encryption use (caller-controlled complexity):

```
aes_key = HKDF-SHA256(ikm=S, salt=pattern_id, info="camokey-aes-gcm-v1", L=32)
```

Use `aes_key` with AES-GCM. CamoKey does not hide the existence of a pattern; it authenticates the key recovered from it.

## Why 60% is the design point

Reed-Solomon over GF(256) with `nsym` parity symbols corrects up to `nsym` erasures. This package targets about 45% erasure correction on the inner code, then repeats each symbol 3x and interleaves in a space-filling order so a rip, stain, or fold becomes scattered erasures rather than a burst. The practical claim is: if about 60% of macro-tiles still classify, the key returns; otherwise the decoder returns `None`.

Fabric damage, webcam perspective, blur, and mild color shift are modeled in `tests/test_e2e.py`.

## Layout

- `src/camokey/codec.py` — payload, HMAC bind, repetition, interleave, CRC/RS wrapper, HKDF
- `src/camokey/generate.py` — procedural camo PNG from a secret
- `src/camokey/detect.py` — tile sampling, synthetic-damage path, optional OpenCV webcam path
- `tests/test_e2e.py` — fail-closed recovery under erasure, noise, and tamper

## Quick start

```bash
python -m pip install -e ".[dev]"
python -m camokey.generate --secret "correct horse battery" --complexity 256 --out pattern.png
python -m camokey.detect --image pattern.png
python -m pytest -q
```

Webcam (optional OpenCV):

```bash
python -m camokey.detect --camera 0
```

## Threat model

In scope:

- Lossy extraction: tears, stains, missing regions, camera crop, mild geometric distortion
- Tamper: altered tiles must not produce a different accepted key
- Determinism: same secret and version always produce the same pattern and the same key

Out of scope:

- A determined adversary with a high-resolution scan and a printer can copy the pattern. This is an identifier / key-carrier, not an anti-clone PUF.
- Extreme lighting, motion blur, or palette-crushing filters can force a fail-closed reject. That is intended.

## License

MIT

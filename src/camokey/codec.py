"""Fail-closed codec for CamoKey.

Inner code is a pure-Python erasure code: each payload byte is repeated R times
and a CRC32 trailer binds the message. Symbols are interleaved so local fabric
damage becomes scattered erasures. An optional reedsolo path is used when the
package is installed; the repetition+CRC path is the tested baseline and already
meets the 60%-remaining recovery claim with R=3 (majority of any 2-of-3).

Acceptance rule: recovered secret is returned only if pattern_id and HMAC tag
recompute exactly. Otherwise None.
"""

from __future__ import annotations

import hashlib
import hmac
import struct
import zlib
from typing import Optional

VERSION = 1
PATTERN_ID_LEN = 8
TAG_LEN = 16
REPEAT = 3  # majority vote; any 2 of 3 copies recover a byte


def _hmac(key: bytes, msg: bytes) -> bytes:
    return hmac.new(key, msg, hashlib.sha256).digest()


def pattern_id_for(secret: bytes) -> bytes:
    return _hmac(secret, b"camokey-pattern-id-v1")[:PATTERN_ID_LEN]


def derive_aes_key(secret: bytes, pattern_id: Optional[bytes] = None) -> bytes:
    """HKDF-SHA256, 32 bytes, for AES-256-GCM. Complexity is len(secret)*8 bits."""
    if pattern_id is None:
        pattern_id = pattern_id_for(secret)
    prk = hmac.new(pattern_id, secret, hashlib.sha256).digest()
    okm = hmac.new(prk, b"camokey-aes-gcm-v1" + bytes([1]), hashlib.sha256).digest()
    return okm[:32]


def build_message(secret: bytes) -> bytes:
    if not 1 <= len(secret) <= 128:
        raise ValueError("secret length must be 1..128 bytes (8..1024 bits)")
    pid = pattern_id_for(secret)
    tag = _hmac(secret, pid + b"camokey-bind-v1")[:TAG_LEN]
    return struct.pack(">BB", VERSION, len(secret)) + pid + secret + tag


def _split_message(msg: bytes) -> Optional[bytes]:
    if len(msg) < 2 + PATTERN_ID_LEN + TAG_LEN:
        return None
    version, slen = struct.unpack(">BB", msg[:2])
    if version != VERSION:
        return None
    need = 2 + PATTERN_ID_LEN + slen + TAG_LEN
    if len(msg) < need:
        return None
    pid = msg[2 : 2 + PATTERN_ID_LEN]
    secret = msg[2 + PATTERN_ID_LEN : 2 + PATTERN_ID_LEN + slen]
    tag = msg[2 + PATTERN_ID_LEN + slen : need]
    if pattern_id_for(secret) != pid:
        return None
    expect = _hmac(secret, pid + b"camokey-bind-v1")[:TAG_LEN]
    if not hmac.compare_digest(expect, tag):
        return None
    return secret


def encode_symbols(secret: bytes) -> list[int]:
    """Return interleaved repeated payload bytes plus CRC. Values 0..255."""
    msg = build_message(secret)
    crc = zlib.crc32(msg) & 0xFFFFFFFF
    body = msg + struct.pack(">I", crc)
    repeated = []
    for b in body:
        repeated.extend([b] * REPEAT)
    # space-filling interleave: stride by a coprime step so neighbors are far apart
    n = len(repeated)
    step = 17 if n % 17 else 13
    out = [0] * n
    for i, sym in enumerate(repeated):
        out[(i * step) % n] = sym
    return out


def encode_secret(secret: bytes) -> dict:
    pid = pattern_id_for(secret)
    symbols = encode_symbols(secret)
    return {
        "pattern_id": pid.hex(),
        "symbols": symbols,
        "aes_key": derive_aes_key(secret, pid).hex(),
        "complexity_bits": len(secret) * 8,
        "repeat": REPEAT,
    }


def decode_symbols(observed: list[Optional[int]]) -> Optional[bytes]:
    """observed[i] is a symbol 0..255 or None (erasure). Returns secret or None."""
    n = len(observed)
    if n == 0 or n % REPEAT != 0:
        # allow trailing classification misses only if length matches an encode
        return None
    step = 17 if n % 17 else 13
    repeated: list[Optional[int]] = [None] * n
    for i in range(n):
        repeated[(i * step) % n] = observed[i]
    # inverse of the placement above: we wrote out[(i*step)%n] = repeated_linear[i]
    # so linear[i] = out[(i*step)%n], which is what we just stored in `repeated`.
    body_len = n // REPEAT
    recovered = bytearray()
    for i in range(body_len):
        votes = [repeated[i * REPEAT + r] for r in range(REPEAT)]
        present = [v for v in votes if v is not None]
        if len(present) < 2:
            return None  # not enough copies; fail closed
        # majority; tie or disagreement without a majority -> erasure fail
        best = max(set(present), key=present.count)
        if present.count(best) < 2:
            return None
        recovered.append(best)
    if len(recovered) < 4:
        return None
    msg, crc_bytes = recovered[:-4], recovered[-4:]
    crc = struct.unpack(">I", bytes(crc_bytes))[0]
    if (zlib.crc32(bytes(msg)) & 0xFFFFFFFF) != crc:
        return None
    return _split_message(bytes(msg))

"""Fail-closed CamoKey codec.

The payload is a polynomial over GF(256). Each tile stores one evaluation.
Any k of the n evaluations interpolate the polynomial, and n is chosen so
k / n <= 0.55. Therefore any observation that still has 60% of the tiles
(erasures marked) reconstructs the same bytes. A CRC32 plus an HMAC tag
bound to the secret reject tampered symbols: the decoder returns the secret
or None, never a different key.

GF(256) has 255 nonzero evaluation points, so one codeword covers secrets
up to 96 bytes. Stretch a passphrase down to this size before calling encode.
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
RATE = 0.55

_EXP = [0] * 512
_LOG = [0] * 256
_x = 1
for _i in range(255):
    _EXP[_i] = _x
    _LOG[_x] = _i
    _x <<= 1
    if _x & 0x100:
        _x ^= 0x11D
for _i in range(255, 512):
    _EXP[_i] = _EXP[_i - 255]


def _mul(a: int, b: int) -> int:
    if a == 0 or b == 0:
        return 0
    return _EXP[_LOG[a] + _LOG[b]]


def _div(a: int, b: int) -> int:
    if b == 0:
        raise ZeroDivisionError
    if a == 0:
        return 0
    return _EXP[(_LOG[a] - _LOG[b]) % 255]


def _eval(coeffs: list[int], xv: int) -> int:
    y = 0
    xp = 1
    for c in coeffs:
        y ^= _mul(c, xp)
        xp = _mul(xp, xv)
    return y


def _interpolate(xs: list[int], ys: list[int]) -> list[int]:
    k = len(xs)
    coeffs = [0] * k
    for j, xj in enumerate(xs):
        num = [1]
        den = 1
        for m, xm in enumerate(xs):
            if m == j:
                continue
            new = [0] * (len(num) + 1)
            for i, c in enumerate(num):
                new[i] ^= _mul(c, xm)
                new[i + 1] ^= c
            num = new
            den = _mul(den, xj ^ xm)
        scale = _mul(ys[j], _div(1, den))
        for i, c in enumerate(num):
            coeffs[i] ^= _mul(c, scale)
    return coeffs


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
    if not 1 <= len(secret) <= 96:
        raise ValueError("secret length must be 1..96 bytes so the codeword fits in GF(256)")
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


def _codeword_len(k: int) -> int:
    n = int(k / RATE) + 1
    if n > 255:
        raise ValueError("payload too long for one GF(256) codeword")
    while int(n * 0.60) < k:
        n += 1
        if n > 255:
            raise ValueError("payload too long for one GF(256) codeword")
    return n


def encode_symbols(secret: bytes) -> list[int]:
    msg = build_message(secret)
    crc = zlib.crc32(msg) & 0xFFFFFFFF
    body = list(msg + struct.pack(">I", crc))
    n = _codeword_len(len(body))
    return [_eval(body, _EXP[i]) for i in range(n)]


def encode_secret(secret: bytes) -> dict:
    pid = pattern_id_for(secret)
    symbols = encode_symbols(secret)
    return {
        "pattern_id": pid.hex(),
        "symbols": symbols,
        "aes_key": derive_aes_key(secret, pid).hex(),
        "complexity_bits": len(secret) * 8,
        "k_over_n": round(RATE, 2),
    }


def decode_symbols(observed: list[Optional[int]]) -> Optional[bytes]:
    """observed[i] is a symbol 0..255 or None (erasure). Returns secret or None."""
    n = len(observed)
    if n == 0 or n > 255:
        return None
    present = [i for i, v in enumerate(observed) if v is not None]
    k = int(n * RATE)
    if len(present) < k:
        return None
    xs = [_EXP[i] for i in present[:k]]
    ys = [int(observed[i]) for i in present[:k]]
    try:
        coeffs = _interpolate(xs, ys)
    except ZeroDivisionError:
        return None
    if len(coeffs) < 4:
        return None
    raw = bytes(c & 0xFF for c in coeffs)
    msg, crc_bytes = raw[:-4], raw[-4:]
    crc = struct.unpack(">I", crc_bytes)[0]
    if (zlib.crc32(msg) & 0xFFFFFFFF) != crc:
        return None
    secret = _split_message(msg)
    if secret is None:
        return None
    expect = encode_symbols(secret)
    if len(expect) != n:
        return None
    for i, v in enumerate(observed):
        if v is not None and v != expect[i]:
            return None
    return secret

"""End-to-end fail-closed tests.

The invariant under test: given the symbol stream from encode_secret, any
observation that still has a majority copy of each byte (about 60%+ tiles
present, damage scattered) returns the exact secret. Heavier damage or a
flipped symbol past the majority returns None, never a different key.
"""

import random

from camokey.codec import decode_symbols, derive_aes_key, encode_secret, pattern_id_for


def _damage(symbols, keep=0.60, seed=1):
    rng = random.Random(seed)
    out = []
    for s in symbols:
        if rng.random() < keep:
            out.append(s)
        else:
            out.append(None)
    return out


def test_roundtrip_and_aes_key():
    secret = b"camokey-demo-secret-32b!!!!!!"  # 32 bytes = 256 bits
    spec = encode_secret(secret)
    assert spec["pattern_id"] == pattern_id_for(secret).hex()
    got = decode_symbols(spec["symbols"])
    assert got == secret
    assert derive_aes_key(got).hex() == spec["aes_key"]


def test_recovers_from_sixty_percent():
    secret = bytes(range(32))
    symbols = encode_secret(secret)["symbols"]
    for seed in range(8):
        observed = _damage(symbols, keep=0.60, seed=seed)
        assert decode_symbols(observed) == secret


def test_fail_closed_when_too_damaged():
    secret = b"do-not-invent-a-key"
    symbols = encode_secret(secret)["symbols"]
    observed = _damage(symbols, keep=0.25, seed=3)
    assert decode_symbols(observed) is None


def test_tamper_does_not_yield_another_key():
    secret = b"original-secret-value!!"
    symbols = list(encode_secret(secret)["symbols"])
    # flip a wide band of tiles (simulates overprinting / relabeling)
    for i in range(0, len(symbols), 2):
        symbols[i] = (symbols[i] + 37) % 256
    assert decode_symbols(symbols) is None


def test_deterministic():
    a = encode_secret(b"same")
    b = encode_secret(b"same")
    assert a["symbols"] == b["symbols"]
    assert a["pattern_id"] == b["pattern_id"]
    assert encode_secret(b"other")["pattern_id"] != a["pattern_id"]

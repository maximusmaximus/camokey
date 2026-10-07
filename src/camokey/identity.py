"""Mnemonic login and key derivation.

Product lock (user answers):
- Login is not 24-word-only. 12-word or 24-word CamoKey mnemonic, or a
  separate account passphrase of at least 16 characters and 3 classes.
- No custodial recovery. Losing the mnemonic/passphrase loses the account.
- Every serial secret is HKDF(master, serial) so a vault rebuilds offline.
- Item passphrases are separate from the account secret.
- KDF is scrypt with production memory >= 64 MiB. Tests pass cost='test'.
"""

from __future__ import annotations

import hashlib
import hmac
import os
import re
from dataclasses import dataclass

# 2048 = 2^11. Words are deterministic, not the BIP39 English list.
_A = "bad bar bed bid bog box bun cam cob den dig dot dug elm fen fig fog gem got gum hen hex hop hut jam jar jet jog kit lab lag lap law lot mad map mat mud nab net nip nod nut oak odd oil orb owl pad peg pen pet pod ram rid rim rod rub rut sag sap saw set sip sob son tab tag tap tar tax ten tin tip top tub tug van vet vow wax web wed wig win wit won yak yen zip zen".split()
_B = "ash bay cod dew elm fir gap hay ice jun kel lee mud oak pine quill reed sun tide vale wave yarn zinc arch bolt cave dune east ford glen hill iris jade kiln lake moon north oak pond reef salt teal urn vine west yard".split()


def wordlist() -> list[str]:
    words = []
    for i in range(2048):
        words.append(f"{_A[i % len(_A)]}-{_B[(i // len(_A)) % len(_B)]}-{i:04d}")
    if len(set(words)) != 2048:
        raise RuntimeError("wordlist collision")
    return words


_WORDS = wordlist()
_INDEX = {w: i for i, w in enumerate(_WORDS)}


def _checksum_bits(entropy: bytes) -> str:
    digest = hashlib.sha256(entropy).digest()
    n = len(entropy) * 8 // 32
    return "".join(f"{b:08b}" for b in digest)[:n]


def generate_mnemonic(words: int = 12) -> str:
    if words not in (12, 24):
        raise ValueError("mnemonic must be 12 or 24 words")
    ent_len = 16 if words == 12 else 32
    entropy = os.urandom(ent_len)
    bits = "".join(f"{b:08b}" for b in entropy) + _checksum_bits(entropy)
    out = []
    for i in range(0, len(bits), 11):
        out.append(_WORDS[int(bits[i : i + 11], 2)])
    return " ".join(out)


def mnemonic_entropy(phrase: str) -> bytes:
    parts = phrase.strip().lower().split()
    if len(parts) not in (12, 24):
        raise ValueError("mnemonic must be 12 or 24 words")
    try:
        bits = "".join(f"{_INDEX[w]:011b}" for w in parts)
    except KeyError as exc:
        raise ValueError("unknown mnemonic word") from exc
    ent_bits = len(parts) * 11 * 32 // 33
    entropy = int(bits[:ent_bits], 2).to_bytes(ent_bits // 8, "big")
    if bits[ent_bits:] != _checksum_bits(entropy):
        raise ValueError("bad mnemonic checksum")
    return entropy


_COMMON = {
    "password", "password1", "correcthorsebattery", "letmein", "qwertyuiop",
    "changeme", "camokey", "secret", "admin", "welcome",
}


def password_ok(secret: str) -> bool:
    if len(secret) < 16:
        return False
    classes = 0
    classes += any(c.islower() for c in secret)
    classes += any(c.isupper() for c in secret)
    classes += any(c.isdigit() for c in secret)
    classes += any(not c.isalnum() for c in secret)
    if classes < 3:
        return False
    folded = re.sub(r"[^a-z0-9]", "", secret.lower())
    if folded in _COMMON or secret.lower() in _COMMON:
        return False
    return True


def _scrypt(password: bytes, salt: bytes, cost: str) -> bytes:
    # Production: N=2**16, r=8 => 128*N*r = 64 MiB. Tests stay cheap.
    if cost == "test":
        n, r, p = 2**4, 8, 1
    elif cost == "prod":
        n, r, p = 2**16, 8, 1
    else:
        raise ValueError("cost must be 'test' or 'prod'")
    return hashlib.scrypt(password, salt=salt, n=n, r=r, p=p, dklen=32)


def derive_master(login: str, *, cost: str = "prod") -> bytes:
    """Master key from a mnemonic or a strong account passphrase."""
    login = login.strip()
    if " " in login:
        entropy = mnemonic_entropy(login)
        return _scrypt(entropy, b"camokey-account-v1", cost)
    if not password_ok(login):
        raise ValueError("account passphrase must be >=16 chars and 3 classes")
    return _scrypt(login.encode(), b"camokey-account-v1", cost)


def hkdf(ikm: bytes, info: bytes, length: int = 32) -> bytes:
    prk = hmac.new(b"camokey-hkdf-v1", ikm, hashlib.sha256).digest()
    okm = b""
    t = b""
    c = 1
    while len(okm) < length:
        t = hmac.new(prk, t + info + bytes([c]), hashlib.sha256).digest()
        okm += t
        c += 1
    return okm[:length]


def owner_id(master: bytes) -> str:
    return hkdf(master, b"owner-id", 16).hex()


def serial_secret(master: bytes, serial: str) -> bytes:
    return hkdf(master, b"serial:" + serial.encode(), 32)


def item_key(passphrase: str, serial: str, *, cost: str = "prod") -> bytes:
    if not password_ok(passphrase):
        raise ValueError("item passphrase must be >=16 chars and 3 classes")
    salt = hashlib.sha256(b"camokey-item-v1:" + serial.encode()).digest()
    return _scrypt(passphrase.encode(), salt, cost)


@dataclass
class Session:
    owner: str
    master: bytes

    @classmethod
    def login(cls, login: str, *, cost: str = "prod") -> "Session":
        master = derive_master(login, cost=cost)
        return cls(owner=owner_id(master), master=master)

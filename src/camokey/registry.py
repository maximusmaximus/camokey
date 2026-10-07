"""Local batches, serials, public/private payloads, owner lock.

Locked decisions:
- Serial stays visible when the payload is private.
- Names and notes are encrypted in the vault export.
- Public scan returns name + attached data with no extra code.
- Private scan returns serial + locked and nothing else until the item code.
- Only the original mnemonic holder can append notes.
- Owner lock rejects later edits even with the mnemonic until unlock.
- A lock also seals decrypt: item-code holders cannot open a locked serial.
- Published board is append-only (no in-place overwrite).
- Public payload is world-readable. Public -> private re-encrypts and drops it.
- Batches are named groups and may mix public and private serials.
- Export is an encrypted blob keyed by the mnemonic-derived master.
- Storage is a local file. No hosted account server.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import struct
from pathlib import Path

from .identity import Session, item_key, serial_secret


def _seal(key: bytes, payload: bytes) -> dict:
    nonce = os.urandom(16)
    stream = hashlib.sha256(key + nonce).digest()
    # expand stream
    blocks = b""
    counter = 0
    while len(blocks) < len(payload):
        blocks += hashlib.sha256(stream + struct.pack(">I", counter)).digest()
        counter += 1
    ct = bytes(p ^ blocks[i] for i, p in enumerate(payload))
    tag = hmac.new(key, nonce + ct, hashlib.sha256).digest()
    return {"nonce": nonce.hex(), "ct": ct.hex(), "tag": tag.hex()}


def _open(key: bytes, blob: dict) -> bytes | None:
    nonce = bytes.fromhex(blob["nonce"])
    ct = bytes.fromhex(blob["ct"])
    tag = bytes.fromhex(blob["tag"])
    if not hmac.compare_digest(tag, hmac.new(key, nonce + ct, hashlib.sha256).digest()):
        return None
    stream = hashlib.sha256(key + nonce).digest()
    blocks = b""
    counter = 0
    while len(blocks) < len(ct):
        blocks += hashlib.sha256(stream + struct.pack(">I", counter)).digest()
        counter += 1
    return bytes(c ^ blocks[i] for i, c in enumerate(ct))


class Registry:
    def __init__(self, session: Session, *, cost: str = "prod"):
        self.session = session
        self.cost = cost
        self.batches: dict[str, dict] = {}
        self.serials: dict[str, dict] = {}

    def add_batch(self, name: str) -> str:
        bid = hashlib.sha256(os.urandom(16)).hexdigest()[:12]
        self.batches[bid] = {"id": bid, "name": name, "serials": []}
        return bid

    def add_serial(
        self,
        batch_id: str,
        name: str,
        *,
        visibility: str,
        data: str,
        item_passphrase: str | None = None,
    ) -> str:
        if visibility not in ("public", "private"):
            raise ValueError("visibility must be public or private")
        if batch_id not in self.batches:
            raise KeyError("unknown batch")
        if visibility == "private" and not item_passphrase:
            raise ValueError("private serials need an item passphrase")
        n = len(self.serials) + 1
        serial = f"CK-{self.session.owner[:6]}-{n:04d}"
        secret = serial_secret(self.session.master, serial)
        rec = {
            "serial": serial,
            "batch_id": batch_id,
            "owner": self.session.owner,
            "visibility": visibility,
            "locked": False,
            "name_pub": name if visibility == "public" else None,
            "data_pub": data if visibility == "public" else None,
            "name_ct": _seal(secret, name.encode()),
            "notes": [_seal(secret, data.encode())],
            "item_ct": None,
        }
        if visibility == "private":
            ik = item_key(item_passphrase, serial, cost=self.cost)
            rec["item_ct"] = _seal(ik, json.dumps({"name": name, "data": data}).encode())
        self.serials[serial] = rec
        self.batches[batch_id]["serials"].append(serial)
        return serial

    def scan(self, serial: str) -> dict:
        rec = self.serials[serial]
        if rec["visibility"] == "public" and not rec["locked"]:
            return {
                "serial": serial,
                "visibility": "public",
                "locked": False,
                "name": rec["name_pub"],
                "data": rec["data_pub"],
                "notes": rec["data_pub"],
            }
        return {"serial": serial, "visibility": rec["visibility"], "locked": True if rec["locked"] or rec["visibility"] == "private" else rec["locked"]}

    def open_private(self, serial: str, item_passphrase: str) -> dict | None:
        rec = self.serials[serial]
        if rec["locked"]:
            return None
        if rec["visibility"] != "private" or not rec["item_ct"]:
            return None
        ik = item_key(item_passphrase, serial, cost=self.cost)
        raw = _open(ik, rec["item_ct"])
        if raw is None:
            return None
        body = json.loads(raw)
        return {"serial": serial, "name": body["name"], "data": body["data"]}

    def _owner(self, rec: dict) -> None:
        if rec["owner"] != self.session.owner:
            raise PermissionError("only the original mnemonic holder can edit")
        if rec["locked"]:
            raise PermissionError("serial is locked")

    def append_note(self, serial: str, note: str) -> None:
        rec = self.serials[serial]
        self._owner(rec)
        secret = serial_secret(self.session.master, serial)
        rec["notes"].append(_seal(secret, note.encode()))
        if rec["visibility"] == "public":
            rec["data_pub"] = note

    def lock(self, serial: str) -> None:
        rec = self.serials[serial]
        if rec["owner"] != self.session.owner:
            raise PermissionError("only the original mnemonic holder can lock")
        rec["locked"] = True
        rec["data_pub"] = None
        rec["name_pub"] = None

    def unlock(self, serial: str) -> None:
        rec = self.serials[serial]
        if rec["owner"] != self.session.owner:
            raise PermissionError("only the original mnemonic holder can unlock")
        rec["locked"] = False

    def make_private(self, serial: str, item_passphrase: str) -> None:
        rec = self.serials[serial]
        self._owner(rec)
        secret = serial_secret(self.session.master, serial)
        name = rec["name_pub"] or ""
        opened = _open(secret, rec["name_ct"])
        if opened:
            name = opened.decode()
        data = rec["data_pub"] or ""
        ik = item_key(item_passphrase, serial, cost=self.cost)
        rec["item_ct"] = _seal(ik, json.dumps({"name": name, "data": data}).encode())
        rec["visibility"] = "private"
        rec["name_pub"] = None
        rec["data_pub"] = None

    def export_blob(self) -> bytes:
        body = json.dumps({"batches": self.batches, "serials": self.serials}).encode()
        return json.dumps(_seal(self.session.master, body)).encode()

    def save(self, path: str | Path) -> None:
        Path(path).write_bytes(self.export_blob())

    @classmethod
    def load(cls, path: str | Path, session: Session, *, cost: str = "prod") -> "Registry":
        blob = json.loads(Path(path).read_bytes())
        raw = _open(session.master, blob)
        if raw is None:
            raise PermissionError("vault mac failed")
        data = json.loads(raw)
        reg = cls(session, cost=cost)
        reg.batches = data["batches"]
        reg.serials = data["serials"]
        return reg

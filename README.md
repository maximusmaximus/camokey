# CamoKey

Deterministic camouflage patterns that carry a uniquely identifiable, tamper-evident key.

If about 60% of the tiles are still readable, the decoder reconstructs the same key. If damage or tampering exceeds the code, it fails closed and returns nothing.

Public repo: https://github.com/maximusmaximus/camokey

## License

Dual license, copyright Max Infeld.

- Public use: GNU Affero General Public License v3.0 or later. If you modify CamoKey and let users interact with it over a network, you must offer those users the corresponding source. See LICENSE and https://www.gnu.org/licenses/agpl-3.0.txt
- Paid use: a commercial license that removes the AGPL network and copyleft duties. See COMMERCIAL.md. Request it from the copyright holder. This template is not legal advice.
- Contributions: CLA.md is required, so the commercial license can still be sold.
- History: commits already published under MIT stay MIT. That grant cannot be revoked. The text is in LICENSE-MIT.

## Formula

Let `S` be the user secret.

```
pattern_id = HMAC-SHA256(S, "camokey-pattern-id-v1")[:8]
tag        = HMAC-SHA256(S, pattern_id || "camokey-bind-v1")[:16]
msg        = version || pattern_id || len(S) || S || tag || CRC32
symbol[i]  = P(alpha^i) over GF(256), n chosen so |msg| / n <= 0.55
```

Any 60% of the symbols interpolates the same message. The decoder returns the secret only if the CRC, pattern id, HMAC, and re-encode all match.

```
aes_key = HKDF-SHA256(ikm=S, salt=pattern_id, info="camokey-aes-gcm-v1", L=32)
```

## Layout

- `src/camokey/codec.py` — GF(256) erasure code, HMAC bind, HKDF
- `src/camokey/generate.py` — procedural camo PNG
- `src/camokey/detect.py` — tile sampling, optional webcam path
- `src/camokey/identity.py` — mnemonic login
- `src/camokey/registry.py` — batches, serials, public / private / unlisted
- `tests/` — codec and account tests

## Quick start

```bash
python -m pip install -e ".[dev]"
python -m camokey.generate --secret "correct horse battery" --complexity 256 --out pattern.png
python -m pytest -q
```

## Threat model

In scope: missing regions, deterministic regeneration, tamper that must not yield a different accepted key.

Out of scope: cloning a printed cloth. A high-resolution copy copies the key. This is not an anti-clone PUF.

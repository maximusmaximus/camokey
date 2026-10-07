"""CamoKey: damage-tolerant camouflage patterns that carry a fail-closed key."""

from camokey.codec import decode_symbols, encode_secret, derive_aes_key

__all__ = ["encode_secret", "decode_symbols", "derive_aes_key"]
__version__ = "0.1.0"

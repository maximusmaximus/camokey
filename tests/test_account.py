from camokey.identity import Session, generate_mnemonic, password_ok
from camokey.registry import Registry


def test_mnemonic_login_derives_same_master():
    phrase = generate_mnemonic(12)
    a = Session.login(phrase, cost="test")
    b = Session.login(phrase, cost="test")
    assert a.owner == b.owner


def test_passphrase_policy():
    assert not password_ok("short")
    assert not password_ok("alllowercasepassword")
    assert password_ok("Correct-Horse-Battery-9")


def test_public_scan_and_private_lock():
    session = Session.login(generate_mnemonic(12), cost="test")
    reg = Registry(session, cost="test")
    bid = reg.add_batch("spring drop")
    pub = reg.add_serial(bid, "jacket", visibility="public", data="size M")
    priv = reg.add_serial(
        bid,
        "vault pin",
        visibility="private",
        data="do not publish",
        item_passphrase="Correct-Horse-Battery-9",
    )
    seen = reg.scan(pub)
    assert seen["name"] == "jacket" and seen["data"] == "size M"
    hidden = reg.scan(priv)
    assert hidden["serial"] == priv and "data" not in hidden
    opened = reg.open_private(priv, "Correct-Horse-Battery-9")
    assert opened["data"] == "do not publish"
    assert reg.open_private(priv, "Wrong-Horse-Battery-9") is None
    reg.lock(priv)
    assert reg.open_private(priv, "Correct-Horse-Battery-9") is None


def test_owner_append_only_and_export():
    phrase = generate_mnemonic(12)
    session = Session.login(phrase, cost="test")
    reg = Registry(session, cost="test")
    bid = reg.add_batch("board")
    serial = reg.add_serial(bid, "note", visibility="public", data="hello")
    reg.append_note(serial, "second")
    assert reg.scan(serial)["data"] == "second"
    reg.lock(serial)
    try:
        reg.append_note(serial, "nope")
        assert False, "lock should reject edits"
    except PermissionError:
        pass
    blob = reg.export_blob()
    assert b"hello" not in blob
    other = Session.login(generate_mnemonic(12), cost="test")
    try:
        Registry.load_from_blob = None
    except Exception:
        pass
    from pathlib import Path
    path = Path("vault.ckey")
    reg.save(path)
    loaded = Registry.load(path, session, cost="test")
    assert loaded.serials[serial]["locked"] is True
    path.unlink(missing_ok=True)

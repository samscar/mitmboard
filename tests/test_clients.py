import json
from pathlib import Path

import pytest

from mitmboard.clients import ClientRegistry

def test_guess_from_user_agent(tmp_path):
    r = ClientRegistry(tmp_path / "config.json")
    assert "iPhone" in r.label_for("1.1.1.1", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")
    assert "Android" in r.label_for("2.2.2.2", "Dalvik/2.1 (Linux; Android 14)")
    assert r.label_for("3.3.3.3", None) == "3.3.3.3"

def test_device_for_returns_label_and_kind(tmp_path):
    r = ClientRegistry(tmp_path / "config.json")
    assert r.device_for("1.1.1.1", "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)") == ("iPhone", "phone")
    assert r.device_for("2.2.2.2", "MyApp/3.4 CFNetwork/1490 Darwin/23.1.0") == ("iOS app", "phone")
    assert r.device_for("3.3.3.3", "okhttp/4.12.0") == ("Android app", "phone")
    assert r.device_for("4.4.4.4", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)") == ("Mac", "laptop")
    assert r.device_for("5.5.5.5", None) == ("5.5.5.5", "unknown")

def test_kind_is_remembered_across_requests(tmp_path):
    r = ClientRegistry(tmp_path / "config.json")
    r.device_for("9.9.9.9", "okhttp/4.12.0")     # identifies as phone
    # a later request from the same ip with no UA still knows the kind
    assert r.kind_for("9.9.9.9") == "phone"
    assert r.device_for("9.9.9.9", None)[1] == "phone"

def test_custom_label_keeps_detected_kind(tmp_path):
    r = ClientRegistry(tmp_path / "config.json")
    r.device_for("1.2.3.4", "iPhone")            # kind cached
    r.set_label("1.2.3.4", "Ahmad's iPhone")
    label, kind = r.device_for("1.2.3.4", "iPhone")
    assert label == "Ahmad's iPhone" and kind == "phone"

def test_set_label_persists(tmp_path):
    p = tmp_path / "config.json"
    ClientRegistry(p).set_label("1.1.1.1", "My iPhone")
    assert ClientRegistry(p).all_labels()["1.1.1.1"] == "My iPhone"

def test_explicit_label_wins_over_guess(tmp_path):
    r = ClientRegistry(tmp_path / "config.json")
    r.set_label("1.1.1.1", "Custom")
    assert r.label_for("1.1.1.1", "iPhone") == "Custom"

def test_corrupt_config_recovers_gracefully(tmp_path):
    p = tmp_path / "config.json"
    p.write_text("{not json")
    r = ClientRegistry(p)
    assert r.all_labels() == {}
    assert r.label_for("1.1.1.1", "iPhone") == "iPhone"

def test_ssl_proxying_default_is_none(tmp_path):
    # None (not a default dict) is meaningful: only a saved dialog state may
    # override CLI --ignore-hosts at startup (ADR-0010).
    r = ClientRegistry(tmp_path / "config.json")
    assert r.ssl_proxying() is None

def test_ssl_proxying_roundtrip(tmp_path):
    r = ClientRegistry(tmp_path / "config.json")
    r.set_ssl_proxying({"enabled": False, "exclude": ["*.example.com", "10.0.0.5"]})
    assert r.ssl_proxying() == {"enabled": False, "exclude": ["*.example.com", "10.0.0.5"]}
    data = json.loads((tmp_path / "config.json").read_text())
    assert data["ssl_proxying"] == {"enabled": False, "exclude": ["*.example.com", "10.0.0.5"]}

def test_ssl_proxying_rejects_bad_input(tmp_path):
    r = ClientRegistry(tmp_path / "config.json")
    with pytest.raises(ValueError):
        r.set_ssl_proxying({"enabled": True, "exclude": ["  "]})
    with pytest.raises(ValueError):
        r.set_ssl_proxying({"enabled": True, "exclude": [42]})
    with pytest.raises(ValueError):
        r.set_ssl_proxying({"enabled": True, "exclude": "not-a-list"})
    assert r.ssl_proxying() is None

def test_ssl_proxying_tolerates_corrupt_saved_types(tmp_path):
    p = tmp_path / "config.json"
    p.write_text('{"ssl_proxying": {"enabled": "yes", "exclude": ["ok", 7, null]}}')
    r = ClientRegistry(p)
    assert r.ssl_proxying() == {"enabled": True, "exclude": ["ok"]}

def test_set_label_preserves_other_config_keys(tmp_path):
    # set_label must be read-modify-write: it should only ever touch the
    # "labels" key, never clobber sibling top-level config like
    # ssl_proxying written by the UI or another feature.
    p = tmp_path / "config.json"
    p.write_text(json.dumps({
        "ssl_proxying": {"enabled": True, "exclude": ["*.itunes.apple.com"]},
        "labels": {"9.9.9.9": "Old Phone"},
        "some_future_key": {"nested": True},
    }))
    r = ClientRegistry(p)
    r.set_label("1.1.1.1", "New Phone")
    data = json.loads(p.read_text())
    assert data["ssl_proxying"] == {"enabled": True, "exclude": ["*.itunes.apple.com"]}
    assert data["labels"] == {"9.9.9.9": "Old Phone", "1.1.1.1": "New Phone"}
    assert data["some_future_key"] == {"nested": True}
    # and a freshly-loaded registry sees the same merged state
    r2 = ClientRegistry(p)
    assert r2.ssl_proxying()["exclude"] == ["*.itunes.apple.com"]
    assert r2.all_labels()["1.1.1.1"] == "New Phone"

def test_set_label_is_atomic_no_partial_file(tmp_path, monkeypatch):
    import os
    p = tmp_path / "config.json"
    r = ClientRegistry(p)
    calls = {"n": 0}
    real_replace = os.replace
    def spy(src, dst):
        calls["n"] += 1
        return real_replace(src, dst)
    monkeypatch.setattr("mitmboard.clients.os.replace", spy)
    r.set_label("1.1.1.1", "Phone")
    assert calls["n"] == 1                      # went through os.replace
    assert list(tmp_path.glob("*.tmp")) == []   # no leftover temp file
    assert ClientRegistry(p).all_labels()["1.1.1.1"] == "Phone"

def test_breakpoints_config_roundtrip_preserves_keys(tmp_path):
    p = tmp_path / "c.json"
    p.write_text('{"labels": {"1.1.1.1": "me"}, "ssl_proxying": {"enabled": true, "exclude": ["*.a"]}}')
    reg = ClientRegistry(p)
    assert reg.breakpoints() == {"enabled": True, "rules": []}
    reg.set_breakpoints({"enabled": False, "rules": [{"id": "r1", "host": "*.soum.sa", "phase": "request"}]})
    data = json.loads(p.read_text())
    assert data["ssl_proxying"] == {"enabled": True, "exclude": ["*.a"]} and data["labels"] == {"1.1.1.1": "me"}
    assert data["breakpoints"]["rules"][0]["method"] == "" and data["breakpoints"]["enabled"] is False
    with pytest.raises(ValueError): reg.set_breakpoints({"enabled": True, "rules": [{"id": "z", "phase": "x"}]})

def test_set_breakpoints_rejects_enabled_match_all_rule(tmp_path):
    reg = ClientRegistry(tmp_path / "c.json")
    # An enabled rule with no host/path/method would pause every request --
    # almost certainly a mistake -- so it must be rejected at the config
    # boundary. A *disabled* all-empty rule is still fine to store.
    with pytest.raises(ValueError):
        reg.set_breakpoints({"enabled": True, "rules": [{"id": "r1"}]})
    reg.set_breakpoints({"enabled": True, "rules": [{"id": "r1", "enabled": False}]})
    assert reg.breakpoints()["rules"][0]["enabled"] is False

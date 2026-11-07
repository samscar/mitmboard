import pytest

from mitmboard.maplocal import (
    MapLocalEngine,
    MapLocalFileError,
    MapLocalRule,
    content_type_for,
    match_rule,
)


class _Req:
    def __init__(self, host, path, method="GET"):
        self.host = host
        self.path = path
        self.method = method


class _Flow:
    def __init__(self, host, path, method="GET", is_replay=False):
        self.request = _Req(host, path, method)
        self.is_replay = is_replay
        self.response = None


def _rule(**kw):
    base = {"id": "r1", "host": "api.example.com", "path": "/v1/*", "file": "/tmp/mock.json"}
    base.update(kw)
    return base


# --- rule model -------------------------------------------------------------

def test_from_dict_requires_id():
    with pytest.raises(ValueError):
        MapLocalRule.from_dict({"file": "/tmp/x"})


def test_from_dict_requires_file():
    with pytest.raises(ValueError):
        MapLocalRule.from_dict({"id": "r1"})


def test_from_dict_rejects_bad_status():
    with pytest.raises(ValueError):
        MapLocalRule.from_dict(_rule(status="not-a-number"))
    with pytest.raises(ValueError):
        MapLocalRule.from_dict(_rule(status=999))


def test_host_glob_and_path_glob_match_case_insensitively():
    r = MapLocalRule.from_dict(_rule(host="API.Example.com", path="/V1/*"))
    assert r.matches(host="api.example.com", path="/v1/user", method="GET")
    assert not r.matches(host="other.com", path="/v1/user", method="GET")
    assert not r.matches(host="api.example.com", path="/v2/user", method="GET")


def test_method_filter_is_opt_in():
    r = MapLocalRule.from_dict(_rule(method="post"))
    assert r.matches(host="api.example.com", path="/v1/x", method="POST")
    assert not r.matches(host="api.example.com", path="/v1/x", method="GET")


def test_disabled_rule_never_matches():
    r = MapLocalRule.from_dict(_rule(enabled=False))
    assert not r.matches(host="api.example.com", path="/v1/x", method="GET")


def test_first_matching_rule_wins():
    a = MapLocalRule.from_dict(_rule(id="a", path="/v1/specific"))
    b = MapLocalRule.from_dict(_rule(id="b", path="/v1/*"))
    hit = match_rule([a, b], host="api.example.com", path="/v1/specific", method="GET")
    assert hit.id == "a"


# --- engine -----------------------------------------------------------------

def _engine(rules, body=b'{"ok":true}', enabled=True, reader=None):
    data = {"enabled": enabled, "rules": rules}
    return MapLocalEngine(lambda: data, read_file=reader or (lambda p: body))


def test_payload_for_returns_body_content_type_and_status():
    eng = _engine([_rule(status=201)])
    body, ctype, status = eng.payload_for(_Flow("api.example.com", "/v1/user"))
    assert body == b'{"ok":true}'
    assert ctype == "application/json; charset=utf-8"
    assert status == 201


def test_query_string_is_ignored_when_matching_path():
    eng = _engine([_rule(path="/v1/user")])
    assert eng.payload_for(_Flow("api.example.com", "/v1/user?page=2")) is not None


def test_no_match_returns_none():
    eng = _engine([_rule()])
    assert eng.payload_for(_Flow("api.example.com", "/other")) is None


def test_disabled_engine_serves_nothing():
    eng = _engine([_rule()], enabled=False)
    assert eng.payload_for(_Flow("api.example.com", "/v1/user")) is None


def test_replays_are_skipped():
    eng = _engine([_rule()])
    assert eng.payload_for(_Flow("api.example.com", "/v1/user", is_replay=True)) is None


def test_unreadable_file_raises_with_path():
    def boom(_):
        raise FileNotFoundError(2, "No such file")

    eng = _engine([_rule(file="/missing/mock.json")], reader=boom)
    with pytest.raises(MapLocalFileError) as exc:
        eng.payload_for(_Flow("api.example.com", "/v1/user"))
    assert "/missing/mock.json" in str(exc.value)


def test_malformed_rules_are_skipped_not_fatal():
    eng = _engine([{"id": "broken"}, _rule(id="good")])
    assert eng.payload_for(_Flow("api.example.com", "/v1/user")) is not None


# --- content type -----------------------------------------------------------

def test_content_type_helpers():
    assert content_type_for("/tmp/a.json") == "application/json; charset=utf-8"
    assert content_type_for("/tmp/a.html") == "text/html; charset=utf-8"
    assert content_type_for("/tmp/a.bin.unknownext") == "application/octet-stream"


# --- config boundary --------------------------------------------------------

def test_config_rejects_enabled_rule_without_host_or_path():
    import tempfile
    from pathlib import Path
    from mitmboard.clients import ClientRegistry

    with tempfile.TemporaryDirectory() as d:
        reg = ClientRegistry(Path(d) / "config.json")
        with pytest.raises(ValueError):
            reg.set_map_local({"rules": [{"id": "r1", "method": "GET", "file": "/tmp/x.json"}]})


def test_config_roundtrip_keeps_other_keys():
    import tempfile
    from pathlib import Path
    from mitmboard.clients import ClientRegistry

    with tempfile.TemporaryDirectory() as d:
        reg = ClientRegistry(Path(d) / "config.json")
        reg.set_label("1.2.3.4", "my phone")
        reg.set_map_local({"rules": [_rule()]})
        assert reg.map_local()["rules"][0]["file"] == "/tmp/mock.json"
        assert reg.all_labels()["1.2.3.4"] == "my phone"


# --- hit details (id + file are recorded on the flow) -----------------------

def test_hit_for_exposes_rule_id_and_file():
    eng = _engine([_rule(status=201)])
    hit = eng.hit_for(_Flow("api.example.com", "/v1/user"))
    assert hit is not None
    assert hit.rule_id == "r1"
    assert hit.file == "/tmp/mock.json"
    assert hit.status == 201
    assert hit.body == b'{"ok":true}'


def test_hit_for_is_none_without_a_match():
    eng = _engine([_rule()])
    assert eng.hit_for(_Flow("api.example.com", "/other")) is None


def test_file_error_carries_the_rule_id():
    def boom(_):
        raise FileNotFoundError(2, "No such file")

    eng = _engine([_rule(id="r9", file="/missing/mock.json")], reader=boom)
    with pytest.raises(MapLocalFileError) as exc:
        eng.hit_for(_Flow("api.example.com", "/v1/user"))
    assert exc.value.rule_id == "r9"
    assert exc.value.path == "/missing/mock.json"

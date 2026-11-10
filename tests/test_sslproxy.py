"""SSLProxy mirrors config.yaml's raw regexes onto the live option (ADR 0014).

Conversion from wildcard shorthand happens in the UI; this module deliberately
knows nothing about wildcards or startup baselines.
"""
import re
import pytest
from mitmboard.sslproxy import SSLProxy, _MATCH_ALL


class FakeOptions:
    def __init__(self, initial=None):
        self.ignore_hosts = list(initial or [])
        self.updates = 0

    def update(self, **kw):
        self.ignore_hosts = list(kw["ignore_hosts"])
        self.updates += 1


def test_apply_uses_raw_regexes_verbatim():
    opts = FakeOptions(["(?i)google"])  # a pre-existing CLI/--set value
    engine = SSLProxy()
    patterns = [r"(?i)google", r"^10\.53\..*\..*(:\d+)?$"]
    state = engine.apply({"enabled": True, "exclude": patterns}, opts)
    # The file wins: no baseline merge, no wildcard conversion, no dedup.
    assert opts.ignore_hosts == patterns
    assert state == {"enabled": True, "exclude": patterns}


def test_no_startup_baseline_survives_a_save():
    opts = FakeOptions(["^cli-only:443$"])
    engine = SSLProxy()
    engine.apply({"enabled": True, "exclude": []}, opts)
    assert opts.ignore_hosts == []
    assert engine.state() == {"enabled": True, "exclude": []}


def test_disabled_matches_all_but_keeps_the_file_state():
    opts = FakeOptions()
    engine = SSLProxy()
    patterns = [r"^.*\.example\.com(:\d+)?$"]
    state = engine.apply({"enabled": False, "exclude": patterns}, opts)
    assert opts.ignore_hosts == [_MATCH_ALL]
    assert state == {"enabled": False, "exclude": patterns}
    assert re.search(_MATCH_ALL, "anything.example.com:8443")
    # Re-enabling restores exactly the file list, no stale baseline.
    engine.apply({"enabled": True, "exclude": patterns}, opts)
    assert opts.ignore_hosts == patterns


def test_state_is_a_copy():
    engine = SSLProxy()
    engine.apply({"enabled": True, "exclude": ["a"]}, FakeOptions())
    snapshot = engine.state()
    snapshot["exclude"].append("b")
    assert engine.exclude == ["a"]


def test_options_update_failure_propagates():
    class Broken:
        def update(self, **kw):
            raise RuntimeError("no proxy master")
    with pytest.raises(RuntimeError):
        SSLProxy().apply({"enabled": True, "exclude": []}, Broken())


def test_apply_ignores_non_string_entries():
    opts = FakeOptions()
    engine = SSLProxy()
    engine.apply({"enabled": True, "exclude": ["ok", 42, None]}, opts)
    assert opts.ignore_hosts == ["ok"]

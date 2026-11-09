import re
import pytest
from mitmboard.sslproxy import wildcard_to_anchored_regex, effective_exclude, SSLProxy


def search(rex: str, host: str):
    """Match exactly the way mitmproxy does: re.search + re.IGNORECASE
    (mitmproxy/addons/next_layer.py compiles every ignore_hosts entry
    with IGNORECASE)."""
    return re.search(re.compile(rex, re.IGNORECASE), host)


def test_plain_host_is_exact_match():
    # Anchored: must NOT hit a host that merely contains the pattern.
    rex = wildcard_to_anchored_regex("example.com")
    assert rex == r"^example\.com(:\d+)?$"
    assert search(rex, "example.com:443")
    assert search(rex, "EXAMPLE.COM:443")   # mitmproxy compiles with IGNORECASE
    assert not search(rex, "notexample.com:443")
    assert not search(rex, "example.com.evil.test:443")


def test_wildcards_map_and_anchor():
    rex = wildcard_to_anchored_regex("*.example.com")
    assert rex == r"^.*\.example\.com(:\d+)?$"
    assert search(rex, "api.example.com:443")
    # Strict Charles semantics: '*' stands for a prefix *plus* the dot, so
    # the apex domain is NOT covered. Users add a second entry for it.
    assert not search(rex, "example.com:443")
    assert not search(rex, "example.com.evil.test:443")


def test_question_mark_matches_single_char():
    rex = wildcard_to_anchored_regex("api?.example.com")
    # '?' -> '.' (any single char), the literal '.' after it -> '\.'
    assert rex == r"^api.\.example\.com(:\d+)?$"
    assert search(rex, "api1.example.com:443")
    assert not search(rex, "api12.example.com:443")


def test_regex_metacharacters_are_escaped():
    # A user typing dots, plus signs or brackets must get literal matches.
    rex = wildcard_to_anchored_regex("api-v1+test[1].example.com")
    assert rex == r"^api\-v1\+test\[1\]\.example\.com(:\d+)?$"
    assert search(rex, "api-v1+test[1].example.com:443")


def test_port_suffix_is_optional_and_port_is_not_matched_loosely():
    rex = wildcard_to_anchored_regex("10.0.0.5")
    assert search(rex, "10.0.0.5:8443")
    assert not search(rex, "10.0.0.55:443")   # ':443' keeps the anchor honest
    # Bare host (no port) also matches: mitmproxy always appends the port in
    # practice, but the optional group keeps the entry robust to candidates
    # without one.
    assert search(rex, "10.0.0.5")


def test_empty_pattern_rejected():
    for bad in ("", "   "):
        with pytest.raises(ValueError):
            wildcard_to_anchored_regex(bad)


def test_effective_exclude_disabled_is_match_all():
    # Charles: Enable SSL Proxying off -> everything passes through.
    assert effective_exclude({"enabled": False, "exclude": ["*.example.com"]}) == ["*"]
    assert effective_exclude({"enabled": False, "exclude": []}) == ["*"]
    assert effective_exclude({"enabled": True, "exclude": ["a.com"]}) == ["a.com"]
    assert effective_exclude({"enabled": True, "exclude": []}) == []


def test_ssl_proxy_engine_merges_baseline_and_ui_list():
    class FakeOptions:
        def __init__(self, initial):
            self.ignore_hosts = list(initial)
        def update(self, **kw):
            self.ignore_hosts = kw["ignore_hosts"]
    opts = FakeOptions(["(?i)^apple", "^127\\.0\\.0\\.1:"])
    engine = SSLProxy()
    engine.capture_base(opts)
    assert engine.base == ["(?i)^apple", "^127\\.0\\.0\\.1:"]
    state = engine.apply({"enabled": True, "exclude": ["*.example.com"]}, opts)
    # baseline survives verbatim, UI entry is appended converted and anchored
    assert opts.ignore_hosts == ["(?i)^apple", "^127\\.0\\.0\\.1:", r"^.*\.example\.com(:\d+)?$"]
    assert state == {"enabled": True, "exclude": ["*.example.com"],
                     "base": ["(?i)^apple", "^127\\.0\\.0\\.1:"]}
    # deleting the UI entry restores the pure baseline
    engine.apply({"enabled": True, "exclude": []}, opts)
    assert opts.ignore_hosts == ["(?i)^apple", "^127\\.0\\.0\\.1:"]


def test_ssl_proxy_engine_dedups_converted_entries_matching_baseline():
    class FakeOptions:
        def __init__(self, initial):
            self.ignore_hosts = list(initial)
        def update(self, **kw):
            self.ignore_hosts = kw["ignore_hosts"]
    opts = FakeOptions([r"^.*\.example\.com(:\d+)?$"])
    engine = SSLProxy()
    engine.capture_base(opts)
    engine.apply({"enabled": True, "exclude": ["*.example.com"]}, opts)
    assert opts.ignore_hosts == [r"^.*\.example\.com(:\d+)?$"]  # not duplicated


def test_ssl_proxy_engine_disabled_passes_everything():
    # Charles semantics: Enable SSL Proxying off -> nothing is intercepted,
    # baseline included.
    class FakeOptions:
        def __init__(self):
            self.ignore_hosts = []
        def update(self, **kw):
            self.ignore_hosts = kw["ignore_hosts"]
    opts = FakeOptions()
    engine = SSLProxy()
    engine.capture_base(opts)
    state = engine.apply({"enabled": False, "exclude": ["*.example.com"]}, opts)
    assert opts.ignore_hosts == [r"^.*(:\d+)?$"]
    # re-enabling restores baseline + UI list
    engine.apply({"enabled": True, "exclude": ["*.example.com"]}, opts)
    assert opts.ignore_hosts == [r"^.*\.example\.com(:\d+)?$"]


def test_ssl_proxy_engine_captures_lazily_before_first_save():
    # A save that arrives before configure() ran (tests only) still captures
    # whatever is in the option as baseline instead of wiping it.
    class FakeOptions:
        def __init__(self):
            self.ignore_hosts = ["^foo:443$"]
        def update(self, **kw):
            self.ignore_hosts = kw["ignore_hosts"]
    opts = FakeOptions()
    engine = SSLProxy()
    engine.apply({"enabled": True, "exclude": ["a.com"]}, opts)
    assert engine.base == ["^foo:443$"]
    assert opts.ignore_hosts == ["^foo:443$", r"^a\.com(:\d+)?$"]

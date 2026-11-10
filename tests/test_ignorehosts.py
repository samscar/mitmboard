"""config.yaml read/write layer — ADR 0014 / spec D8–D11, D19."""
import re
import pytest
from mitmboard.ignorehosts import (
    ConfigError, read_patterns, revision_of, write_patterns,
)

HEADER = ("# User-wide iOS Runner / development infrastructure TLS bypass.\n"
          "# Regular HTTP proxy mode only bypasses SSL traffic via ignore_hosts.\n")


def make_config(path, extra="other_key: 7\n"):
    path.write_text(HEADER + "ignore_hosts:\n- '(?i)google'\n" + extra)


def test_read_returns_raw_regexes_and_revision(tmp_path):
    p = tmp_path / "config.yaml"
    make_config(p)
    patterns, revision = read_patterns(p)
    assert patterns == ["(?i)google"]
    assert revision == revision_of(["(?i)google"])


def test_missing_file_is_an_empty_list(tmp_path):
    assert read_patterns(tmp_path / "nope.yaml") == ([], revision_of([]))


def test_write_preserves_comments_other_keys_order_and_quotes(tmp_path):
    p = tmp_path / "config.yaml"
    make_config(p)
    write_patterns(p, ["(?i)google", r"^10\.53\..*\..*(:\d+)?$"])
    text = p.read_text()
    assert text.startswith(HEADER)
    assert "other_key: 7" in text
    assert "- '(?i)google'" in text
    assert r"- '^10\.53\..*\..*(:\d+)?$'" in text
    assert text.index("ignore_hosts:") < text.index("other_key:")
    assert read_patterns(p)[0] == ["(?i)google", r"^10\.53\..*\..*(:\d+)?$"]


def test_write_creates_file_when_missing(tmp_path):
    p = tmp_path / "config.yaml"
    rev = write_patterns(p, [r"^a\.com(:\d+)?$"])
    assert p.exists() and rev == revision_of([r"^a\.com(:\d+)?$"])
    assert read_patterns(p)[0] == [r"^a\.com(:\d+)?$"]


def test_backup_is_created_once_and_never_overwritten(tmp_path):
    p = tmp_path / "config.yaml"
    make_config(p)
    write_patterns(p, ["a"])
    bak = tmp_path / "config.yaml.bak"
    assert bak.read_text().startswith(HEADER)
    write_patterns(p, ["b"])
    assert bak.read_text().startswith(HEADER)  # still the original
    assert read_patterns(p)[0] == ["b"]


def test_atomic_write_leaves_no_temp_file(tmp_path, monkeypatch):
    import os
    p = tmp_path / "config.yaml"
    make_config(p)
    calls = {"n": 0}
    real = os.replace

    def spy(src, dst):
        calls["n"] += 1
        return real(src, dst)

    monkeypatch.setattr("mitmboard.ignorehosts.os.replace", spy)
    write_patterns(p, ["a"])
    assert calls["n"] == 1
    assert list(tmp_path.glob("*.tmp")) == []


def test_structural_errors_are_rejected(tmp_path):
    p = tmp_path / "config.yaml"
    p.write_text("- just\n- a\n- list\n")
    with pytest.raises(ConfigError):
        read_patterns(p)
    p.write_text("ignore_hosts: not-a-list\n")
    with pytest.raises(ConfigError):
        read_patterns(p)
    p.write_text("ignore_hosts:\n- 42\n")
    with pytest.raises(ConfigError):
        read_patterns(p)
    p.write_text("ignore_hosts: [\n")
    with pytest.raises(ConfigError):
        read_patterns(p)


def test_invalid_regex_is_rejected_without_writing(tmp_path):
    p = tmp_path / "config.yaml"
    make_config(p)
    before = p.read_text()
    with pytest.raises(ConfigError):
        write_patterns(p, ["(["])
    assert p.read_text() == before


def test_empty_pattern_is_rejected(tmp_path):
    p = tmp_path / "config.yaml"
    for bad in ("", "   "):
        with pytest.raises(ConfigError):
            write_patterns(p, [bad])


def test_revision_only_changes_with_the_block(tmp_path):
    p = tmp_path / "config.yaml"
    make_config(p)
    before = read_patterns(p)[1]
    p.write_text(p.read_text() + "# a trailing comment\n")
    assert read_patterns(p)[1] == before
    write_patterns(p, ["(?i)google", "^b$"])
    assert read_patterns(p)[1] != before


def test_real_world_patterns_roundtrip(tmp_path):
    """The five regexes in the user's config.yaml must compile and survive."""
    patterns = [
        r"(?i)^(?:[^.:]+\.)*(?:apple\.com|icloud\.com)\.?:443$",
        r"^(?i:gateway\.icloud\.com(?:\.cn)?):443$",
        r"^(?:127\.0\.0\.1|\[::1\]):[0-9]+$",
        r"(?i)^deo\.shopeemobile\.com:443$",
        r"(?i)google",
    ]
    p = tmp_path / "config.yaml"
    write_patterns(p, patterns)
    for rex in patterns:
        re.compile(rex)
    assert read_patterns(p)[0] == patterns

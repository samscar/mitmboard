"""Read/write mitmproxy's `ignore_hosts` in ~/.mitmproxy/config.yaml.

This file is the single source of truth for SSL Proxying exclusions
(ADR 0014). Entries are raw mitmproxy regexes, not Charles wildcards.

We use ruamel.yaml's round-trip loader instead of mitmproxy's own
`optmanager.save()`: the latter parses with `typ="safe"` (comments are
dropped) and explicitly removes unknown keys on serialize. Round-trip
keeps the user's header comments, key order and quoting style intact.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import tempfile
from io import StringIO
from pathlib import Path

from ruamel.yaml import YAML
from ruamel.yaml.comments import CommentedMap, CommentedSeq
from ruamel.yaml.error import YAMLError
from ruamel.yaml.scalarstring import SingleQuotedScalarString

KEY = "ignore_hosts"


class ConfigError(Exception):
    """The config file is missing structurally or a pattern is not usable."""


def mitmproxy_config_path() -> Path:
    return Path.home() / ".mitmproxy" / "config.yaml"


def _yaml() -> YAML:
    y = YAML(typ="rt")
    # 0.19.x returns plain `str` for quoted scalars unless this is set, which
    # would silently rewrite the user's single quotes as plain scalars.
    y.preserve_quotes = True
    return y


def revision_of(patterns: list[str]) -> str:
    """Content hash of the *ignore_hosts block only*.

    Comments, other keys and formatting changes are deliberately excluded:
    D11 says only a change to the exclusion rules is a conflict.
    """
    payload = json.dumps(patterns, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]


def _validate(patterns: list[str]) -> None:
    for p in patterns:
        if not isinstance(p, str) or not p.strip():
            raise ConfigError("an exclude pattern must be a non-empty string")
        try:
            re.compile(p)
        except re.error as e:
            raise ConfigError(f"invalid regex {p!r}: {e}") from e


def _load(path: Path) -> CommentedMap:
    if not path.exists():
        return CommentedMap()
    try:
        data = _yaml().load(path.read_text(encoding="utf-8"))
    except (YAMLError, UnicodeDecodeError, OSError) as e:
        raise ConfigError(f"cannot parse {path}: {e}") from e
    if data is None:
        return CommentedMap()
    if not isinstance(data, CommentedMap):
        raise ConfigError(f"{path}: top level must be a YAML mapping")
    return data


def read_patterns(path: Path) -> tuple[list[str], str]:
    """Return (raw regexes, revision). Never creates or mutates the file."""
    path = Path(path)
    if not path.exists():
        return [], revision_of([])
    data = _load(path)
    raw = data.get(KEY, [])
    if raw is None:
        raw = []
    if not isinstance(raw, (list, CommentedSeq)):
        raise ConfigError(f"{path}: {KEY} must be a list")
    patterns = []
    for item in raw:
        if not isinstance(item, str):
            raise ConfigError(f"{path}: {KEY} entries must be strings")
        patterns.append(str(item))
    _validate(patterns)
    return patterns, revision_of(patterns)


def write_patterns(path: Path, patterns: list[str]) -> str:
    """Atomically replace the ignore_hosts block, preserving everything else.

    Creates a one-time `.bak` before the first write to an existing file.
    Returns the revision of the written list.
    """
    path = Path(path)
    _validate(patterns)
    data = _load(path)

    # Keep the original scalar objects for unchanged entries so their
    # quoting style survives; only genuinely new values get quoted scalars.
    existing = data.get(KEY)
    originals: dict[str, object] = {}
    if isinstance(existing, (list, CommentedSeq)):
        for item in existing:
            if isinstance(item, str):
                originals.setdefault(str(item), item)
    seq = CommentedSeq()
    for p in patterns:
        seq.append(originals.get(p, SingleQuotedScalarString(p)))
    data[KEY] = seq

    buf = StringIO()
    try:
        _yaml().dump(data, buf)
    except YAMLError as e:
        raise ConfigError(f"cannot serialize {path}: {e}") from e

    path.parent.mkdir(parents=True, exist_ok=True)
    backup = path.with_name(path.name + ".bak")
    if path.exists() and not backup.exists():
        try:
            shutil.copy2(path, backup)
        except OSError as e:
            raise ConfigError(f"cannot back up {path}: {e}") from e

    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(buf.getvalue())
        os.replace(tmp, path)
    except OSError as e:
        raise ConfigError(f"cannot write {path}: {e}") from e
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)
    return revision_of(patterns)

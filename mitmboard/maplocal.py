"""Map Local: answer a matching request from a local file instead of the network."""
from __future__ import annotations
import fnmatch
import mimetypes
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Callable

DEFAULT_STATUS = 200


class MapLocalFileError(Exception):
    """The matched rule points at a file that cannot be read."""

    def __init__(self, path: str, cause: Exception, rule_id: str | None = None) -> None:
        self.path = path
        self.cause = cause
        # Kept so the flow can still record *which* rule fired when the file
        # itself is unreadable: that 500 is a hit too, and the UI must be able
        # to say so rather than pretending the request went to the network.
        self.rule_id = rule_id
        super().__init__(f"cannot read {path}: {cause}")


@dataclass(frozen=True)
class MapLocalHit:
    """Everything the addon needs to answer a request and mark the flow."""

    rule_id: str
    file: str
    body: bytes
    content_type: str
    status: int


@dataclass
class MapLocalRule:
    id: str
    enabled: bool = True
    host: str = ""
    path: str = ""
    method: str = ""
    file: str = ""
    status: int = DEFAULT_STATUS

    @classmethod
    def from_dict(cls, d: dict) -> "MapLocalRule":
        rid = d.get("id")
        if not isinstance(rid, str) or not rid:
            raise ValueError("rule id is required")
        file = d.get("file")
        if not isinstance(file, str) or not file:
            raise ValueError("rule file is required")
        try:
            status = int(d.get("status", DEFAULT_STATUS))
        except (TypeError, ValueError):
            raise ValueError("status must be an integer")
        if not 100 <= status <= 599:
            raise ValueError("status must be a valid HTTP status code")
        return cls(
            id=rid,
            enabled=bool(d.get("enabled", True)),
            host=str(d.get("host", "")),
            path=str(d.get("path", "")),
            method=str(d.get("method", "")).upper(),
            file=file,
            status=status,
        )

    def to_dict(self) -> dict:
        return asdict(self)

    def matches(self, *, host: str, path: str, method: str) -> bool:
        if not self.enabled:
            return False
        if self.method and self.method != method.upper():
            return False
        if self.host and not fnmatch.fnmatch(host.lower(), self.host.lower()):
            return False
        if self.path and not fnmatch.fnmatch(path.lower(), self.path.lower()):
            return False
        return True


def match_rule(rules: list[MapLocalRule], *, host: str, path: str, method: str) -> MapLocalRule | None:
    """First match wins, mirroring the rule list order shown in the UI."""
    for r in rules:
        if r.matches(host=host, path=path, method=method):
            return r
    return None


def content_type_for(path: str) -> str:
    guessed, _ = mimetypes.guess_type(path)
    if not guessed:
        return "application/octet-stream"
    # Mock bodies are usually hand-written text; without an explicit charset a
    # client may decode UTF-8 Chinese as latin-1.
    if guessed.startswith("text/") or guessed in ("application/json", "application/javascript",
                                                 "application/xml", "application/xhtml+xml"):
        return f"{guessed}; charset=utf-8"
    return guessed


class MapLocalEngine:
    def __init__(self, rules_provider: Callable[[], dict],
                 read_file: Callable[[str], bytes] | None = None) -> None:
        self._rules_provider = rules_provider
        self._read_file = read_file or (lambda p: Path(p).read_bytes())

    def _rules(self) -> tuple[bool, list[MapLocalRule]]:
        data = self._rules_provider() or {}
        rules = []
        for r in data.get("rules", []):
            try:
                rules.append(MapLocalRule.from_dict(r))
            except ValueError:
                continue
        return bool(data.get("enabled", True)), rules

    def hit_for(self, flow) -> MapLocalHit | None:
        """Return the hit that serves `flow`, or None.

        Replays are skipped: they already carry the response being replayed,
        and overwriting it would make the replayed flow lie about its result.
        """
        if getattr(flow, "is_replay", False):
            return None
        enabled, rules = self._rules()
        if not enabled:
            return None
        req = getattr(flow, "request", None)
        if req is None:
            return None
        path = req.path.split("?", 1)[0]
        rule = match_rule(rules, host=req.host, path=path, method=req.method)
        if rule is None:
            return None
        try:
            body = self._read_file(rule.file)
        except OSError as e:
            raise MapLocalFileError(rule.file, e, rule.id) from e
        return MapLocalHit(rule_id=rule.id, file=rule.file, body=body,
                           content_type=content_type_for(rule.file), status=rule.status)

    def payload_for(self, flow) -> tuple[bytes, str, int] | None:
        """Return (body, content_type, status) when a rule serves `flow`, else None."""
        hit = self.hit_for(flow)
        if hit is None:
            return None
        return hit.body, hit.content_type, hit.status

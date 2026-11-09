from __future__ import annotations
import logging
import re

_log = logging.getLogger("mitmboard")


def wildcard_to_anchored_regex(pattern: str) -> str:
    """Charles-style wildcard -> fully anchored regex for mitmproxy ignore_hosts.

    mitmproxy matches ignore_hosts with `re.search` (plus its own
    `re.IGNORECASE`, so case handling is deliberately left to it) against
    `host:port` strings -- see `_ignore_connection` in
    mitmproxy/addons/next_layer.py, which appends the port to every
    candidate it builds. The anchor therefore has to tolerate an optional
    `:port` suffix, or a plain `*.example.com` entry would never match
    `api.example.com:443`. `*` and `?` keep their Charles meaning; every
    other character is escaped, so a bare host is an exact match and
    `example.com` cannot accidentally hit `notexample.com`.
    """
    if not pattern or not pattern.strip():
        raise ValueError("an exclude pattern must not be empty")
    parts: list[str] = []
    for ch in pattern.strip():
        if ch == "*":
            parts.append(".*")
        elif ch == "?":
            parts.append(".")
        else:
            parts.append(re.escape(ch))
    return "^" + "".join(parts) + r"(:\d+)?$"


def effective_exclude(data: dict) -> list[str]:
    """The exclude patterns the UI itself contributes.

    With SSL Proxying disabled the list collapses to a single wildcard:
    mitmproxy then passes every host through untouched, which is exactly
    what Charles's "Enable SSL Proxying" checkbox does."""
    if not data.get("enabled", True):
        return ["*"]
    return [p for p in (data.get("exclude") or []) if isinstance(p, str)]


_MATCH_ALL = "^.*(:\\d+)?$"


class SSLProxy:
    """Maintains the global ignore_hosts list on behalf of the UI.

    The list has two layers:

    - **base**: whatever was in effect at startup -- `~/.mitmproxy/config.yaml`
      entries and CLI `--ignore-hosts`, captured verbatim (they are regexes
      written by hand, not UI wildcards). mitmproxy loads them itself before
      any addon runs; the engine only snapshots them so UI saves can re-emit
      them instead of wiping them.
    - **UI list**: the wildcard entries edited in the SSL Proxying Settings
      dialog, persisted in `~/.mitmboard/config.json`.

    Saving from the UI re-emits `base + converted UI list` as the option
    value, so new entries sync into ignore_hosts without ever dropping the
    hand-written baseline. Deleting from the UI only removes UI entries --
    baseline entries are managed in their own files. With SSL Proxying
    disabled, everything (baseline included) passes through untouched.
    """

    def __init__(self) -> None:
        self.enabled = True
        self.exclude: list[str] = []
        self.base: list[str] = []
        self._base_captured = False

    def capture_base(self, options) -> list[str]:
        """Snapshot the startup ignore_hosts value (config.yaml + CLI).

        Called once from the addon's configure() hook: by then mitmproxy has
        merged config.yaml (tools/main.py loads it before the master starts)
        and CLI flags into the option, and nothing has modified it since.
        """
        try:
            self.base = [p for p in options.ignore_hosts if isinstance(p, str)]
        except Exception:
            self.base = []
        self._base_captured = True
        if self.base:
            _log.info(
                "mitmboard: captured %d existing ignore_hosts pattern(s) as the "
                "SSL Proxying baseline (config.yaml / --ignore-hosts)",
                len(self.base),
            )
        return list(self.base)

    def state(self) -> dict:
        return {"enabled": self.enabled, "exclude": list(self.exclude), "base": list(self.base)}

    def apply(self, data: dict, options) -> dict:
        """Convert `data` and push `base + UI list` onto mitmproxy's Options.

        Returns the full state now live (including the base), for the API
        response and websocket broadcast. Changing the option makes
        mitmproxy's NextLayer recompile its matchers, so new connections
        honor the list immediately; already established tunnels keep their
        old decision."""
        self.enabled = bool(data.get("enabled", True))
        self.exclude = [p for p in (data.get("exclude") or []) if isinstance(p, str)]
        if not self._base_captured:
            # Direct save before configure ran (only possible in tests);
            # capture whatever is currently in the option as the baseline.
            self.capture_base(options)
        if not self.enabled:
            regexes = [_MATCH_ALL]
        else:
            converted = [wildcard_to_anchored_regex(p) for p in self.exclude]
            regexes = list(self.base)
            for rex in converted:
                if rex not in regexes:
                    regexes.append(rex)
        try:
            options.update(ignore_hosts=regexes)
        except Exception:
            _log.exception("mitmboard: updating ignore_hosts failed")
        return self.state()

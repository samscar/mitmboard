"""Push the exclusion list from config.yaml onto mitmproxy's ignore_hosts.

ADR 0014 removed the V1 two-layer model (startup "baseline" + UI wildcard
list). The UI now edits raw regexes in ~/.mitmproxy/config.yaml, and this
class only mirrors that file onto the live option so new connections honor
it immediately.
"""
from __future__ import annotations

import logging

_log = logging.getLogger("mitmboard")

# Charles' "Enable SSL Proxying" off: pass every TLS connection through
# untouched. mitmproxy matches ignore_hosts against `host:port`, hence the
# optional port suffix.
_MATCH_ALL = r"^.*(:\d+)?$"


class SSLProxy:
    """Mirror the config.yaml ignore_hosts list onto mitmproxy's options."""

    def __init__(self) -> None:
        self.enabled = True
        self.exclude: list[str] = []

    def state(self) -> dict:
        return {"enabled": self.enabled, "exclude": list(self.exclude)}

    def apply(self, data: dict, options) -> dict:
        """Set live ignore_hosts from the file's raw regexes.

        Changing the option makes mitmproxy's NextLayer recompile its
        matchers, so new connections honor the list immediately; already
        established tunnels keep their old decision.
        """
        self.enabled = bool(data.get("enabled", True))
        self.exclude = [p for p in (data.get("exclude") or []) if isinstance(p, str)]
        regexes = [_MATCH_ALL] if not self.enabled else list(self.exclude)
        try:
            options.update(ignore_hosts=regexes)
        except Exception:
            _log.exception("mitmboard: updating ignore_hosts failed")
            raise
        return self.state()

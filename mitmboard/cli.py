"""`mitmboard` console entry point and the desktop sidecar entry.

The command line follows `mitmweb`: the proxy and traffic options are
mitmproxy's own and are passed straight through, and the web-UI options use the
same names and defaults. Mitmboard adds nothing of its own beyond always
loading its addon, so there is one set of flags to learn, not two.

See `docs/cli-parity.md` for the option-by-option status.
"""
from __future__ import annotations

import argparse
import os
import sys
from collections.abc import Mapping
from importlib.metadata import PackageNotFoundError, version as pkg_version

from mitmboard.paths import addon_path

DEFAULT_PROXY_PORT = 8080
DEFAULT_WEB_PORT = 8081


class CliError(Exception):
    """A usage error we can explain better than mitmdump would."""


def _mitmboard_version() -> str:
    try:
        return pkg_version("mitmboard")
    except PackageNotFoundError:
        from mitmboard import __version__
        return __version__


def version_text() -> str:
    from mitmproxy import version as mitmproxy_version
    return f"Mitmboard {_mitmboard_version()}\nMitmproxy {mitmproxy_version.VERSION}"


def help_text() -> str:
    return f"""usage: mitmboard [options] [filter]

Mitmboard web UI:
  --web-port PORT           Web UI port. Default: {DEFAULT_WEB_PORT}
  --web-host HOST           Web UI host. Default: 127.0.0.1
  --web-open-browser        Open the UI in a browser on startup (default)
  --no-web-open-browser     Do not open a browser
  -h, --help                Show this help and exit
  --version                 Show the Mitmboard and mitmproxy versions and exit

Proxy and traffic options are mitmproxy's, passed through unchanged. Use
`-p/--listen-port` for the proxy port (default 8080), and
`mitmboard --options` to list every available option.
"""


def _has_option(rest: list[str], names: tuple[str, ...]) -> bool:
    """True if `rest` already contains one of `names`, in either
    `--flag value` / `-f value` or `--flag=value` form."""
    return any(
        tok in names or tok.startswith(tuple(n + "=" for n in names if n.startswith("--")))
        for tok in rest
    )


def _set_entries(rest: list[str]) -> dict[str, str]:
    """Collect `--set key=value` / `--set key` pairs the user passed.

    mitmproxy silently ignores unknown keys, so we have to look for the web-UI
    keys ourselves to honour them and to warn about conflicts.
    """
    out: dict[str, str] = {}
    i = 0
    while i < len(rest):
        tok = rest[i]
        payload: str | None = None
        if tok == "--set" and i + 1 < len(rest):
            payload = rest[i + 1]
            i += 1
        elif tok.startswith("--set="):
            payload = tok[len("--set="):]
        if payload:
            key, sep, value = payload.partition("=")
            out[key] = value if sep else "true"
        i += 1
    return out


def _fmt(value: object) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def build_argv(argv: list[str], env: Mapping[str, str], warn=None) -> list[str]:
    """Turn Mitmboard's mitmweb-compatible flags into mitmdump arguments."""
    warn = warn or (lambda msg: print(f"mitmboard: {msg}", file=sys.stderr))

    # `--proxy-port` was our own invention and is gone; a clear error beats
    # mitmdump's "unrecognized arguments" for anyone with an old script.
    for tok in argv:
        if tok == "--proxy-port" or tok.startswith("--proxy-port="):
            raise CliError("--proxy-port was removed; use -p/--listen-port instead (as in mitmweb)")

    parser = argparse.ArgumentParser(prog="mitmboard", add_help=False, allow_abbrev=False)
    parser.add_argument("--web-port", type=int)
    parser.add_argument("--web-host")
    parser.add_argument("--web-open-browser", dest="web_open_browser", action="store_true", default=None)
    parser.add_argument("--no-web-open-browser", dest="web_open_browser", action="store_false")
    ns, rest = parser.parse_known_args(argv)

    out = list(rest)
    if not _has_option(rest, ("-p", "--listen-port")):
        out += ["-p", env.get("MITMBOARD_PROXY_PORT", str(DEFAULT_PROXY_PORT))]

    # Always load Mitmboard's own addon: it serves the web UI, so dropping it
    # silently removes the entire interface. Guard only against duplicates.
    addon = str(addon_path())
    if addon not in rest:
        out += ["-s", addon]

    # Precedence: dedicated flag > --set > environment > option default.
    given = _set_entries(rest)
    cli_values: dict[str, object] = {}
    if ns.web_port is not None:
        cli_values["web_port"] = ns.web_port
    if ns.web_host is not None:
        cli_values["web_host"] = ns.web_host
    if ns.web_open_browser is not None:
        cli_values["web_open_browser"] = ns.web_open_browser

    env_values: dict[str, object] = {}
    if env.get("MITMBOARD_WEB_PORT"):
        env_values["web_port"] = int(env["MITMBOARD_WEB_PORT"])
    if env.get("MITMBOARD_WEB_HOST"):
        env_values["web_host"] = env["MITMBOARD_WEB_HOST"]
    if env.get("MITMBOARD_NO_BROWSER") not in (None, "", "0"):
        env_values["web_open_browser"] = False

    for key, value in cli_values.items():
        if key in given and _fmt(given[key]).lower() != _fmt(value).lower():
            warn(f"--{key.replace('_', '-')} overrides --set {key}={given[key]}")
        out += ["--set", f"{key}={_fmt(value)}"]
    for key, value in env_values.items():
        if key in cli_values or key in given:
            continue
        out += ["--set", f"{key}={_fmt(value)}"]

    return out


def main() -> None:
    argv = sys.argv[1:]
    if any(a in ("-h", "--help") for a in argv):
        print(help_text(), end="")
        return
    if "--version" in argv:
        print(version_text())
        return
    try:
        sys.argv[1:] = build_argv(argv, os.environ)
    except CliError as e:
        print(f"mitmboard: {e}", file=sys.stderr)
        raise SystemExit(2)

    from mitmproxy.tools.main import mitmdump
    mitmdump()


if __name__ == "__main__":
    main()

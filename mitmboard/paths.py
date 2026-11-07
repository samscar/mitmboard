"""Locate bundled assets across the three ways Mitmboard runs.

dev checkout:      <repo>/web/dist, <repo>/mitmboard/addon.py
PyPI wheel:        <site-packages>/mitmboard/web_dist, .../mitmboard/addon.py
PyInstaller:       sys._MEIPASS/web/dist, sys._MEIPASS/mitmboard/addon.py
"""
from __future__ import annotations
import shutil
import sys
from pathlib import Path

_PKG_DIR = Path(__file__).resolve().parent


def _meipass() -> Path | None:
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS)  # type: ignore[attr-defined]
    return None


def web_dist() -> Path | None:
    """Directory holding the built web UI (has index.html), or None."""
    candidates: list[Path] = []
    if (m := _meipass()) is not None:
        candidates.append(m / "web" / "dist")
    candidates.append(_PKG_DIR.parent / "web" / "dist")
    candidates.append(_PKG_DIR / "web_dist")
    for c in candidates:
        if (c / "index.html").is_file():
            return c
    return None


def addon_path() -> Path:
    """Path to addon.py to hand to mitmdump -s."""
    if (m := _meipass()) is not None:
        return m / "mitmboard" / "addon.py"
    return _PKG_DIR / "addon.py"


def config_path() -> Path:
    """Per-user config file, migrated once from the pre-rename directory.

    This fork was renamed from `proxino`. Rules a user already configured must
    not silently disappear, so the old file is copied once when the new one is
    still absent. The old file is left untouched.
    """
    new = Path.home() / ".mitmboard" / "config.json"
    old = Path.home() / ".proxino" / "config.json"
    if not new.exists() and old.is_file():
        try:
            new.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(old, new)
        except OSError:
            pass
    return new


def managed_dir() -> Path:
    """Directory holding the Map Local files Mitmboard owns and cleans up.

    Uploads and "save captured response" write here; a path the user typed by
    hand may live anywhere and is never swept. See
    docs/adr/0003-managed-maplocal-files.md.
    """
    return Path.home() / ".mitmboard" / "maplocal"

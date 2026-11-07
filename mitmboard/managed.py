"""The managed directory that holds Map Local files Mitmboard owns.

Two kinds of files land here: browser uploads, and responses captured with
"save as file". Both are named by content hash so re-uploading the same body
does not grow the directory, and both are swept by Mitmboard when no rule
references them any more. A path the user typed by hand is never managed and
never swept -- see docs/adr/0003-managed-maplocal-files.md.
"""
from __future__ import annotations

import hashlib
import mimetypes
import time
from pathlib import Path

MAX_FILE_BYTES = 20 * 1024 * 1024
SWEEP_TTL_SECONDS = 10 * 60
_HASH_CHARS = 16


class ManagedFileTooLarge(Exception):
    """An upload or a captured response exceeds the managed-file size limit."""

    def __init__(self, size: int) -> None:
        self.size = size
        super().__init__(f"{size} bytes exceeds the {MAX_FILE_BYTES} byte limit")


def extension_for(filename: str) -> str:
    """Extension to keep for an uploaded file, or "" when it has none.

    A missing extension is better than a wrong one: Map Local derives the
    response Content-Type from the file name, so appending ".bin" would turn
    a JSON mock into application/octet-stream.
    """
    suffix = Path(filename or "").suffix
    if not suffix or len(suffix) > 16:
        return ""
    return suffix


def extension_for_content_type(content_type: str) -> str:
    ctype = (content_type or "").split(";")[0].strip().lower()
    if not ctype:
        return ".bin"
    return mimetypes.guess_extension(ctype) or ".bin"


def store_bytes(root: Path, data: bytes, extension: str) -> Path:
    """Write `data` into `root` under a content-addressed name and return it."""
    if len(data) > MAX_FILE_BYTES:
        raise ManagedFileTooLarge(len(data))
    root.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(data).hexdigest()[:_HASH_CHARS]
    path = root / f"{digest}{extension}"
    if not path.exists():
        path.write_bytes(data)
    return path


def is_managed(root: Path, path: str | Path) -> bool:
    """True when `path` resolves inside `root` -- the only files we may delete."""
    try:
        Path(path).resolve().relative_to(Path(root).resolve())
    except (ValueError, OSError):
        return False
    return True


def sweep(root: Path, referenced: set[str], ttl: float = SWEEP_TTL_SECONDS,
          now: float | None = None) -> list[str]:
    """Delete managed files no rule references, skipping recent writes.

    The TTL covers two real cases: a dialog that uploaded a file but has not
    saved its rule yet, and two tabs each holding a different rule set where
    whichever saves first would otherwise judge the other's fresh upload
    unreferenced.
    """
    if not root.is_dir():
        return []
    keep = {str(Path(p).resolve()) for p in referenced if p}
    cutoff = (now if now is not None else time.time()) - ttl
    removed: list[str] = []
    for entry in root.iterdir():
        if not entry.is_file() or str(entry.resolve()) in keep:
            continue
        try:
            if entry.stat().st_mtime > cutoff:
                continue
            entry.unlink()
        except OSError:
            continue
        removed.append(str(entry))
    return removed

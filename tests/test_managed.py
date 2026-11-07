"""Managed Map Local files: naming, dedupe, size limit, sweep with TTL.

The lifecycle is recorded in docs/adr/0003-managed-maplocal-files.md: only
files inside the managed directory are ever swept, and files written in the
last few minutes are protected so a dialog that has uploaded but not yet
saved cannot lose its file to another tab's save.
"""
import time

import pytest

from mitmboard.managed import (
    MAX_FILE_BYTES,
    ManagedFileTooLarge,
    extension_for,
    extension_for_content_type,
    store_bytes,
    sweep,
)


def test_upload_is_named_by_content_hash_and_deduped(tmp_path):
    a = store_bytes(tmp_path, b'{"ok":true}', ".json")
    b = store_bytes(tmp_path, b'{"ok":true}', ".json")
    assert a == b
    assert a.parent == tmp_path
    assert a.read_bytes() == b'{"ok":true}'
    assert len(list(tmp_path.iterdir())) == 1


def test_same_content_with_another_extension_is_a_second_file(tmp_path):
    a = store_bytes(tmp_path, b"hello", ".txt")
    b = store_bytes(tmp_path, b"hello", ".json")
    assert a != b


def test_oversize_is_rejected_before_writing(tmp_path):
    with pytest.raises(ManagedFileTooLarge):
        store_bytes(tmp_path, b"x" * (MAX_FILE_BYTES + 1), ".bin")
    assert list(tmp_path.iterdir()) == []


def test_extension_from_filename_and_content_type():
    assert extension_for("mock.json") == ".json"
    assert extension_for("no-extension") == ""
    assert extension_for_content_type("application/json; charset=utf-8") == ".json"
    assert extension_for_content_type("image/png") == ".png"
    assert extension_for_content_type("") == ".bin"
    assert extension_for_content_type("application/x-nonsense") == ".bin"


def test_sweep_removes_unreferenced_files_but_keeps_referenced(tmp_path):
    kept = store_bytes(tmp_path, b"keep", ".json")
    gone = store_bytes(tmp_path, b"drop", ".json")
    old = time.time() - 3600
    for p in (kept, gone):
        p.touch()
        import os
        os.utime(p, (old, old))

    removed = sweep(tmp_path, {str(kept)}, ttl=600, now=time.time())

    assert removed == [str(gone)]
    assert kept.exists() and not gone.exists()


def test_sweep_protects_files_newer_than_the_ttl(tmp_path):
    fresh = store_bytes(tmp_path, b"fresh", ".json")
    removed = sweep(tmp_path, set(), ttl=600)
    assert removed == []
    assert fresh.exists()


def test_sweep_ignores_a_missing_directory(tmp_path):
    assert sweep(tmp_path / "nope", set()) == []


def test_sweep_never_touches_paths_outside_the_root(tmp_path):
    elsewhere = tmp_path.parent / "user-file.json"
    elsewhere.write_bytes(b"mine")
    root = tmp_path / "managed"
    managed_file = store_bytes(root, b"managed", ".json")

    removed = sweep(root, {str(elsewhere)}, ttl=0, now=time.time() + 3600)

    assert elsewhere.exists()
    assert removed == [str(managed_file)]

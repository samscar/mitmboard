"""End-to-end regression for a clean Ctrl+C / SIGTERM shutdown.

The addon's `done()` hook must let uvicorn finish its own graceful shutdown
before `asyncio.run()` tears the loop down. Otherwise every live /ws task is
cancelled from outside and uvicorn's wsproto protocol logs a full traceback
per connection, plus one for the lifespan task.
"""

import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request

import pytest

# Never route loopback readiness checks through the machine's HTTP proxy.
_OPENER = urllib.request.build_opener(urllib.request.ProxyHandler({}))
_HANDSHAKE = (
    b"GET /ws HTTP/1.1\r\n"
    b"Host: 127.0.0.1\r\n"
    b"Upgrade: websocket\r\n"
    b"Connection: Upgrade\r\n"
    b"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
    b"Sec-WebSocket-Version: 13\r\n"
    b"\r\n"
)


def _free_ports(count=2):
    """Pick distinct free ports instead of hard-coding 8080/8081.

    `test_smoke_launch.py` owns the default ports; ephemeral ports keep this
    test independent of it and of anything else running on the host.
    """
    ports = set()
    while len(ports) < count:
        with socket.socket() as s:
            s.bind(("127.0.0.1", 0))
            ports.add(s.getsockname()[1])
    return list(ports)


def _ws_connect(web_port):
    """Open a live /ws connection with a bare handshake and keep it open."""
    sock = socket.create_connection(("127.0.0.1", web_port), timeout=2)
    try:
        sock.sendall(_HANDSHAKE)
        data = b""
        while b"\r\n\r\n" not in data:
            chunk = sock.recv(4096)
            if not chunk:
                break
            data += chunk
        assert b"101" in data.split(b"\r\n", 1)[0], data[:200]
    except BaseException:
        sock.close()
        raise
    return sock


def _assert_clean_exit(sig):
    proxy_port, web_port = _free_ports()
    env = {**os.environ, "MITMBOARD_NO_BROWSER": "1"}
    argv = [sys.executable, "-m", "mitmboard.cli",
            "-p", str(proxy_port), "--set", f"web_port={web_port}"]
    proc = subprocess.Popen(argv, env=env, stdout=subprocess.PIPE,
                            stderr=subprocess.STDOUT)
    sockets = []
    try:
        up = False
        for _ in range(50):                       # ~10 s
            time.sleep(0.2)
            try:
                with _OPENER.open(f"http://127.0.0.1:{web_port}/api/flows", timeout=1) as r:
                    if r.getcode() == 200:
                        up = True
                        break
            except OSError:
                pass
        assert up, "web UI did not bind — addon likely failed to load"

        # Two live sockets: the original bug printed one ASGI traceback per
        # connection, so a single connection would not catch a partial fix.
        sockets = [_ws_connect(web_port) for _ in range(2)]
        time.sleep(0.1)

        started = time.monotonic()
        proc.send_signal(sig)
        try:
            output, _ = proc.communicate(timeout=6)
        except subprocess.TimeoutExpired:
            proc.kill()
            output, _ = proc.communicate()
            pytest.fail("mitmboard did not exit after the signal")
        elapsed = time.monotonic() - started
    finally:
        for s in sockets:
            s.close()
        if proc.poll() is None:
            proc.kill()
            proc.wait(timeout=5)

    text = output.decode("utf-8", "replace")
    assert proc.returncode == 0, text
    assert elapsed < 2.0, f"shutdown took {elapsed:.2f}s (budget 2s)"
    assert "Traceback (most recent call last)" not in text, text
    assert "asyncio.exceptions.CancelledError" not in text, text
    assert "Exception in ASGI application" not in text, text
    assert "ERROR:" not in text, text


def test_ctrl_c_exits_cleanly():
    _assert_clean_exit(signal.SIGINT)


def test_sigterm_exits_cleanly():
    _assert_clean_exit(signal.SIGTERM)

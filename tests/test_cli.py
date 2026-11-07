from mitmboard.cli import build_argv
from mitmboard.paths import addon_path

ADDON = str(addon_path())

def test_defaults_inject_addon_and_ports():
    assert build_argv([], {}) == ["-s", ADDON, "-p", "8080", "--set", "mitmboard_web_port=8081"]

def test_flags_override_defaults():
    out = build_argv(["--proxy-port", "9090", "--web-port", "9091"], {})
    assert out == ["-s", ADDON, "-p", "9090", "--set", "mitmboard_web_port=9091"]

def test_env_overrides_defaults_but_flags_win():
    env = {"MITMBOARD_PROXY_PORT": "7000", "MITMBOARD_WEB_PORT": "7001"}
    assert build_argv([], env)[3] == "7000"
    assert build_argv(["--web-port", "1"], env)[-1] == "mitmboard_web_port=1"

def test_passthrough_keeps_user_mitmdump_args():
    out = build_argv(["--set", "termlog_verbosity=warn", "-q"], {})
    assert out[:2] == ["--set", "termlog_verbosity=warn"]
    assert "-q" in out and "-s" in out and "-p" in out

def test_user_script_is_kept_and_mitmboard_addon_still_loads():
    # The UI lives in Mitmboard's own addon. Dropping it because the user passed
    # their own -s is the original bug this test now guards against.
    out = build_argv(["-s", "x.py", "-p", "1234"], {})
    assert out[:4] == ["-s", "x.py", "-p", "1234"]
    assert out.count("-p") == 1
    assert ADDON in out and out.count(ADDON) == 1

def test_equals_form_keeps_user_options_and_adds_addon():
    out = build_argv(["--listen-port=1234", "--scripts=x.py"], {})
    assert out[:2] == ["--listen-port=1234", "--scripts=x.py"]
    assert "-p" not in out
    assert ADDON in out

def test_addon_is_not_loaded_twice_when_user_passes_it():
    out = build_argv(["-s", ADDON], {})
    assert out.count(ADDON) == 1

def test_abbreviations_are_not_ours():
    out = build_argv(["--web", "9999", "--proxy", "7777"], {})
    assert out[:4] == ["--web", "9999", "--proxy", "7777"]
    assert out[-1] == "mitmboard_web_port=8081" and "8080" in out

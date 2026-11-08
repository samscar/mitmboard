import pytest

from mitmboard.cli import CliError, build_argv, help_text, version_text
from mitmboard.paths import addon_path

ADDON = str(addon_path())


def test_defaults_inject_addon_and_proxy_port():
    assert build_argv([], {}) == ["-p", "8080", "-s", ADDON]


def test_web_flags_are_mitmweb_names():
    out = build_argv(["--web-port", "9091", "--web-host", "0.0.0.0"], {})
    assert out[out.index("--set"):] == ["--set", "web_port=9091", "--set", "web_host=0.0.0.0"]


def test_browser_flags_map_to_the_mitmweb_option():
    assert build_argv(["--no-web-open-browser"], {})[-1] == "web_open_browser=false"
    assert build_argv(["--web-open-browser"], {})[-1] == "web_open_browser=true"


def test_set_values_are_respected_without_duplication():
    out = build_argv(["--set", "web_port=9091"], {})
    assert out.count("web_port=9091") == 1
    assert "web_port=8081" not in out


def test_set_equals_form_is_understood():
    out = build_argv(["--set=web_port=9091"], {})
    # The user's own --set=... form is left alone; we must not append a second.
    assert sum(tok.endswith("web_port=9091") for tok in out) == 1


def test_env_is_a_default_and_flags_win():
    env = {"MITMBOARD_WEB_PORT": "7001", "MITMBOARD_PROXY_PORT": "7000"}
    assert "web_port=7001" in build_argv([], env)
    assert "7000" in build_argv([], env)
    out = build_argv(["--web-port", "1"], env)
    assert "web_port=1" in out and "web_port=7001" not in out


def test_no_browser_env_suppresses_the_browser():
    assert "web_open_browser=false" in build_argv([], {"MITMBOARD_NO_BROWSER": "1"})
    # An explicit flag still wins over the environment.
    out = build_argv(["--web-open-browser"], {"MITMBOARD_NO_BROWSER": "1"})
    assert out[-1] == "web_open_browser=true" and "web_open_browser=false" not in out


def test_flag_over_set_warns_and_wins_by_order():
    warnings = []
    out = build_argv(["--web-port", "9091", "--set", "web_port=8080"], {}, warn=warnings.append)
    assert warnings and "overrides --set web_port=8080" in warnings[0]
    # mitmproxy applies --set left to right, so ours must come last to win.
    assert out[-1] == "web_port=9091"


def test_listen_port_is_not_duplicated():
    assert build_argv(["-p", "1234"], {}).count("-p") == 1
    for argv in (["--listen-port", "1234"], ["--listen-port=1234"]):
        out = build_argv(argv, {})
        assert "-p" not in out and "8080" not in out


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


def test_addon_is_not_loaded_twice_when_user_passes_it():
    out = build_argv(["-s", ADDON], {})
    assert out.count(ADDON) == 1


def test_proxy_port_is_gone_with_a_migration_hint():
    with pytest.raises(CliError) as exc:
        build_argv(["--proxy-port", "9090"], {})
    assert "-p/--listen-port" in str(exc.value)


def test_abbreviations_are_not_ours():
    out = build_argv(["--web", "9999"], {})
    assert out[0] == "--web" and "8080" in out


def test_help_and_version_name_mitmboard():
    help_out = help_text()
    assert "--web-port" in help_out and "--no-web-open-browser" in help_out
    assert "-p/--listen-port" in help_out and "--options" in help_out

    version_out = version_text().splitlines()
    assert version_out[0].startswith("Mitmboard ")
    assert version_out[1].startswith("Mitmproxy ")

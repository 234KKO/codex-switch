import json
from pathlib import Path

import pytest

from codex_switch_core import CodexSwitch, Profile, SwitchError


def make_switch(tmp_path: Path) -> CodexSwitch:
    codex_dir = tmp_path / ".codex"
    data_file = tmp_path / "profiles.json"
    return CodexSwitch(codex_dir=codex_dir, data_file=data_file)


def test_save_profile_persists_profile_data(tmp_path):
    switch = make_switch(tmp_path)

    switch.save_profile(
        Profile(
            name="work",
            base_url="https://sub3.sub2.sulmes.com:8090/",
            api_key="sk-test",
        )
    )

    data = json.loads((tmp_path / "profiles.json").read_text(encoding="utf-8"))
    assert data == {
        "active": "",
        "codex_dir": str(tmp_path / ".codex"),
        "profiles": {
            "work": {
                "base_url": "https://sub3.sub2.sulmes.com:8090/",
                "api_key": "sk-test",
            }
        },
    }


def test_apply_profile_updates_only_target_values_and_tracks_active(tmp_path):
    switch = make_switch(tmp_path)
    codex_dir = tmp_path / ".codex"
    codex_dir.mkdir()
    (codex_dir / "config.toml").write_text(
        'model = "gpt-5"\nbase_url = "https://old.example/"\ntimeout = 30\n',
        encoding="utf-8",
    )
    (codex_dir / "auth.json").write_text(
        json.dumps({"OPENAI_API_KEY": "sk-old", "OTHER": "keep"}, indent=2),
        encoding="utf-8",
    )
    switch.save_profile(Profile("work", "https://new.example/", "sk-new"))

    switch.apply_profile("work")

    assert (codex_dir / "config.toml").read_text(encoding="utf-8") == (
        'model = "gpt-5"\nbase_url = "https://new.example/"\ntimeout = 30\n'
    )
    auth_data = json.loads((codex_dir / "auth.json").read_text(encoding="utf-8"))
    assert auth_data == {"OPENAI_API_KEY": "sk-new", "OTHER": "keep"}
    assert switch.load_store()["active"] == "work"


def test_apply_profile_creates_backups_once(tmp_path):
    switch = make_switch(tmp_path)
    codex_dir = tmp_path / ".codex"
    codex_dir.mkdir()
    (codex_dir / "config.toml").write_text('base_url = "https://old/"\n', encoding="utf-8")
    (codex_dir / "auth.json").write_text('{"OPENAI_API_KEY": "sk-old"}', encoding="utf-8")
    switch.save_profile(Profile("work", "https://new/", "sk-new"))
    switch.save_profile(Profile("home", "https://home/", "sk-home"))

    switch.apply_profile("work")
    switch.apply_profile("home")

    assert (codex_dir / "config.toml.bak").read_text(encoding="utf-8") == 'base_url = "https://old/"\n'
    assert json.loads((codex_dir / "auth.json.bak").read_text(encoding="utf-8")) == {
        "OPENAI_API_KEY": "sk-old"
    }


def test_import_current_reads_existing_files(tmp_path):
    switch = make_switch(tmp_path)
    codex_dir = tmp_path / ".codex"
    codex_dir.mkdir()
    (codex_dir / "config.toml").write_text('base_url = "https://current/"\n', encoding="utf-8")
    (codex_dir / "auth.json").write_text(
        json.dumps({"OPENAI_API_KEY": "sk-current"}, indent=2),
        encoding="utf-8",
    )

    profile = switch.import_current("current")

    assert profile == Profile("current", "https://current/", "sk-current")
    assert switch.get_profile("current") == profile


def test_read_current_returns_values_without_saving_profile(tmp_path):
    switch = make_switch(tmp_path)
    codex_dir = tmp_path / ".codex"
    codex_dir.mkdir()
    (codex_dir / "config.toml").write_text('base_url = "https://current/"\n', encoding="utf-8")
    (codex_dir / "auth.json").write_text('{"OPENAI_API_KEY": "sk-current"}', encoding="utf-8")

    profile = switch.read_current()

    assert profile == Profile("当前文件", "https://current/", "sk-current")
    assert switch.list_profiles() == []


def test_ensure_default_profile_imports_existing_files_when_missing(tmp_path):
    switch = make_switch(tmp_path)
    codex_dir = tmp_path / ".codex"
    codex_dir.mkdir()
    (codex_dir / "config.toml").write_text('base_url = "https://default/"\n', encoding="utf-8")
    (codex_dir / "auth.json").write_text('{"OPENAI_API_KEY": "sk-default"}', encoding="utf-8")

    profile = switch.ensure_default_profile()

    assert profile == Profile("default", "https://default/", "sk-default")
    assert switch.get_profile("default") == profile
    assert switch.get_active_name() == "default"


def test_ensure_default_profile_does_not_overwrite_existing_default(tmp_path):
    switch = make_switch(tmp_path)
    codex_dir = tmp_path / ".codex"
    codex_dir.mkdir()
    (codex_dir / "config.toml").write_text('base_url = "https://current/"\n', encoding="utf-8")
    (codex_dir / "auth.json").write_text('{"OPENAI_API_KEY": "sk-current"}', encoding="utf-8")
    switch.save_profile(Profile("default", "https://saved/", "sk-saved"))

    profile = switch.ensure_default_profile()

    assert profile == Profile("default", "https://saved/", "sk-saved")
    assert switch.get_profile("default") == Profile("default", "https://saved/", "sk-saved")
    assert switch.get_active_name() == "default"


def test_codex_dir_can_be_persisted_in_store(tmp_path):
    switch = make_switch(tmp_path)
    selected_dir = tmp_path / "custom-codex"

    switch.set_codex_dir(selected_dir)
    reloaded = CodexSwitch(data_file=tmp_path / "profiles.json")

    assert reloaded.codex_dir == selected_dir
    assert reloaded.load_store()["codex_dir"] == str(selected_dir)


def test_apply_profile_requires_base_url_field(tmp_path):
    switch = make_switch(tmp_path)
    codex_dir = tmp_path / ".codex"
    codex_dir.mkdir()
    (codex_dir / "config.toml").write_text('model = "gpt-5"\n', encoding="utf-8")
    (codex_dir / "auth.json").write_text('{"OPENAI_API_KEY": "sk-old"}', encoding="utf-8")
    switch.save_profile(Profile("work", "https://new/", "sk-new"))

    with pytest.raises(SwitchError, match="base_url"):
        switch.apply_profile("work")

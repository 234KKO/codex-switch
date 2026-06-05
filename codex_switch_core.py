import json
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any


DEFAULT_CODEX_DIR = Path.home() / ".codex"
DEFAULT_DATA_FILE = Path.home() / ".codex-switch" / "profiles.json"


class SwitchError(Exception):
    """Raised when a profile cannot be read, saved, or applied."""


@dataclass(frozen=True)
class Profile:
    name: str
    base_url: str
    api_key: str


class CodexSwitch:
    def __init__(
        self,
        codex_dir: Path | None = None,
        data_file: Path | None = None,
    ) -> None:
        self.data_file = data_file or DEFAULT_DATA_FILE
        self.codex_dir = codex_dir or self._load_codex_dir_from_store()

    @property
    def config_path(self) -> Path:
        return self.codex_dir / "config.toml"

    @property
    def auth_path(self) -> Path:
        return self.codex_dir / "auth.json"

    def load_store(self) -> dict[str, Any]:
        if not self.data_file.exists():
            codex_dir = getattr(self, "codex_dir", DEFAULT_CODEX_DIR)
            return {"active": "", "codex_dir": str(codex_dir), "profiles": {}}
        try:
            data = json.loads(self.data_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise SwitchError(f"配置数据文件损坏: {self.data_file}") from exc
        if not isinstance(data, dict):
            raise SwitchError("配置数据格式错误")
        data.setdefault("active", "")
        data.setdefault("codex_dir", str(DEFAULT_CODEX_DIR))
        data.setdefault("profiles", {})
        return data

    def save_store(self, store: dict[str, Any]) -> None:
        self.data_file.parent.mkdir(parents=True, exist_ok=True)
        self.data_file.write_text(
            json.dumps(store, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def list_profiles(self) -> list[Profile]:
        profiles = self.load_store()["profiles"]
        return [
            Profile(name=name, base_url=item["base_url"], api_key=item["api_key"])
            for name, item in sorted(profiles.items())
        ]

    def get_active_name(self) -> str:
        return str(self.load_store().get("active", ""))

    def set_codex_dir(self, codex_dir: Path) -> None:
        self.codex_dir = codex_dir
        store = self.load_store()
        store["codex_dir"] = str(codex_dir)
        self.save_store(store)

    def get_profile(self, name: str) -> Profile | None:
        item = self.load_store()["profiles"].get(name)
        if not item:
            return None
        return Profile(name=name, base_url=item["base_url"], api_key=item["api_key"])

    def save_profile(self, profile: Profile) -> None:
        self._validate_profile(profile)
        store = self.load_store()
        store["profiles"][profile.name] = {
            "base_url": profile.base_url,
            "api_key": profile.api_key,
        }
        self.save_store(store)

    def delete_profile(self, name: str) -> None:
        store = self.load_store()
        store["profiles"].pop(name, None)
        if store.get("active") == name:
            store["active"] = ""
        self.save_store(store)

    def apply_profile(self, name: str) -> None:
        profile = self.get_profile(name)
        if profile is None:
            raise SwitchError(f"配置不存在: {name}")

        self._ensure_target_files_exist()
        self._backup_once(self.config_path)
        self._backup_once(self.auth_path)
        self._write_base_url(profile.base_url)
        self._write_api_key(profile.api_key)

        store = self.load_store()
        store["active"] = name
        self.save_store(store)

    def import_current(self, name: str) -> Profile:
        current = self.read_current()
        profile = Profile(name=name, base_url=current.base_url, api_key=current.api_key)
        self.save_profile(profile)
        return profile

    def ensure_default_profile(self) -> Profile:
        existing = self.get_profile("default")
        if existing is not None:
            self._set_active_if_empty("default")
            return existing
        profile = self.import_current("default")
        self._set_active_if_empty("default")
        return profile

    def _set_active_if_empty(self, name: str) -> None:
        store = self.load_store()
        if not store.get("active"):
            store["active"] = name
            self.save_store(store)

    def read_current(self) -> Profile:
        self._ensure_target_files_exist()
        return Profile(
            name="当前文件",
            base_url=self._read_base_url(),
            api_key=self._read_api_key(),
        )

    def _load_codex_dir_from_store(self) -> Path:
        if not self.data_file.exists():
            return DEFAULT_CODEX_DIR
        try:
            data = json.loads(self.data_file.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return DEFAULT_CODEX_DIR
        if not isinstance(data, dict):
            return DEFAULT_CODEX_DIR
        codex_dir = data.get("codex_dir")
        if not isinstance(codex_dir, str) or not codex_dir.strip():
            return DEFAULT_CODEX_DIR
        return Path(codex_dir)

    def _validate_profile(self, profile: Profile) -> None:
        if not profile.name.strip():
            raise SwitchError("配置名称不能为空")
        if not profile.base_url.strip():
            raise SwitchError("基础地址不能为空")
        if not profile.api_key.strip():
            raise SwitchError("密钥不能为空")

    def _ensure_target_files_exist(self) -> None:
        if not self.config_path.exists():
            raise SwitchError(f"找不到 config.toml: {self.config_path}")
        if not self.auth_path.exists():
            raise SwitchError(f"找不到 auth.json: {self.auth_path}")

    def _backup_once(self, path: Path) -> None:
        backup = path.with_name(path.name + ".bak")
        if not backup.exists():
            shutil.copy2(path, backup)

    def _read_base_url(self) -> str:
        text = self.config_path.read_text(encoding="utf-8")
        match = re.search(r'(?m)^(\s*base_url\s*=\s*)"([^"]*)"', text)
        if not match:
            raise SwitchError("config.toml 中找不到 base_url")
        return match.group(2)

    def _write_base_url(self, base_url: str) -> None:
        text = self.config_path.read_text(encoding="utf-8")
        pattern = r'(?m)^(\s*base_url\s*=\s*)"[^"]*"'
        replacement = rf'\1"{base_url}"'
        new_text, count = re.subn(pattern, replacement, text, count=1)
        if count != 1:
            raise SwitchError("config.toml 中找不到 base_url")
        self.config_path.write_text(new_text, encoding="utf-8")

    def _read_api_key(self) -> str:
        data = self._read_auth_json()
        api_key = data.get("OPENAI_API_KEY")
        if not isinstance(api_key, str):
            raise SwitchError("auth.json 中找不到 OPENAI_API_KEY")
        return api_key

    def _write_api_key(self, api_key: str) -> None:
        data = self._read_auth_json()
        data["OPENAI_API_KEY"] = api_key
        self.auth_path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    def _read_auth_json(self) -> dict[str, Any]:
        try:
            data = json.loads(self.auth_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            raise SwitchError("auth.json 不是有效 JSON") from exc
        if not isinstance(data, dict):
            raise SwitchError("auth.json 顶层必须是对象")
        return data

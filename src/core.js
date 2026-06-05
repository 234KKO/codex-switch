const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_CODEX_DIR = path.join(os.homedir(), ".codex");
const DEFAULT_DATA_FILE = path.join(os.homedir(), ".codex-switch", "profiles.json");

class SwitchError extends Error {
  constructor(message) {
    super(message);
    this.name = "SwitchError";
  }
}

class Profile {
  constructor(name, baseUrl, apiKey) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }
}

class CodexSwitchStore {
  constructor(options = {}) {
    this.dataFile = options.dataFile || DEFAULT_DATA_FILE;
    this.codexDir = options.codexDir || this.loadCodexDirFromStore();
  }

  get configPath() {
    return path.join(this.codexDir, "config.toml");
  }

  get authPath() {
    return path.join(this.codexDir, "auth.json");
  }

  loadStore() {
    if (!fs.existsSync(this.dataFile)) {
      return { active: "", codex_dir: this.codexDir || DEFAULT_CODEX_DIR, profiles: {} };
    }
    let data;
    try {
      data = JSON.parse(fs.readFileSync(this.dataFile, "utf8"));
    } catch (error) {
      throw new SwitchError(`配置数据文件损坏: ${this.dataFile}`);
    }
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new SwitchError("配置数据格式错误");
    }
    return normalizeStore(data);
  }

  saveStore(store) {
    fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
    fs.writeFileSync(this.dataFile, JSON.stringify(toPersistedStore(store), null, 2), "utf8");
  }

  listProfiles() {
    const profiles = this.loadStore().profiles;
    return Object.keys(profiles)
      .sort((a, b) => a.localeCompare(b))
      .map((name) => profileFromStoreItem(name, profiles[name]));
  }

  getActiveName() {
    return this.loadStore().active || "";
  }

  getProfile(name) {
    const profile = this.loadStore().profiles[name];
    if (!profile) {
      return null;
    }
    return profileFromStoreItem(name, profile);
  }

  saveProfile(profile) {
    this.validateProfile(profile);
    const store = this.loadStore();
    store.profiles[profile.name] = {
      baseUrl: profile.baseUrl,
      apiKey: profile.apiKey,
    };
    this.saveStore(store);
  }

  deleteProfile(name) {
    const store = this.loadStore();
    delete store.profiles[name];
    if (store.active === name) {
      store.active = "";
    }
    this.saveStore(store);
  }

  renameProfile(oldName, newName) {
    const nextName = newName.trim();
    if (!nextName) {
      throw new SwitchError("配置名称不能为空");
    }

    const store = this.loadStore();
    if (!store.profiles[oldName]) {
      throw new SwitchError(`配置不存在: ${oldName}`);
    }
    if (oldName === nextName) {
      return profileFromStoreItem(oldName, store.profiles[oldName]);
    }
    if (store.profiles[nextName]) {
      throw new SwitchError(`配置已存在: ${nextName}`);
    }

    store.profiles[nextName] = store.profiles[oldName];
    delete store.profiles[oldName];
    if (store.active === oldName) {
      store.active = nextName;
    }
    this.saveStore(store);
    return profileFromStoreItem(nextName, store.profiles[nextName]);
  }

  applyProfile(name) {
    const profile = this.getProfile(name);
    if (!profile) {
      throw new SwitchError(`配置不存在: ${name}`);
    }
    this.ensureTargetFilesExist();
    this.backupOnce(this.configPath);
    this.backupOnce(this.authPath);
    this.writeBaseUrl(profile.baseUrl);
    this.writeApiKey(profile.apiKey);

    const store = this.loadStore();
    store.active = name;
    this.saveStore(store);
  }

  importCurrent(name) {
    const current = this.readCurrent();
    const profile = new Profile(name, current.baseUrl, current.apiKey);
    this.saveProfile(profile);
    return profile;
  }

  ensureDefaultProfile() {
    const existing = this.getProfile("default");
    if (existing) {
      this.setActiveIfEmpty("default");
      return existing;
    }
    const profile = this.importCurrent("default");
    this.setActiveIfEmpty("default");
    return profile;
  }

  readCurrent() {
    this.ensureTargetFilesExist();
    return new Profile("当前文件", this.readBaseUrl(), this.readApiKey());
  }

  setCodexDir(codexDir) {
    this.codexDir = codexDir;
    const store = this.loadStore();
    store.codexDir = codexDir;
    this.saveStore(store);
  }

  loadCodexDirFromStore() {
    if (!fs.existsSync(this.dataFile)) {
      return DEFAULT_CODEX_DIR;
    }
    try {
      const data = JSON.parse(fs.readFileSync(this.dataFile, "utf8"));
      if (data && typeof data.codexDir === "string" && data.codexDir.trim()) {
        return data.codexDir;
      }
      if (data && typeof data.codex_dir === "string" && data.codex_dir.trim()) {
        return data.codex_dir;
      }
    } catch (_error) {
      return DEFAULT_CODEX_DIR;
    }
    return DEFAULT_CODEX_DIR;
  }

  setActiveIfEmpty(name) {
    const store = this.loadStore();
    if (!store.active) {
      store.active = name;
      this.saveStore(store);
    }
  }

  validateProfile(profile) {
    if (!profile.name || !profile.name.trim()) {
      throw new SwitchError("配置名称不能为空");
    }
    if (!profile.baseUrl || !profile.baseUrl.trim()) {
      throw new SwitchError("基础地址不能为空");
    }
    if (!profile.apiKey || !profile.apiKey.trim()) {
      throw new SwitchError("密钥不能为空");
    }
  }

  ensureTargetFilesExist() {
    if (!fs.existsSync(this.configPath)) {
      throw new SwitchError(`找不到 config.toml: ${this.configPath}`);
    }
    if (!fs.existsSync(this.authPath)) {
      throw new SwitchError(`找不到 auth.json: ${this.authPath}`);
    }
  }

  backupOnce(filePath) {
    const backupPath = `${filePath}.bak`;
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(filePath, backupPath);
    }
  }

  readBaseUrl() {
    const text = fs.readFileSync(this.configPath, "utf8");
    const match = text.match(/^(\s*base_url\s*=\s*)"([^"]*)"/m);
    if (!match) {
      throw new SwitchError("config.toml 中找不到 base_url");
    }
    return match[2];
  }

  writeBaseUrl(baseUrl) {
    const text = fs.readFileSync(this.configPath, "utf8");
    const pattern = /^(\s*base_url\s*=\s*)"[^"]*"/m;
    if (!pattern.test(text)) {
      throw new SwitchError("config.toml 中找不到 base_url");
    }
    const next = text.replace(pattern, `$1"${baseUrl}"`);
    fs.writeFileSync(this.configPath, next, "utf8");
  }

  readApiKey() {
    const auth = this.readAuthJson();
    if (typeof auth.OPENAI_API_KEY !== "string") {
      throw new SwitchError("auth.json 中找不到 OPENAI_API_KEY");
    }
    return auth.OPENAI_API_KEY;
  }

  writeApiKey(apiKey) {
    const auth = this.readAuthJson();
    auth.OPENAI_API_KEY = apiKey;
    fs.writeFileSync(this.authPath, JSON.stringify(auth, null, 2), "utf8");
  }

  readAuthJson() {
    try {
      const data = JSON.parse(fs.readFileSync(this.authPath, "utf8"));
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new SwitchError("auth.json 顶层必须是对象");
      }
      return data;
    } catch (error) {
      if (error instanceof SwitchError) {
        throw error;
      }
      throw new SwitchError("auth.json 不是有效 JSON");
    }
  }
}

function maskApiKey(apiKey) {
  if (apiKey.length <= 12) {
    return "*".repeat(apiKey.length);
  }
  return `${apiKey.slice(0, 7)}...${apiKey.slice(-5)}`;
}

function buildProfileTreeEntries(profiles, activeName) {
  return profiles
    .map((profile) => {
      const active = profile.name === activeName;
      return {
        name: profile.name,
        baseUrl: profile.baseUrl,
        apiKey: profile.apiKey,
        active,
        label: profile.name,
      };
    })
    .sort((left, right) => {
      if (left.active !== right.active) {
        return left.active ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });
}

function normalizeStore(data) {
  const profiles = {};
  const rawProfiles = data.profiles && typeof data.profiles === "object" ? data.profiles : {};
  for (const [name, item] of Object.entries(rawProfiles)) {
    profiles[name] = {
      baseUrl: item?.baseUrl ?? item?.base_url ?? "",
      apiKey: item?.apiKey ?? item?.api_key ?? "",
    };
  }
  return {
    active: typeof data.active === "string" ? data.active : "",
    codexDir: data.codexDir || data.codex_dir || DEFAULT_CODEX_DIR,
    profiles,
  };
}

function toPersistedStore(store) {
  const normalized = normalizeStore(store);
  const profiles = {};
  for (const [name, item] of Object.entries(normalized.profiles)) {
    profiles[name] = {
      base_url: item.baseUrl,
      api_key: item.apiKey,
    };
  }
  return {
    active: normalized.active,
    codex_dir: normalized.codexDir,
    profiles,
  };
}

function profileFromStoreItem(name, item) {
  return new Profile(name, item?.baseUrl ?? item?.base_url ?? "", item?.apiKey ?? item?.api_key ?? "");
}

module.exports = {
  buildProfileTreeEntries,
  CodexSwitchStore,
  DEFAULT_CODEX_DIR,
  DEFAULT_DATA_FILE,
  Profile,
  SwitchError,
  maskApiKey,
};

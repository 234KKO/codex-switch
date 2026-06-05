const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { CodexSwitchStore, Profile, buildProfileTreeEntries } = require("../src/core");

function makeTempStore() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "codex-switch-vscode-"));
  const codexDir = path.join(root, ".codex");
  const dataFile = path.join(root, ".codex-switch", "profiles.json");
  fs.mkdirSync(codexDir, { recursive: true });
  return { root, codexDir, dataFile, store: new CodexSwitchStore({ codexDir, dataFile }) };
}

function writeCodexFiles(codexDir, baseUrl, apiKey) {
  fs.writeFileSync(
    path.join(codexDir, "config.toml"),
    `model = "gpt-5"\nbase_url = "${baseUrl}"\ntimeout = 30\n`,
    "utf8"
  );
  fs.writeFileSync(
    path.join(codexDir, "auth.json"),
    JSON.stringify({ OPENAI_API_KEY: apiKey, OTHER: "keep" }, null, 2),
    "utf8"
  );
}

test("readCurrent reads base_url and OPENAI_API_KEY", () => {
  const { codexDir, store } = makeTempStore();
  writeCodexFiles(codexDir, "https://current/", "sk-current");

  assert.deepEqual(store.readCurrent(), new Profile("当前文件", "https://current/", "sk-current"));
});

test("ensureDefaultProfile imports current files and marks it active", () => {
  const { codexDir, store } = makeTempStore();
  writeCodexFiles(codexDir, "https://default/", "sk-default");

  const profile = store.ensureDefaultProfile();

  assert.deepEqual(profile, new Profile("default", "https://default/", "sk-default"));
  assert.equal(store.getActiveName(), "default");
  assert.deepEqual(store.getProfile("default"), profile);
});

test("ensureDefaultProfile does not overwrite an existing default profile", () => {
  const { codexDir, store } = makeTempStore();
  writeCodexFiles(codexDir, "https://current/", "sk-current");
  store.saveProfile(new Profile("default", "https://saved/", "sk-saved"));

  const profile = store.ensureDefaultProfile();

  assert.deepEqual(profile, new Profile("default", "https://saved/", "sk-saved"));
  assert.equal(store.getActiveName(), "default");
});

test("applyProfile updates only target values and creates backups once", () => {
  const { codexDir, store } = makeTempStore();
  writeCodexFiles(codexDir, "https://old/", "sk-old");
  store.saveProfile(new Profile("work", "https://new/", "sk-new"));
  store.saveProfile(new Profile("home", "https://home/", "sk-home"));

  store.applyProfile("work");
  store.applyProfile("home");

  const configText = fs.readFileSync(path.join(codexDir, "config.toml"), "utf8");
  const auth = JSON.parse(fs.readFileSync(path.join(codexDir, "auth.json"), "utf8"));
  assert.match(configText, /base_url = "https:\/\/home\/"/);
  assert.match(configText, /model = "gpt-5"/);
  assert.deepEqual(auth, { OPENAI_API_KEY: "sk-home", OTHER: "keep" });
  assert.equal(fs.readFileSync(path.join(codexDir, "config.toml.bak"), "utf8").includes("https://old/"), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(codexDir, "auth.json.bak"), "utf8")).OPENAI_API_KEY, "sk-old");
});

test("setCodexDir persists selected Codex directory", () => {
  const { root, dataFile, store } = makeTempStore();
  const customDir = path.join(root, "custom-codex");

  store.setCodexDir(customDir);
  const reloaded = new CodexSwitchStore({ dataFile });

  assert.equal(reloaded.codexDir, customDir);
});

test("loads profiles created by the Python app with snake_case fields", () => {
  const { root, codexDir, dataFile } = makeTempStore();
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  fs.writeFileSync(
    dataFile,
    JSON.stringify(
      {
        active: "new",
        codex_dir: codexDir,
        profiles: {
          new: {
            base_url: "https://api.example/",
            api_key: "sk-legacy",
          },
        },
      },
      null,
      2
    ),
    "utf8"
  );

  const store = new CodexSwitchStore({ dataFile });

  assert.equal(store.codexDir, codexDir);
  assert.deepEqual(store.listProfiles(), [new Profile("new", "https://api.example/", "sk-legacy")]);
  assert.deepEqual(buildProfileTreeEntries(store.listProfiles(), store.getActiveName()), [
    {
      name: "new",
      baseUrl: "https://api.example/",
      apiKey: "sk-legacy",
      active: true,
      label: "new",
    },
  ]);
});

test("buildProfileTreeEntries marks active profile and orders it first", () => {
  const entries = buildProfileTreeEntries(
    [
      new Profile("work", "https://work/", "sk-work"),
      new Profile("default", "https://default/", "sk-default"),
    ],
    "work"
  );

  assert.deepEqual(entries, [
    {
      name: "work",
      baseUrl: "https://work/",
      apiKey: "sk-work",
      active: true,
      label: "work",
    },
    {
      name: "default",
      baseUrl: "https://default/",
      apiKey: "sk-default",
      active: false,
      label: "default",
    },
  ]);
});

test("saveProfile writes profiles in Python app compatible snake_case format", () => {
  const { dataFile, store } = makeTempStore();

  store.saveProfile(new Profile("manual", "https://manual/", "sk-manual"));

  const data = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  assert.deepEqual(data.profiles.manual, {
    base_url: "https://manual/",
    api_key: "sk-manual",
  });
  assert.equal(typeof data.codex_dir, "string");
});

test("renameProfile renames a profile and keeps profile values", () => {
  const { store } = makeTempStore();
  store.saveProfile(new Profile("old", "https://old/", "sk-old"));

  store.renameProfile("old", "renamed");

  assert.equal(store.getProfile("old"), null);
  assert.deepEqual(store.getProfile("renamed"), new Profile("renamed", "https://old/", "sk-old"));
});

test("renameProfile updates active profile name", () => {
  const { codexDir, store } = makeTempStore();
  writeCodexFiles(codexDir, "https://old/", "sk-old");
  store.saveProfile(new Profile("old", "https://old/", "sk-old"));
  store.applyProfile("old");

  store.renameProfile("old", "renamed");

  assert.equal(store.getActiveName(), "renamed");
});

test("renameProfile refuses to overwrite an existing profile", () => {
  const { store } = makeTempStore();
  store.saveProfile(new Profile("old", "https://old/", "sk-old"));
  store.saveProfile(new Profile("existing", "https://existing/", "sk-existing"));

  assert.throws(() => store.renameProfile("old", "existing"), /已存在/);
});

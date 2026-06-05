const fs = require("node:fs");
const path = require("node:path");
const vscode = require("vscode");

const {
  CodexSwitchStore,
  Profile,
  SwitchError,
  buildProfileTreeEntries,
  maskApiKey,
} = require("./core");

let store;
let statusBarItem;
let profileTreeProvider;

class ProfileTreeProvider {
  constructor(profileStore) {
    this.store = profileStore;
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;
  }

  refresh() {
    this.emitter.fire();
  }

  getTreeItem(element) {
    return element;
  }

  getChildren(element) {
    if (element) {
      return [];
    }

    try {
      const active = this.store.getActiveName();
      const profiles = this.store.listProfiles();
      return buildProfileTreeEntries(profiles, active).map((entry) => {
        const item = new vscode.TreeItem(entry.label, vscode.TreeItemCollapsibleState.None);
        item.description = entry.baseUrl;
        item.tooltip = [
          `名称: ${entry.name}`,
          `基础地址: ${entry.baseUrl}`,
          `密钥: ${maskApiKey(entry.apiKey)}`,
        ].join("\n");
        item.contextValue = "codexSwitch.profile";
        item.iconPath = new vscode.ThemeIcon(entry.active ? "check" : "circle-outline");
        item.command = {
          command: "codexSwitch.applyProfileFromTree",
          title: "切换配置",
          arguments: [entry.name],
        };
        return item;
      });
    } catch (error) {
      const item = new vscode.TreeItem("无法读取配置", vscode.TreeItemCollapsibleState.None);
      item.description = error instanceof Error ? error.message : String(error);
      item.iconPath = new vscode.ThemeIcon("warning");
      return [item];
    }
  }
}

function activate(context) {
  store = new CodexSwitchStore();
  profileTreeProvider = new ProfileTreeProvider(store);

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = "codexSwitch.switchProfile";
  statusBarItem.tooltip = "Codex Switch: 切换 Codex 配置";
  context.subscriptions.push(statusBarItem);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("codexSwitchProfiles", profileTreeProvider),
    vscode.commands.registerCommand("codexSwitch.switchProfile", switchProfile),
    vscode.commands.registerCommand("codexSwitch.addProfile", addProfile),
    vscode.commands.registerCommand("codexSwitch.addFromCurrent", addFromCurrent),
    vscode.commands.registerCommand("codexSwitch.selectCodexDirectory", selectCodexDirectory),
    vscode.commands.registerCommand("codexSwitch.renameProfile", renameProfile),
    vscode.commands.registerCommand("codexSwitch.deleteProfile", deleteProfile),
    vscode.commands.registerCommand("codexSwitch.openProfilesFile", openProfilesFile),
    vscode.commands.registerCommand("codexSwitch.refresh", refresh),
    vscode.commands.registerCommand("codexSwitch.reloadWindow", reloadWindow),
    vscode.commands.registerCommand("codexSwitch.applyProfileFromTree", applyProfileFromTree)
  );

  ensureDefaultProfileQuietly();
  refreshUi();
}

function deactivate() {}

async function switchProfile() {
  ensureDefaultProfileQuietly();
  const profiles = store.listProfiles();
  if (profiles.length === 0) {
    vscode.window.showWarningMessage("没有可切换的 Codex 配置。请先从当前文件导入或创建配置。");
    return;
  }

  const active = store.getActiveName();
  const picked = await vscode.window.showQuickPick(
    profiles.map((profile) => ({
      label: profile.name === active ? `$(check) ${profile.name}` : profile.name,
      description: profile.baseUrl,
      detail: `OPENAI_API_KEY: ${maskApiKey(profile.apiKey)}`,
      profile,
    })),
    {
      placeHolder: "选择要切换的 Codex 配置",
      matchOnDescription: true,
      matchOnDetail: true,
    }
  );
  if (!picked) {
    return;
  }

  await applyProfile(picked.profile.name);
}

async function applyProfileFromTree(profileNameOrItem) {
  const profileName =
    typeof profileNameOrItem === "string"
      ? profileNameOrItem
      : profileNameOrItem?.label?.replace(/^✓\s+/, "");
  if (!profileName) {
    return;
  }
  await applyProfile(profileName);
}

async function applyProfile(profileName) {
  try {
    store.applyProfile(profileName);
    refreshUi();
  } catch (error) {
    showError("切换失败", error);
    return;
  }

  const autoReload = vscode.workspace
    .getConfiguration("codexSwitch")
    .get("autoReloadWindow", true);
  if (autoReload) {
    await vscode.window.showInformationMessage(
      `已切换到 ${profileName}，正在重载窗口让 Codex 生效。`
    );
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
    return;
  }

  const action = await vscode.window.showInformationMessage(
    `已切换到 ${profileName}。需要重载窗口后 Codex 才会重新读取配置。`,
    "立即重载",
    "稍后"
  );
  if (action === "立即重载") {
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  }
}

async function addProfile() {
  const name = await vscode.window.showInputBox({
    prompt: "输入配置名称",
    placeHolder: "例如 work、new、proxy",
    validateInput(value) {
      return value.trim() ? undefined : "配置名称不能为空";
    },
  });
  if (!name) {
    return;
  }

  const baseUrl = await vscode.window.showInputBox({
    prompt: "输入基础地址 base_url",
    placeHolder: "https://example.com/",
    validateInput(value) {
      return value.trim() ? undefined : "基础地址不能为空";
    },
  });
  if (!baseUrl) {
    return;
  }

  const apiKey = await vscode.window.showInputBox({
    prompt: "输入 OPENAI_API_KEY",
    password: true,
    validateInput(value) {
      return value.trim() ? undefined : "密钥不能为空";
    },
  });
  if (!apiKey) {
    return;
  }

  try {
    const profile = new Profile(name.trim(), baseUrl.trim(), apiKey.trim());
    store.saveProfile(profile);
    refreshUi();
    const action = await vscode.window.showInformationMessage(
      `已添加配置: ${profile.name}`,
      "立即切换"
    );
    if (action === "立即切换") {
      await applyProfile(profile.name);
    }
  } catch (error) {
    showError("添加失败", error);
  }
}

async function addFromCurrent() {
  const name = await vscode.window.showInputBox({
    prompt: "输入配置名称",
    placeHolder: "例如 default、work、new",
    validateInput(value) {
      return value.trim() ? undefined : "配置名称不能为空";
    },
  });
  if (!name) {
    return;
  }

  try {
    const profile = store.importCurrent(name.trim());
    refreshUi();
    vscode.window.showInformationMessage(`已从当前文件导入配置: ${profile.name}`);
  } catch (error) {
    showError("导入失败", error);
  }
}

async function selectCodexDirectory() {
  const selected = await vscode.window.showOpenDialog({
    title: "选择 Codex 配置目录",
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    defaultUri: vscode.Uri.file(store.codexDir),
  });
  if (!selected || selected.length === 0) {
    return;
  }

  try {
    store.setCodexDir(selected[0].fsPath);
    ensureDefaultProfileQuietly();
    refreshUi();
    vscode.window.showInformationMessage(`Codex 配置目录已切换: ${store.codexDir}`);
  } catch (error) {
    showError("目录切换失败", error);
  }
}

async function renameProfile(profileNameOrItem) {
  let oldName =
    typeof profileNameOrItem === "string"
      ? profileNameOrItem
      : profileNameOrItem?.label?.replace(/^✓\s+/, "");

  if (!oldName) {
    const profiles = store.listProfiles();
    if (profiles.length === 0) {
      vscode.window.showWarningMessage("没有可重命名的 Codex 配置。");
      return;
    }
    const picked = await vscode.window.showQuickPick(
      profiles.map((profile) => ({
        label: profile.name,
        description: profile.baseUrl,
        profile,
      })),
      { placeHolder: "选择要重命名的配置" }
    );
    if (!picked) {
      return;
    }
    oldName = picked.profile.name;
  }

  const newName = await vscode.window.showInputBox({
    prompt: `将配置 ${oldName} 重命名为`,
    value: oldName,
    validateInput(value) {
      const trimmed = value.trim();
      if (!trimmed) {
        return "配置名称不能为空";
      }
      if (trimmed !== oldName && store.getProfile(trimmed)) {
        return `配置已存在: ${trimmed}`;
      }
      return undefined;
    },
  });
  if (!newName) {
    return;
  }

  try {
    const renamed = store.renameProfile(oldName, newName.trim());
    refreshUi();
    vscode.window.showInformationMessage(`已重命名配置: ${oldName} -> ${renamed.name}`);
  } catch (error) {
    showError("重命名失败", error);
  }
}

async function deleteProfile(profileNameOrItem) {
  let profileName =
    typeof profileNameOrItem === "string"
      ? profileNameOrItem
      : profileNameOrItem?.label?.replace(/^✓\s+/, "");

  if (!profileName) {
    const profiles = store.listProfiles();
    if (profiles.length === 0) {
      vscode.window.showWarningMessage("没有可删除的 Codex 配置。");
      return;
    }
    const picked = await vscode.window.showQuickPick(
      profiles.map((profile) => ({
        label: profile.name,
        description: profile.baseUrl,
        profile,
      })),
      { placeHolder: "选择要删除的配置" }
    );
    if (!picked) {
      return;
    }
    profileName = picked.profile.name;
  }

  const confirm = await vscode.window.showWarningMessage(
    `确定删除配置 ${profileName} 吗？`,
    { modal: true },
    "删除"
  );
  if (confirm !== "删除") {
    return;
  }
  try {
    store.deleteProfile(profileName);
    refreshUi();
    vscode.window.showInformationMessage(`已删除配置: ${profileName}`);
  } catch (error) {
    showError("删除失败", error);
  }
}

async function openProfilesFile() {
  fs.mkdirSync(path.dirname(store.dataFile), { recursive: true });
  if (!fs.existsSync(store.dataFile)) {
    store.saveStore(store.loadStore());
  }
  const document = await vscode.workspace.openTextDocument(vscode.Uri.file(store.dataFile));
  await vscode.window.showTextDocument(document);
}

function refresh() {
  ensureDefaultProfileQuietly();
  refreshUi();
}

async function reloadWindow() {
  await vscode.commands.executeCommand("workbench.action.reloadWindow");
}

function ensureDefaultProfileQuietly() {
  try {
    store.ensureDefaultProfile();
  } catch (_error) {
    // 选择的目录可能还没有 Codex 文件。保持插件可用，视图中会显示读取失败。
  }
}

function refreshUi() {
  updateStatusBar();
  profileTreeProvider?.refresh();
}

function updateStatusBar() {
  let active = "";
  try {
    active = store.getActiveName();
  } catch (_error) {
    active = "";
  }
  statusBarItem.text = `$(sync) Codex: ${active || "未配置"}`;
  statusBarItem.show();
}

function showError(title, error) {
  if (error instanceof SwitchError || error instanceof Error) {
    vscode.window.showErrorMessage(`${title}: ${error.message}`);
    return;
  }
  vscode.window.showErrorMessage(`${title}: ${String(error)}`);
}

module.exports = {
  activate,
  deactivate,
};

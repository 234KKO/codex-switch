# Codex Switch

在 VS Code 里一键切换 Codex 配置。

插件会管理：

- `%USERPROFILE%\.codex\config.toml` 里的 `base_url`
- `%USERPROFILE%\.codex\auth.json` 里的 `OPENAI_API_KEY`

一个配置由名称、基础地址、密钥组成。启动时，如果配置列表里没有 `default`，插件会自动把当前 Codex 文件里的配置导入成 `default`。

## 使用方式

安装插件后，VS Code 左侧 Activity Bar 会出现 **Codex Switch** 入口。点开后可以看到配置列表：

```text
✓ default
  work
  new
```

点击某个配置即可切换。切换后，插件会写入 Codex 配置文件，并根据设置自动重载当前 VS Code 窗口，让 Codex 扩展重新读取配置。

左下角状态栏也会显示当前配置：

```text
Codex: default
```

点击状态栏同样可以打开快速选择列表。

## 命令

- `Codex Switch: Switch Profile`
- `Codex Switch: Add Profile From Current`
- `Codex Switch: Select Codex Directory`
- `Codex Switch: Delete Profile`
- `Codex Switch: Open Profiles File`
- `Codex Switch: Refresh`

侧边栏标题栏也提供常用按钮：

- 切换配置
- 添加配置
- 从当前文件导入配置
- 选择 Codex 配置目录
- 刷新
- 重载 VS Code 窗口
- 打开 profiles.json

配置列表里的每一项也可以直接点击切换。当前配置会显示勾选图标。

右键配置项可以：

- 切换
- 重命名
- 删除

## 设置

```json
{
  "codexSwitch.autoReloadWindow": true
}
```

为 `true` 时，切换配置后自动执行 VS Code 的窗口重载命令。为 `false` 时，切换后会询问是否立即重载。

## 数据文件

配置列表保存到：

```text
%USERPROFILE%\.codex-switch\profiles.json
```

首次切换前会自动备份：

```text
%USERPROFILE%\.codex\config.toml.bak
%USERPROFILE%\.codex\auth.json.bak
```

# Codex Switch

一个简单的 Windows 桌面工具，用来切换 Codex 配置中的两个值：

- `config.toml` 里的 `base_url`
- `auth.json` 里的 `OPENAI_API_KEY`

一个配置由“名称、基础地址、密钥”组成。切换配置时，程序会把选中的基础地址和密钥写回当前选择的 Codex 配置目录。

程序启动时会自动读取当前 Codex 配置目录里的现有配置。如果配置列表里还没有 `default`，会把当前文件中的 `base_url` 和 `OPENAI_API_KEY` 自动保存成名为 `default` 的配置，方便切换出去以后再切回原始配置。已有 `default` 时不会覆盖。

## 默认目录

程序默认使用当前 Windows 用户目录下的：

```text
%USERPROFILE%\.codex
```

例如在本机通常是：

```text
C:\Users\28717\.codex
```

发给别人使用时，会自动使用对方自己的用户目录。也可以在界面顶部手动输入或选择其他 `.codex` 文件夹。

## 运行源码

```powershell
python codex_switch.py
```

## 打包 EXE

```powershell
.\build_exe.ps1
```

打包完成后，程序位于：

```text
dist\CodexSwitch.exe
```

## 数据保存位置

配置列表和上次选择的 Codex 配置目录默认保存到：

```text
%USERPROFILE%\.codex-switch\profiles.json
```

首次切换配置前，程序会自动备份原始文件：

```text
%USERPROFILE%\.codex\config.toml.bak
%USERPROFILE%\.codex\auth.json.bak
```

如果你在界面里选择了其他 Codex 配置目录，备份文件会创建在对应目录下。

## 界面操作

1. 顶部确认或选择 Codex 配置目录。
2. 查看“当前文件配置”，确认当前 `base_url` 和密钥。
3. 左侧列表会自动出现 `default`，代表程序首次读取到的原始配置。
4. 填写名称、基础地址、密钥。
5. 点击“保存配置”。
6. 从左侧列表选择一个配置。
7. 点击“切换”。

也可以点击“从当前文件导入”，把当前 `.codex` 文件里的值保存成一个新配置。

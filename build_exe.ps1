$ErrorActionPreference = "Stop"

python -m PyInstaller `
  --noconfirm `
  --onefile `
  --windowed `
  --name "CodexSwitch" `
  codex_switch.py

Write-Host ""
Write-Host "打包完成: dist\CodexSwitch.exe"

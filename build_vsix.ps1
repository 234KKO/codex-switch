$ErrorActionPreference = "Stop"

npm install
npm test
npm run package

Write-Host ""
Write-Host "打包完成: codex-switch-0.1.0.vsix"

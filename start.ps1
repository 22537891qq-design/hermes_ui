# Hermes LLM Token 监控大屏 PowerShell 启动器
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "      Hermes LLM 实时 Token 监控大屏 - 一键启动器" -ForegroundColor Yellow
Write-Host "=========================================================" -ForegroundColor Cyan

# 1. 检查 Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "[错误] 未检测到 Node.js 环境！" -ForegroundColor Red
    Write-Host "请前往官网下载安装: https://nodejs.org/" -ForegroundColor Gray
    Read-Host "按回车键退出..."
    exit 1
}

$nodeVer = node -v
Write-Host "[√] Node.js 检测正常: $nodeVer" -ForegroundColor Green

# 2. 检查 3000 端口
$portInUse = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
    Write-Host "[提示] 3000 端口已在运行中，正在唤起浏览器访问..." -ForegroundColor Yellow
    Start-Process "http://localhost:3000"
    Write-Host "浏览器已打开！如需停止服务，可运行 .\stop.bat" -ForegroundColor Gray
    exit 0
}

# 3. 自动在浏览器中打开页面
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 2
    Start-Process "http://localhost:3000"
} | Out-Null

Write-Host "[√] 正在启动监控服务器 (http://localhost:3000)..." -ForegroundColor Green
Write-Host "[提示] 按 Ctrl+C 可停止服务" -ForegroundColor DarkGray
Write-Host "---------------------------------------------------------"

node server.js

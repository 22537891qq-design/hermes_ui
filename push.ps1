# 推送项目到 GitHub
$Host.UI.RawUI.WindowTitle = "推送项目到 GitHub"
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "      正在推送项目到 GitHub: hermes_ui" -ForegroundColor Yellow
Write-Host "      目标仓库: https://github.com/22537891qq-design/hermes_ui" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location $PSScriptRoot

git push -u origin main

Write-Host ""
Write-Host "=========================================================" -ForegroundColor Cyan
if ($LASTEXITCODE -eq 0) {
    Write-Host "[√] 恭喜！项目已成功同步推送到 GitHub！" -ForegroundColor Green
    Write-Host "访问页面: https://github.com/22537891qq-design/hermes_ui" -ForegroundColor Cyan
} else {
    Write-Host "[!] 推送未完成，若弹出浏览器登录授权窗口，请在浏览器中完成登录授权。" -ForegroundColor Yellow
}
Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "按回车键退出..."

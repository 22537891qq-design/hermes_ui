@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 推送项目到 GitHub

echo =========================================================
echo       正在推送项目到 GitHub: hermes_ui
echo       目标仓库: https://github.com/22537891qq-design/hermes_ui
echo =========================================================
echo.

git push -u origin main

echo.
echo =========================================================
if %errorlevel% equ 0 (
    echo [√] 推送成功！已同步至 https://github.com/22537891qq-design/hermes_ui
) else (
    echo [!] 推送未完成，请确认上方提示（如是否已在浏览器中完成授权）。
)
echo =========================================================
echo.
pause

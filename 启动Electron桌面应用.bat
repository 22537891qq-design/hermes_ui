@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Hermes 桌面监控中心 (Electron)

echo =========================================================
echo        Hermes 实时 Token 监控中心 - Electron 桌面端
echo =========================================================
echo.

where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 未检测到 Node.js / npm 环境！
    pause
    exit /b 1
)

echo [√] 正在启动 Electron 原生桌面应用窗口...
npm start

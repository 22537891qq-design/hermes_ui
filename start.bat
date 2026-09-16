@echo off
chcp 65001 >nul
title Hermes LLM Token 监控大屏启动器

echo =========================================================
echo       Hermes LLM 实时 Token 监控大屏 - 一键启动器
echo =========================================================
echo.

:: 1. 检查 Node.js 环境
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [错误] 系统未检测到 Node.js 环境！
    echo 请先前往官网下载并安装: https://nodejs.org/
    echo 安装完成后请重新运行本启动器。
    echo.
    pause
    exit /b 1
)

:: 2. 获取 Node 版本
for /f "tokens=*" %%v in ('node -v') do set NODE_VER=%%v
echo [√] Node.js 环境检测正常: %NODE_VER%

:: 3. 检查 3000 端口占用
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>nul
if %errorlevel% equ 0 (
    echo [提示] 检测到 3000 端口已有服务在运行。
    echo 正在自动为您打开浏览器访问页面...
    start "" "http://localhost:3000"
    echo.
    echo 浏览器已唤起，如需强制重启服务，可先运行 stop.bat 关闭旧进程。
    echo =========================================================
    pause
    exit /b 0
)

:: 4. 延迟 1.5 秒自动唤起浏览器
start "" cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: 5. 启动服务端
echo [√] 正在启动监控服务器...
echo [√] 访问地址: http://localhost:3000
echo.
echo [提示] 监控服务运行中，按 Ctrl+C 可停止服务。
echo =========================================================
echo.

node server.js
pause

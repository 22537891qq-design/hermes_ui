@echo off
chcp 65001 >nul
title 关闭 Hermes 监控服务

echo =========================================================
echo            Hermes 监控服务 - 一键停止工具
echo =========================================================
echo.

set FOUND=0

:: 查找占用 3000 端口的进程 PID
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
    set PID=%%a
    set FOUND=1
)

if "%FOUND%"=="1" (
    echo [√] 发现 3000 端口运行中进程 (PID: %PID%)
    echo 正在终止该进程...
    taskkill /F /PID %PID% >nul 2>nul
    if %errorlevel% equ 0 (
        echo [√] 监控服务已成功停止！
    ) else (
        echo [!] 尝试关闭进程失败，可能已自动退出或需要管理员权限。
    )
) else (
    echo [i] 未发现占用 3000 端口的活动服务。
)

echo.
echo =========================================================
timeout /t 3 /nobreak >nul

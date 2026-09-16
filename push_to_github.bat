@echo off
chcp 65001 >nul
title 推送 Hermes 项目到 GitHub

echo =========================================================
echo             Hermes 项目 - GitHub 一键推送助手
echo =========================================================
echo.

git remote -v >nul 2>nul
if %errorlevel% equ 0 (
    for /f "tokens=2" %%i in ('git remote get-url origin 2^>nul') do set CURRENT_REMOTE=%%i
)

if defined CURRENT_REMOTE (
    echo [i] 当前已配置远程仓库: %CURRENT_REMOTE%
    set /p CONFIRM="是否直接推送到该仓库? (Y/N, 默认 Y): "
    if /i "%CONFIRM%"=="N" goto INPUT_URL
    goto DO_PUSH
)

:INPUT_URL
echo 请输入您的 GitHub 仓库地址 (支持 HTTPS 或 SSH 格式):
echo 例如: https://github.com/22537891qq-design/hermes-monitor.git
set /p REPO_URL="仓库地址: "

if "%REPO_URL%"=="" (
    echo [错误] 仓库地址不能为空！
    pause
    exit /b 1
)

git remote remove origin 2>nul
git remote add origin %REPO_URL%
echo [√] 远程仓库已成功绑定为: %REPO_URL%

:DO_PUSH
echo.
echo 正在推送到 GitHub main 分支...
git push -u origin main

if %errorlevel% equ 0 (
    echo.
    echo =========================================================
    echo [√] 恭喜！项目已成功推送到您的 GitHub 仓库！
    echo =========================================================
) else (
    echo.
    echo [!] 推送遇到问题，请检查网络或 GitHub 认证凭据 (Token/SSH Key)。
)

echo.
pause

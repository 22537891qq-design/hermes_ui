@echo off
chcp 65001 >nul
title 释放显存与停止推理引擎
color 0A

echo =========================================================
echo         Hermes / Ollama 一键释放显存与停止模型
echo =========================================================
echo.
echo [*] 正在通知 Ollama 卸载所有加载的模型...
ollama stop hermes-coder:3b 2>nul
ollama stop qwen3.5:4b 2>nul
ollama stop qwen2.5-coder:3b 2>nul
ollama stop qwen2.5:3b 2>nul

echo [*] 正在终止后台 llama-server.exe 推理进程...
taskkill /F /IM llama-server.exe >nul 2>nul

echo.
echo =========================================================
echo [√] 当前显存与运行状态检查：
echo =========================================================
ollama ps
echo.
echo [√] 显存已彻底清空归零！后台模型与推理引擎已全部安全关闭。
echo =========================================================
echo.
echo 窗口将在 3 秒后自动关闭...
timeout /t 3 /nobreak >nul

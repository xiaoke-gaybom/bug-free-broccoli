@echo off
chcp 65001 >nul
title Review Forge Launcher
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0start.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [启动失败] 按任意键关闭窗口查看上方错误信息...
    pause >nul
)

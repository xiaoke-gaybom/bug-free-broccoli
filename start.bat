@echo off
chcp 65001 >nul
title Review Forge Launcher
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0start.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [FAILED] Press any key to close and check errors above...
    pause >nul
)

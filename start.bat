@echo off
chcp 65001 >nul
title Review Forge Launcher
powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0start.ps1"

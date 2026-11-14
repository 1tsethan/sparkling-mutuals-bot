@echo off
title Sparkling Mutuals - Hypixel application key
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\configure-hypixel-key.ps1"
echo.
echo Press any key to close this window.
pause >nul

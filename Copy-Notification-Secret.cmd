@echo off
"%ProgramFiles%\nodejs\node.exe" "%~dp0tools\configure-feeds.ts" --copy-secret
pause

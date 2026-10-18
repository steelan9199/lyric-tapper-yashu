@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Starting lyric tapper ...
node server.mjs
if errorlevel 1 (
  echo.
  echo Failed. Is Node.js installed and in PATH?
  pause
)

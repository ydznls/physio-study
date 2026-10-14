@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ is required. See README.md.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
echo Open the Local URL printed below in your browser.
echo Keep this window open while using Physio Study.
node server.mjs
pause

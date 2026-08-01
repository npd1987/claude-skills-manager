@echo off
title Claude Skills Manager
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found on your PATH.
  echo Install it from https://nodejs.org and run this again.
  pause
  exit /b 1
)

node server.js
pause

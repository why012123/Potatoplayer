@echo off
setlocal
cd /d "%~dp0"
title Potatoplayer Ultra

echo.
echo   potato super
echo   A quieter room for your music.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [X] Node.js was not found. Install Node.js 22+ from https://nodejs.org/
  pause
  exit /b 1
)

where java >nul 2>nul
if errorlevel 1 (
  echo [X] Java was not found. Install JDK 21+ from https://adoptium.net/
  pause
  exit /b 1
)

if not exist "node_modules\electron" (
  echo [*] Installing frontend dependencies for the first time...
  call npm install --include=dev --no-audit --no-fund
  if errorlevel 1 (
    echo [X] npm install failed.
    pause
    exit /b 1
  )
)

echo [*] Starting Potatoplayer Ultra...
call npm start
if errorlevel 1 (
  echo.
  echo [X] Startup failed. See the messages above.
  pause
  exit /b 1
)

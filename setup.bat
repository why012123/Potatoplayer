@echo off
REM Potato Player (Java) first-time setup for Windows: download the bundled Maven.
REM The real logic lives in setup.ps1; this wrapper is only here so you can double-click it.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup.ps1" %*
exit /b %ERRORLEVEL%

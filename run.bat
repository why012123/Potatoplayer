@echo off
REM Potato Player (Java) launcher for Windows.
REM The real logic lives in run.ps1; this wrapper is only here so you can double-click it.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
exit /b %ERRORLEVEL%

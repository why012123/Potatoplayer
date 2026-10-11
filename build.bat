@echo off
REM Potato Player (Java) packaging for Windows: produces target\potatoplayer.jar
REM The real logic lives in build.ps1; this wrapper is only here so you can double-click it.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" %*
exit /b %ERRORLEVEL%

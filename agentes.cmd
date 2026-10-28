@echo off
setlocal
node "%~dp0scripts\agentes\cli.mjs" %*
exit /b %errorlevel%

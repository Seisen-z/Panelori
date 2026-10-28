@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
set "TEMP=%~dp0MihonPC-data\temp"
set "TMP=%TEMP%"
if not exist "%TEMP%" mkdir "%TEMP%"
if not exist "%~dp0MihonPC.exe" (
  echo Extract the complete portable ZIP before starting MihonPC.
  exit /b 1
)
start "" "%~dp0MihonPC.exe" --portable %*

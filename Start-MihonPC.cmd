@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
set "APP=%~dp0mihonpc-electron\dist\win-unpacked\MihonPC.exe"
set "PORTABLE_EXECUTABLE_DIR=%~dp0"
set "TEMP=%~dp0MihonPC-data\temp"
set "TMP=%TEMP%"
if not exist "%APP%" (
  echo MihonPC 1.2.2 build not found: "%APP%"
  exit /b 1
)
if "%MIHONPC_LAUNCHER_CHECK%"=="1" (
  echo APP=%APP%
  echo DATA=%~dp0MihonPC-data
  echo VERSION=1.2.2
  exit /b 0
)
if not exist "%TEMP%" mkdir "%TEMP%"
start "" "%APP%" --portable %*

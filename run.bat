@echo off
rem Starts Moon Base for manual testing: double-click this file, or run it
rem from any folder. It installs or updates the dependencies when needed,
rem then opens the game in the desktop app (npm run desktop), from the
rem development server, so a change to the game reloads it.
rem Close the game's window, or press Ctrl+C in this one, to stop it.
setlocal
cd /d "%~dp0"

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Moon Base needs Node.js 24 or later. Install it from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

rem npm ls fails when a dependency is missing or does not match package.json,
rem for example on first run or after pulling changes.
call npm.cmd ls --depth=0 >nul 2>nul
if errorlevel 1 (
  echo Installing dependencies...
  call npm.cmd ci
  if errorlevel 1 (
    echo Installing dependencies failed.
    pause
    exit /b 1
  )
)

echo Starting Moon Base in the desktop app...
call npm.cmd run desktop

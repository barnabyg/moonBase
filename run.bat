@echo off
rem Starts Moon Base for manual testing: double-click this file, or run it
rem from any folder. It installs or updates the dependencies when needed,
rem starts the game at http://localhost:5173 and opens it in Firefox.
rem Close this window, or press Ctrl+C in it, to stop the game.
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

rem Open Firefox, the only supported browser, unless BROWSER is already set.
if not defined BROWSER if exist "%ProgramFiles%\Mozilla Firefox\firefox.exe" set "BROWSER=%ProgramFiles%\Mozilla Firefox\firefox.exe"

echo Starting Moon Base at http://localhost:5173 ...
call npm.cmd run dev -- --open

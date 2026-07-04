@echo off
REM World Literacy Atlas — double-click launcher.
REM Builds the data, starts a local web server, and opens it in your browser.
cd /d "%~dp0"

echo Building data...
py build_web.py
if errorlevel 1 (
  echo.
  echo Build failed. Make sure Python is installed ^(the 'py' command^).
  pause
  exit /b 1
)

echo Starting server on http://localhost:8000 ...
start "World Literacy server" py -m http.server 8000
timeout /t 2 >nul
start "" http://localhost:8000

echo.
echo The atlas is open in your browser.
echo A separate "World Literacy server" window is now running.
echo Close THAT window when you are done browsing.

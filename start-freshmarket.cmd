@echo off
title FreshMarket server
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
    echo Node.js was not found on PATH.
    echo Install it from https://nodejs.org and run this file again.
    pause
    exit /b 1
)

echo ============================================
echo   FreshMarket
echo   Open http://localhost:5000 in your browser
echo   Keep this window open. Press Ctrl+C to stop.
echo ============================================
echo.

npm start

echo.
echo The server has stopped. Press any key to close this window.
pause >nul

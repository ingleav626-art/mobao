@echo off
title Mobao LAN Server

echo.
echo  ========================================
echo    Mobao Warehouse - LAN Server
echo    Starting...
echo  ========================================
echo.

cd /d "%~dp0server"

echo  [1/2] Checking port 9720...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":9720 " ^| findstr "LISTENING"') do (
    echo  Killing old process %%a on port 9720...
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

echo  [2/2] Starting server...
echo.
node server.js --open-browser

if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Server failed to start!
    echo  Please install Node.js: https://nodejs.org/
    echo.
    pause
)

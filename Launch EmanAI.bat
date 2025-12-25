@echo off
title EmanAI Launcher
echo.
echo ================================================
echo    Launching EmanAI...
echo ================================================
echo.

REM Check if node_modules exists
if not exist node_modules (
    echo [WARNING] Dependencies not installed!
    echo Running setup first...
    echo.
    call setup.bat
    if %ERRORLEVEL% NEQ 0 (
        echo.
        echo [ERROR] Setup failed. Please run setup.bat manually.
        pause
        exit /b 1
    )
)

echo [INFO] Starting EmanAI Desktop App...
echo.
echo You can close this window once the app opens.
echo To quit EmanAI, close the app window.
echo.

npm run electron

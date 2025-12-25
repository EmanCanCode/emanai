@echo off
echo ================================================
echo    EmanAI Setup Script
echo ================================================
echo.

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Node.js is not installed!
    echo Please download and install Node.js from https://nodejs.org/
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js is installed
node --version
echo.

REM Install dependencies
echo [STEP 1] Installing dependencies...
call npm install
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo [OK] Dependencies installed successfully!
echo.

REM Create .env file if it doesn't exist
if not exist .env (
    echo [STEP 2] Creating .env file...
    (
        echo OLLAMA_BASE_URL=https://ollama.emancancode.online
        echo OLLAMA_MODEL=huihui_ai/deepseek-r1-abliterated:32b-qwen-distill
        echo PORT=3000
    ) > .env
    echo [OK] .env file created
) else (
    echo [STEP 2] .env file already exists, skipping...
)

echo.
echo ================================================
echo    Setup Complete!
echo ================================================
echo.
echo You can now run EmanAI in two ways:
echo.
echo 1. Desktop App (Electron):
echo    npm run electron
echo.
echo 2. Web Browser:
echo    npm start
echo    Then open http://localhost:3000
echo.
echo To build a Windows installer:
echo    npm run dist
echo.
pause

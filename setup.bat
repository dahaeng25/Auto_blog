@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo Node.js가 설치되어 있지 않습니다.
    echo https://nodejs.org 에서 LTS^(20 또는 22^)를 설치하세요.
    echo.
    pause
    exit /b 1
)

node setup.mjs %*
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% neq 0 (
    echo.
    echo 설정 중 오류가 발생했습니다.
)

pause
exit /b %EXIT_CODE%

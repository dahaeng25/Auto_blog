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

echo Blog Orchestrator 웹 서버를 시작합니다...
echo 브라우저에서 http://localhost:3000 을 열어주세요.
echo 종료하려면 Ctrl+C 를 누르세요.
echo.

npm.cmd run web
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% neq 0 (
    echo.
    echo 웹 서버 시작 실패
    pause
)

exit /b %EXIT_CODE%

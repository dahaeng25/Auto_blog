@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo Node.js가 설치되어 있지 않습니다.
    pause
    exit /b 1
)

echo 네이버 / 티스토리 로그인 세션을 저장합니다.
echo 브라우저가 열리면 직접 로그인한 뒤 터미널 안내에 따라 Enter를 누르세요.
echo.

npm.cmd run auth:setup
set EXIT_CODE=%ERRORLEVEL%

if %EXIT_CODE% neq 0 (
    echo.
    echo 인증 설정 실패
)

pause
exit /b %EXIT_CODE%

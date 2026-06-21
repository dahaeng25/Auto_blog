@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo Node.js가 설치되어 있지 않습니다.
    pause
    exit /b 1
)

echo 원고 편집 파일을 엽니다...
call npm.cmd run blog:workflow -- --step edit
pause

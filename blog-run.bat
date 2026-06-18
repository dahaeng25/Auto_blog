@echo off
chcp 65001 >nul
setlocal EnableDelayedExpansion
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

if not exist "blog-keywords.txt" (
    echo # 블로그 키워드> blog-keywords.txt
    echo D-8-4, 외국인 창업>> blog-keywords.txt
)

:menu
cls
echo.
echo  ========================================
echo   블로그 자동화 — blog-run.bat
echo  ========================================
echo.
echo   키워드 파일: blog-keywords.txt
call :show_keywords
echo.
echo   [1] 전체 실행  ^(글작성 -^> 검토 -^> 썸네일 -^> 업로드^)
echo   [2] 글 작성만  ^(AI 원고 생성^)
echo   [3] 글 검토/수정 ^(메모장 + 미리보기^)
echo   [4] 썸네일 생성
echo   [5] 업로드만
echo   [6] 키워드 편집
echo   [7] 편집 폴더 열기
echo   [0] 종료
echo.
set /p CHOICE="번호를 선택하세요 > "

if "%CHOICE%"=="1" goto run_full
if "%CHOICE%"=="2" goto run_content
if "%CHOICE%"=="3" goto run_edit
if "%CHOICE%"=="4" goto run_thumbnail
if "%CHOICE%"=="5" goto run_publish
if "%CHOICE%"=="6" goto edit_keywords
if "%CHOICE%"=="7" goto open_folder
if "%CHOICE%"=="0" exit /b 0
echo 잘못된 선택입니다.
timeout /t 2 >nul
goto menu

:run_full
echo.
echo 전체 실행을 시작합니다...
call npm.cmd run blog:workflow -- --step full
goto done

:run_content
echo.
echo 글 작성을 시작합니다...
call npm.cmd run blog:workflow -- --step content
goto done

:run_edit
echo.
echo 원고 편집 파일을 엽니다...
call npm.cmd run blog:workflow -- --step edit
goto done

:run_thumbnail
echo.
echo 썸네일을 생성합니다...
call npm.cmd run blog:workflow -- --step thumbnail
goto done

:run_publish
echo.
echo 업로드를 시작합니다...
call npm.cmd run blog:workflow -- --step publish
goto done

:edit_keywords
echo.
echo blog-keywords.txt 를 엽니다. 저장 후 닫으세요.
start "" notepad "%~dp0blog-keywords.txt"
pause
goto menu

:open_folder
if not exist "output\drafts\current" (
    echo.
    echo 아직 편집 폴더가 없습니다. 먼저 [2] 글 작성을 실행하세요.
    pause
    goto menu
)
start "" explorer "%~dp0output\drafts\current"
goto menu

:show_keywords
set "KW="
for /f "usebackq eol=# delims=" %%a in ("%~dp0blog-keywords.txt") do (
    set "line=%%a"
    if not "!line!"=="" set "KW=!line!"
)
if defined KW (
    echo   현재 키워드: !KW!
) else (
    echo   현재 키워드: ^(비어 있음 — [6]에서 입력^)
)
exit /b 0

:done
set EXIT_CODE=%ERRORLEVEL%
echo.
if %EXIT_CODE% neq 0 (
    echo 실행 중 오류가 발생했습니다.
) else (
    echo 완료.
)
pause
goto menu

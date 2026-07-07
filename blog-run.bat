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

call :load_keywords
call :load_region

:menu
cls
echo.
echo  ========================================
echo   블로그 자동화 — blog-run.bat
echo  ========================================
echo.
if defined BLOG_KEYWORDS (
    echo   현재 키워드: !BLOG_KEYWORDS!
) else (
    echo   현재 키워드: ^(미설정 — [1]에서 입력^)
)
if defined BLOG_REGION (
    echo   현재 지역:   !BLOG_REGION! ^(시군구 자동 랜덤^)
) else (
    echo   현재 지역:   ^(미설정 — [1] 또는 [9]에서 입력^)
)
echo.
echo   [1] 키워드+지역 입력/수정
echo   [9] 지역 입력/수정 ^(도·광역시^)
echo.
echo   --- A. 외부 원고 ^(Gems·Notebook LM^) ---
echo   [2] 전체 실행  ^(붙여넣기 -^> 썸네일 -^> 업로드^)
echo   [3] 붙여넣기 준비 ^(편집 파일 열기^)
echo   [4] 글 검토/수정
echo   [5] 썸네일 생성
echo   [6] 썸네일 미리보기
echo   [7] 업로드만
echo.
echo   --- B. AI 자동 ^(키워드+지역^) ---
echo   [8] 전체 실행  ^(AI글작성 -^> 검토 -^> 썸네일 -^> 업로드^)
echo  [10] AI 글 작성만
echo.
echo   [0] 편집 폴더 열기
echo   [Q] 종료
echo.
set "CHOICE="
set /p "CHOICE=번호를 선택하세요 > "

if /i "%CHOICE%"=="Q" exit /b 0
if "%CHOICE%"=="1" goto edit_keywords
if "%CHOICE%"=="9" goto edit_region
if "%CHOICE%"=="2" goto run_import_full
if "%CHOICE%"=="3" goto run_import
if "%CHOICE%"=="4" goto run_edit
if "%CHOICE%"=="5" goto run_thumbnail
if "%CHOICE%"=="6" goto run_thumbnail_preview
if "%CHOICE%"=="7" goto run_publish
if "%CHOICE%"=="8" goto run_full
if "%CHOICE%"=="10" goto run_content
if "%CHOICE%"=="0" goto open_folder
echo 잘못된 선택입니다.
timeout /t 2 >nul
goto menu

:run_import_full
call :ensure_keywords
if errorlevel 1 goto menu
call :ensure_region
if errorlevel 1 goto menu
echo.
echo [1/3] 외부 원고 붙여넣기 폴더를 준비합니다...
call npm.cmd run blog:workflow -- --step import --batch --topic "!BLOG_KEYWORDS!" --region "!BLOG_REGION!"
if errorlevel 1 goto done
echo.
echo ========================================
echo  메모장에서 제목, 본문을 붙여넣고
echo  Ctrl+S 로 저장한 뒤
echo  이 창에서 Enter 키를 누르세요.
echo ========================================
pause >nul
echo.
call :check_import_ready
if errorlevel 1 goto done
echo.
echo [2/3] 썸네일 생성 중...
call npm.cmd run blog:workflow -- --step import-resume --batch
if errorlevel 1 goto done
echo.
set "DO_PUB="
set /p "DO_PUB=업로드를 진행할까요? (y/N) > "
if /i "!DO_PUB!"=="y" (
  echo [3/3] 업로드 중...
  call npm.cmd run blog:workflow -- --step publish --batch
)
goto done

:run_import
call :ensure_keywords
if errorlevel 1 goto menu
echo.
echo 외부 원고 붙여넣기 폴더를 준비합니다...
call npm.cmd run blog:workflow -- --step import --batch --topic "!BLOG_KEYWORDS!" --region "!BLOG_REGION!"
goto done

:run_full
call :ensure_keywords
if errorlevel 1 goto menu
call :ensure_region
if errorlevel 1 goto menu
echo.
echo [1/4] AI 글 작성 중...
call npm.cmd run blog:workflow -- --step content --batch --topic "!BLOG_KEYWORDS!" --region "!BLOG_REGION!"
if errorlevel 1 goto done
echo.
echo [2/4] 원고 편집 파일을 엽니다...
call npm.cmd run blog:workflow -- --step edit --batch
echo.
echo ========================================
echo  메모장에서 원고를 수정하고
echo  Ctrl+S 로 저장한 뒤
echo  이 창에서 Enter 키를 누르세요.
echo ========================================
pause >nul
echo.
echo [3/4] 썸네일 생성 중...
call npm.cmd run blog:workflow -- --step thumbnail --batch
if errorlevel 1 goto done
echo.
set "DO_PUB="
set /p "DO_PUB=업로드를 진행할까요? (y/N) > "
if /i "!DO_PUB!"=="y" (
  echo [4/4] 업로드 중...
  call npm.cmd run blog:workflow -- --step publish --batch
)
goto done

:run_content
call :ensure_keywords
if errorlevel 1 goto menu
call :ensure_region
if errorlevel 1 goto menu
echo.
echo AI 글 작성을 시작합니다...
call npm.cmd run blog:workflow -- --step content --batch --topic "!BLOG_KEYWORDS!" --region "!BLOG_REGION!"
goto done

:run_edit
echo.
echo 원고 편집 파일을 엽니다...
call npm.cmd run blog:workflow -- --step edit --batch
goto done

:run_thumbnail
echo.
echo 썸네일을 생성합니다...
call npm.cmd run blog:workflow -- --step thumbnail --batch
goto done

:run_thumbnail_preview
echo.
echo 썸네일을 생성하고 미리보기를 엽니다...
call npm.cmd run blog:workflow -- --step thumbnail-preview --batch
goto done

:run_publish
echo.
echo 업로드를 시작합니다...
call npm.cmd run blog:workflow -- --step publish --batch
goto done

:open_folder
if not exist "output\drafts\current" (
    echo.
    echo 아직 편집 폴더가 없습니다. [3] 붙여넣기 준비 또는 [8] AI 글 작성을 실행하세요.
    pause
    goto menu
)
start "" explorer "%~dp0output\drafts\current"
goto menu

:edit_keywords
call :edit_keywords_region_prompt menu
goto menu

:edit_region
call :edit_region_prompt menu
goto menu

:edit_keywords_region_prompt
set "RETURN_MODE=%~1"

rem 키워드 입력
call :edit_keywords_prompt return
if errorlevel 1 exit /b 1

rem 이어서 지역(도·광역시) 입력
call :edit_region_prompt return
if errorlevel 1 exit /b 1

if /i "!RETURN_MODE!"=="return" exit /b 0
pause
exit /b 0

:edit_region_prompt
set "RETURN_MODE=%~1"
cls
echo.
echo  ========================================
echo   지역 입력/수정 ^(도·광역시^)
echo  ========================================
echo.
if defined BLOG_REGION (
    echo   현재: !BLOG_REGION!
    echo.
)
echo   도 또는 광역시명을 입력하세요.
echo   예^) 전라북도, 전북, 부산, 경기, 서울, 인천
echo.
echo   입력 시 해당 지역의 인기 시·군·구 4~5개가
echo   글마다 랜덤으로 자동 적용됩니다.
echo.
echo   ^(그대로 두려면 Enter만 누르세요^)
echo.
set "NEW_REGION="
set /p "NEW_REGION=새 지역 > "
if defined NEW_REGION set "BLOG_REGION=!NEW_REGION!"
if not defined BLOG_REGION (
    echo.
    echo 지역이 비어 있습니다.
    if /i "!RETURN_MODE!"=="return" exit /b 1
    pause
    exit /b 1
)
call :save_region
echo.
echo   저장 완료: !BLOG_REGION!
if /i "!RETURN_MODE!"=="return" exit /b 0
pause
exit /b 0

:edit_keywords_prompt
set "RETURN_MODE=%~1"
cls
echo.
echo  ========================================
echo   키워드 입력/수정
echo  ========================================
echo.
if defined BLOG_KEYWORDS (
    echo   현재: !BLOG_KEYWORDS!
    echo.
)
echo   쉼표로 구분해 입력하세요.
echo   예^) D-8-4, 외국인 창업
echo.
echo   ^(그대로 두려면 Enter만 누르세요^)
echo.
set "NEW_KEYWORDS="
set /p "NEW_KEYWORDS=새 키워드 > "
if defined NEW_KEYWORDS set "BLOG_KEYWORDS=!NEW_KEYWORDS!"
if not defined BLOG_KEYWORDS (
    echo.
    echo 키워드가 비어 있습니다.
    if /i "!RETURN_MODE!"=="return" exit /b 1
    pause
    exit /b 1
)
call :save_keywords
echo.
echo   저장 완료: !BLOG_KEYWORDS!
if /i "!RETURN_MODE!"=="return" exit /b 0
pause
exit /b 0

:load_keywords
set "BLOG_KEYWORDS="
if exist "%~dp0blog-keywords.txt" (
    for /f "usebackq delims=" %%a in ("%~dp0blog-keywords.txt") do (
        set "line=%%a"
        if not "!line!"=="" if not "!line:~0,1!"=="#" (
            set "BLOG_KEYWORDS=!line!"
            goto :load_keywords_done
        )
    )
)
:load_keywords_done
if not defined BLOG_KEYWORDS set "BLOG_KEYWORDS=D-8-4, 외국인 창업"
exit /b 0

:save_keywords
powershell -NoProfile -Command "$t=$env:BLOG_KEYWORDS; [IO.File]::WriteAllText('%~dp0blog-keywords.txt', $t, [Text.UTF8Encoding]::new($false))" 2>nul
if errorlevel 1 (
    >"%~dp0blog-keywords.txt" echo !BLOG_KEYWORDS!
)
exit /b 0

:ensure_keywords
if defined BLOG_KEYWORDS exit /b 0
echo.
echo 키워드가 설정되지 않았습니다. 입력해 주세요.
call :edit_keywords_prompt return
if errorlevel 1 exit /b 1
call :ensure_region
exit /b 0

:ensure_region
if defined BLOG_REGION exit /b 0
echo.
echo 지역이 설정되지 않았습니다. 도 또는 광역시를 입력해 주세요.
call :edit_region_prompt return
if errorlevel 1 exit /b 1
exit /b 0

:load_region
set "BLOG_REGION="
if exist "%~dp0blog-region.txt" (
    for /f "usebackq delims=" %%a in ("%~dp0blog-region.txt") do (
        set "line=%%a"
        if not "!line!"=="" if not "!line:~0,1!"=="#" (
            set "BLOG_REGION=!line!"
            goto :load_region_done
        )
    )
)
:load_region_done
if not defined BLOG_REGION set "BLOG_REGION=전라북도"
exit /b 0

:save_region
powershell -NoProfile -Command "$t=$env:BLOG_REGION; [IO.File]::WriteAllText('%~dp0blog-region.txt', ('# 블로그 지역 (도 또는 광역시)`n' + $t + '`n'), [Text.UTF8Encoding]::new($false))" 2>nul
if errorlevel 1 (
    >"%~dp0blog-region.txt" echo !BLOG_REGION!
)
exit /b 0

:check_import_ready
call npm.cmd run blog:workflow -- --step check-import --batch
if errorlevel 1 (
  echo.
  echo [안내] 제목 또는 본문이 아직 저장되지 않았습니다.
  echo   폴더: %~dp0output\drafts\current
  echo   title.txt, body.html 을 메모장에서 저장^(Ctrl+S^) 후 다시 [2] 또는 [5]를 실행하세요.
)
exit /b %ERRORLEVEL%

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

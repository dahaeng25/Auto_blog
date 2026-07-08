@echo off
chcp 949 >nul 2>&1
setlocal EnableDelayedExpansion
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto no_node
goto node_ok
:no_node
echo.
echo Node.js가 설치되어 있지 않습니다.
echo https://nodejs.org 에서 LTS 20 또는 22 를 설치하세요.
echo.
pause
exit /b 1
:node_ok

call :load_keywords
call :load_region
goto menu

:menu
cls
echo.
echo  ========================================
echo   블로그 자동화 - blog-run.bat
echo  ========================================
echo.
if defined BLOG_KEYWORDS goto menu_show_keywords
echo   현재 키워드: 미설정
goto menu_keywords_done
:menu_show_keywords
echo   현재 키워드: !BLOG_KEYWORDS!
:menu_keywords_done
if defined BLOG_REGION goto menu_show_region
echo   현재 지역:   미설정
goto menu_region_done
:menu_show_region
echo   현재 지역:   !BLOG_REGION!
:menu_region_done
echo.
echo   --- 키워드·지역 설정 ---
echo   [1] 직접 입력/수정 - 키워드+지역
echo   [9] 지역만 입력/수정
echo   [11] 키워드 자동 생성 - 업무별 랜덤/확장
echo.
echo   --- AI 글작성 ---
echo   [20] AI 글 작성
echo   [21] 검토/수정 - 편집 폴더 열기
echo.
echo   --- 썸네일·업로드 ---
echo   [30] 썸네일 생성
echo   [31] 썸네일 미리보기
echo   [32] 업로드만
echo.
echo   --- 전체 실행 ---
echo   [40] AI 전체 - 작성-^>검토-^>썸네일-^>업로드
echo   [41] 외부원고 전체 - 붙여넣기-^>썸네일-^>업로드
echo.
echo   --- 외부 원고 ---
echo   [50] 붙여넣기 준비
echo.
echo   [0] 편집 폴더 열기
echo   [Q] 종료
echo.
set "CHOICE="
set /p "CHOICE=번호를 선택하세요 > "

if /i "!CHOICE!"=="Q" exit /b 0
if "!CHOICE!"=="1" goto edit_keywords
if "!CHOICE!"=="9" goto edit_region
if "!CHOICE!"=="11" goto run_auto_keywords
if "!CHOICE!"=="20" goto run_content
if "!CHOICE!"=="21" goto run_review
if "!CHOICE!"=="30" goto run_thumbnail
if "!CHOICE!"=="31" goto run_thumbnail_preview
if "!CHOICE!"=="32" goto run_publish
if "!CHOICE!"=="40" goto run_full
if "!CHOICE!"=="41" goto run_import_full
if "!CHOICE!"=="50" goto run_import
if "!CHOICE!"=="0" goto open_folder
echo 잘못된 선택입니다.
timeout /t 2 >nul
goto menu

:run_auto_keywords
echo.
call npx tsx "%~dp0scripts\keyword-auto.ts" --interactive
if errorlevel 1 goto menu
call :load_keywords
echo.
echo 키워드가 저장되었습니다. 지역은 [9]에서 입력하세요.
pause
goto menu

:run_import_full
call :ensure_keywords
if errorlevel 1 goto menu
call :ensure_region
if errorlevel 1 goto menu
echo.
echo [1/3] 외부 원고 붙여넣기 편집을 준비합니다...
call npm.cmd run blog:workflow -- --step import --batch
if errorlevel 1 goto done
echo.
echo ========================================
echo  메모장에서 저장, 브라우저 붙여넣고
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
set /p "DO_PUB=업로드를 진행할까요? y/N > "
if /i not "!DO_PUB!"=="y" goto done
echo [3/3] 업로드 중...
set "DID_PUBLISH=1"
call npm.cmd run blog:workflow -- --step publish --batch
goto done

:run_import
call :ensure_keywords
if errorlevel 1 goto menu
echo.
echo 외부 원고 붙여넣기 편집을 준비합니다...
call npm.cmd run blog:workflow -- --step import --batch
goto done

:run_full
call :ensure_keywords
if errorlevel 1 goto menu
call :ensure_region
if errorlevel 1 goto menu
echo.
echo [1/4] AI 글 작성 중...
call npm.cmd run blog:workflow -- --step content --batch
if errorlevel 1 goto done
echo.
echo [2/4] 검토 - 편집 폴더를 엽니다...
call npm.cmd run blog:workflow -- --step edit --batch
echo.
echo ========================================
echo  메모장에서 내용을 확인하고
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
set /p "DO_PUB=업로드를 진행할까요? y/N > "
if /i not "!DO_PUB!"=="y" goto done
echo [4/4] 업로드 중...
set "DID_PUBLISH=1"
call npm.cmd run blog:workflow -- --step publish --batch
goto done

:run_content
call :ensure_keywords
if errorlevel 1 goto menu
call :ensure_region
if errorlevel 1 goto menu
echo.
echo AI 글 작성을 시작합니다...
call npm.cmd run blog:workflow -- --step content --batch
goto done

:run_review
echo.
echo 검토/수정 - 편집 폴더를 엽니다...
call npm.cmd run blog:workflow -- --step edit --batch
goto done

:run_thumbnail
echo.
echo 썸네일을 생성합니다...
call npm.cmd run blog:workflow -- --step thumbnail --batch
goto done

:run_thumbnail_preview
echo.
echo 썸네일 미리보기를 엽니다...
call npm.cmd run blog:workflow -- --step thumbnail-preview --batch
goto done

:run_publish
echo.
echo 업로드를 시작합니다...
set "DID_PUBLISH=1"
call npm.cmd run blog:workflow -- --step publish --batch
goto done

:open_folder
if exist "output\drafts\current" goto open_folder_start
echo.
echo 편집 폴더가 없습니다. [20] AI 글 작성 또는 [50] 붙여넣기를 먼저 실행하세요.
pause
goto menu
:open_folder_start
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
call :edit_keywords_prompt return
if errorlevel 1 exit /b 1
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
echo   지역 입력/수정 - 도-광역시
echo  ========================================
echo.
if defined BLOG_REGION goto edit_region_show
goto edit_region_input
:edit_region_show
echo   현재: !BLOG_REGION!
echo.
:edit_region_input
echo   도 또는 광역시명을 입력하세요.
echo   예: 전라북도, 서울, 부산, 경기, 충남, 강원
echo.
echo   같은 도 안에서 시군구가 자동으로 4~5곳
echo   랜덤 선택되어 글에 반영됩니다.
echo.
echo   그대로 두려면 Enter만 누르세요.
echo.
set "NEW_REGION="
set /p "NEW_REGION=새 지역 > "
if defined NEW_REGION set "BLOG_REGION=!NEW_REGION!"
if defined BLOG_REGION goto edit_region_save
echo.
echo 지역이 비어 있습니다.
if /i "!RETURN_MODE!"=="return" exit /b 1
pause
exit /b 1
:edit_region_save
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
if defined BLOG_KEYWORDS goto edit_keywords_show
goto edit_keywords_input
:edit_keywords_show
echo   현재: !BLOG_KEYWORDS!
echo.
:edit_keywords_input
echo   쉼표로 구분해 입력하세요.
echo   예: D-8-4, 외국인 창업
echo.
echo   자동 생성은 메뉴 [11]을 사용하세요.
echo   그대로 두려면 Enter만 누르세요.
echo.
set "NEW_KEYWORDS="
set /p "NEW_KEYWORDS=새 키워드 > "
if defined NEW_KEYWORDS set "BLOG_KEYWORDS=!NEW_KEYWORDS!"
if defined BLOG_KEYWORDS goto edit_keywords_save
echo.
echo 키워드가 비어 있습니다.
if /i "!RETURN_MODE!"=="return" exit /b 1
pause
exit /b 1
:edit_keywords_save
call :save_keywords
echo.
echo   저장 완료: !BLOG_KEYWORDS!
if /i "!RETURN_MODE!"=="return" exit /b 0
pause
exit /b 0

:load_keywords
set "BLOG_KEYWORDS="
if not exist "%~dp0blog-keywords.txt" goto load_keywords_done
call npx tsx "%~dp0scripts\export-line-cp949.ts" "%~dp0blog-keywords.txt" "%TEMP%\ab_kw_cp949.txt" >nul 2>&1
if exist "%TEMP%\ab_kw_cp949.txt" for /f "usebackq delims=" %%a in ("%TEMP%\ab_kw_cp949.txt") do set "BLOG_KEYWORDS=%%a"
:load_keywords_done
exit /b 0

:save_keywords
> "%TEMP%\ab_kw.tmp" echo !BLOG_KEYWORDS!
call npx tsx "%~dp0scripts\write-text-line.ts" "%~dp0blog-keywords.txt" "%TEMP%\ab_kw.tmp"
del "%TEMP%\ab_kw.tmp" >nul 2>&1
exit /b 0

:ensure_keywords
if defined BLOG_KEYWORDS exit /b 0
echo.
echo 키워드가 설정되지 않았습니다.
echo   [1] 직접 입력  또는  [11] 자동 생성
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
if not exist "%~dp0blog-region.txt" goto load_region_done
call npx tsx "%~dp0scripts\export-line-cp949.ts" "%~dp0blog-region.txt" "%TEMP%\ab_rg_cp949.txt" >nul 2>&1
if exist "%TEMP%\ab_rg_cp949.txt" for /f "usebackq delims=" %%a in ("%TEMP%\ab_rg_cp949.txt") do set "BLOG_REGION=%%a"
:load_region_done
exit /b 0

:save_region
> "%TEMP%\ab_rg.tmp" echo !BLOG_REGION!
call npx tsx "%~dp0scripts\write-text-line.ts" "%~dp0blog-region.txt" "%TEMP%\ab_rg.tmp"
del "%TEMP%\ab_rg.tmp" >nul 2>&1
exit /b 0

:reset_session
set "BLOG_KEYWORDS="
set "BLOG_REGION="
call npx tsx "%~dp0scripts\reset-blog-session.ts" >nul 2>&1
exit /b 0

:check_import_ready
call npm.cmd run blog:workflow -- --step check-import --batch
if errorlevel 1 goto check_import_fail
exit /b 0
:check_import_fail
echo.
echo [안내] 제목 또는 본문이 아직 저장되지 않았습니다.
echo   폴더: %~dp0output\drafts\current
echo   title.txt, body.html 을 메모장에서 Ctrl+S 저장 후 다시 실행
exit /b 1

:done
set "EXIT_CODE=!ERRORLEVEL!"
echo.
if !EXIT_CODE! neq 0 goto done_error
echo 완료.
if defined DID_PUBLISH call :reset_session
set "DID_PUBLISH="
goto done_pause
:done_error
echo 실행 중 오류가 발생했습니다.
:done_pause
pause
goto menu
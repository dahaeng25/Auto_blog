@echo off
setlocal EnableDelayedExpansion
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 goto no_node
goto node_ok
:no_node
echo.
echo Node.js? ???? ?? ????.
echo https://nodejs.org ?? LTS 20 ?? 22 ? ?????.
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
echo   ??? ??? - blog-run.bat
echo  ========================================
echo.
if defined BLOG_KEYWORDS goto menu_show_keywords
echo   ?? ???: ??? - [1]?? ??
goto menu_keywords_done
:menu_show_keywords
echo   ?? ???: !BLOG_KEYWORDS!
:menu_keywords_done
if defined BLOG_REGION goto menu_show_region
echo   ?? ??:   ??? - [1] ?? [9]?? ??
goto menu_region_done
:menu_show_region
echo   ?? ??:   !BLOG_REGION! - ??? ?? ??
:menu_region_done
echo.
echo   [1] ???+?? ??/??
echo   [9] ?? ??/?? - ?-???
echo.
echo   --- A. ?? ?? - Gems, Notebook LM ---
echo   [2] ?? ??  - ???? -^> ??? -^> ???
echo   [3] ???? ?? - ?? ?? ??
echo   [4] ? ??/??
echo   [5] ??? ??
echo   [6] ??? ????
echo   [7] ????
echo.
echo   --- B. AI ?? - ???+?? ---
echo   [8] ?? ??  - AI??? -^> ?? -^> ??? -^> ???
echo   [10] AI ? ???
echo.
echo   [0] ?? ?? ??
echo   [Q] ??
echo.
set "CHOICE="
set /p "CHOICE=??? ????? > "

if /i "!CHOICE!"=="Q" exit /b 0
if "!CHOICE!"=="1" goto edit_keywords
if "!CHOICE!"=="9" goto edit_region
if "!CHOICE!"=="2" goto run_import_full
if "!CHOICE!"=="3" goto run_import
if "!CHOICE!"=="4" goto run_edit
if "!CHOICE!"=="5" goto run_thumbnail
if "!CHOICE!"=="6" goto run_thumbnail_preview
if "!CHOICE!"=="7" goto run_publish
if "!CHOICE!"=="8" goto run_full
if "!CHOICE!"=="10" goto run_content
if "!CHOICE!"=="0" goto open_folder
echo ??? ?????.
timeout /t 2 >nul
goto menu

:run_import_full
call :ensure_keywords
if errorlevel 1 goto menu
call :ensure_region
if errorlevel 1 goto menu
echo.
echo [1/3] ?? ?? ???? ??? ?????...
call npm.cmd run blog:workflow -- --step import --batch --topic "!BLOG_KEYWORDS!" --region "!BLOG_REGION!"
if errorlevel 1 goto done
echo.
echo ========================================
echo  ????? ??, ??? ????
echo  Ctrl+S ? ??? ?
echo  ? ??? Enter ?? ????.
echo ========================================
pause >nul
echo.
call :check_import_ready
if errorlevel 1 goto done
echo.
echo [2/3] ??? ?? ?...
call npm.cmd run blog:workflow -- --step import-resume --batch
if errorlevel 1 goto done
echo.
set "DO_PUB="
set /p "DO_PUB=???? ?????? y/N > "
if /i not "!DO_PUB!"=="y" goto done
echo [3/3] ??? ?...
call npm.cmd run blog:workflow -- --step publish --batch
goto done

:run_import
call :ensure_keywords
if errorlevel 1 goto menu
echo.
echo ?? ?? ???? ??? ?????...
call npm.cmd run blog:workflow -- --step import --batch --topic "!BLOG_KEYWORDS!" --region "!BLOG_REGION!"
goto done

:run_full
call :ensure_keywords
if errorlevel 1 goto menu
call :ensure_region
if errorlevel 1 goto menu
echo.
echo [1/4] AI ? ?? ?...
call npm.cmd run blog:workflow -- --step content --batch --topic "!BLOG_KEYWORDS!" --region "!BLOG_REGION!"
if errorlevel 1 goto done
echo.
echo [2/4] ?? ?? ??? ???...
call npm.cmd run blog:workflow -- --step edit --batch
echo.
echo ========================================
echo  ????? ??? ????
echo  Ctrl+S ? ??? ?
echo  ? ??? Enter ?? ????.
echo ========================================
pause >nul
echo.
echo [3/4] ??? ?? ?...
call npm.cmd run blog:workflow -- --step thumbnail --batch
if errorlevel 1 goto done
echo.
set "DO_PUB="
set /p "DO_PUB=???? ?????? y/N > "
if /i not "!DO_PUB!"=="y" goto done
echo [4/4] ??? ?...
call npm.cmd run blog:workflow -- --step publish --batch
goto done

:run_content
call :ensure_keywords
if errorlevel 1 goto menu
call :ensure_region
if errorlevel 1 goto menu
echo.
echo AI ? ??? ?????...
call npm.cmd run blog:workflow -- --step content --batch --topic "!BLOG_KEYWORDS!" --region "!BLOG_REGION!"
goto done

:run_edit
echo.
echo ?? ?? ??? ???...
call npm.cmd run blog:workflow -- --step edit --batch
goto done

:run_thumbnail
echo.
echo ???? ?????...
call npm.cmd run blog:workflow -- --step thumbnail --batch
goto done

:run_thumbnail_preview
echo.
echo ???? ???? ????? ???...
call npm.cmd run blog:workflow -- --step thumbnail-preview --batch
goto done

:run_publish
echo.
echo ???? ?????...
call npm.cmd run blog:workflow -- --step publish --batch
goto done

:open_folder
if exist "output\drafts\current" goto open_folder_start
echo.
echo ?? ?? ??? ????. [3] ???? ?? ?? [8] AI ? ??? ?????.
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
echo   ?? ??/?? - ?-???
echo  ========================================
echo.
if defined BLOG_REGION goto edit_region_show
goto edit_region_input
:edit_region_show
echo   ??: !BLOG_REGION!
echo.
:edit_region_input
echo   ? ?? ????? ?????.
echo   ?: ????, ??, ??, ??, ??, ??
echo.
echo   ?? ? ?? ??? ?? ??? 4~5??
echo   ??? ???? ?? ?????.
echo.
echo   ??? ??? Enter? ????.
echo.
set "NEW_REGION="
set /p "NEW_REGION=? ?? > "
if defined NEW_REGION set "BLOG_REGION=!NEW_REGION!"
if defined BLOG_REGION goto edit_region_save
echo.
echo ??? ?? ????.
if /i "!RETURN_MODE!"=="return" exit /b 1
pause
exit /b 1
:edit_region_save
call :save_region
echo.
echo   ?? ??: !BLOG_REGION!
if /i "!RETURN_MODE!"=="return" exit /b 0
pause
exit /b 0

:edit_keywords_prompt
set "RETURN_MODE=%~1"
cls
echo.
echo  ========================================
echo   ??? ??/??
echo  ========================================
echo.
if defined BLOG_KEYWORDS goto edit_keywords_show
goto edit_keywords_input
:edit_keywords_show
echo   ??: !BLOG_KEYWORDS!
echo.
:edit_keywords_input
echo   ??? ??? ?????.
echo   ?: D-8-4, ??? ??
echo.
echo   ??? ??? Enter? ????.
echo.
set "NEW_KEYWORDS="
set /p "NEW_KEYWORDS=? ??? > "
if defined NEW_KEYWORDS set "BLOG_KEYWORDS=!NEW_KEYWORDS!"
if defined BLOG_KEYWORDS goto edit_keywords_save
echo.
echo ???? ?? ????.
if /i "!RETURN_MODE!"=="return" exit /b 1
pause
exit /b 1
:edit_keywords_save
call :save_keywords
echo.
echo   ?? ??: !BLOG_KEYWORDS!
if /i "!RETURN_MODE!"=="return" exit /b 0
pause
exit /b 0

:load_keywords
set "BLOG_KEYWORDS="
if not exist "%~dp0blog-keywords.txt" goto load_keywords_default
for /f "usebackq eol=# delims=" %%a in ("%~dp0blog-keywords.txt") do set "BLOG_KEYWORDS=%%a" & goto load_keywords_done
:load_keywords_default
if not defined BLOG_KEYWORDS set "BLOG_KEYWORDS=D-8-4, ??? ??"
:load_keywords_done
exit /b 0

:save_keywords
>"%~dp0blog-keywords.txt" echo !BLOG_KEYWORDS!
exit /b 0

:ensure_keywords
if defined BLOG_KEYWORDS exit /b 0
echo.
echo ???? ???? ?????. ??? ???.
call :edit_keywords_prompt return
if errorlevel 1 exit /b 1
call :ensure_region
exit /b 0

:ensure_region
if defined BLOG_REGION exit /b 0
echo.
echo ??? ???? ?????. ? ?? ???? ??? ???.
call :edit_region_prompt return
if errorlevel 1 exit /b 1
exit /b 0

:load_region
set "BLOG_REGION="
if not exist "%~dp0blog-region.txt" goto load_region_default
for /f "usebackq eol=# delims=" %%a in ("%~dp0blog-region.txt") do set "BLOG_REGION=%%a" & goto load_region_done
:load_region_default
if not defined BLOG_REGION set "BLOG_REGION=????"
:load_region_done
exit /b 0

:save_region
>"%~dp0blog-region.txt" echo # ??? ??
>>"%~dp0blog-region.txt" echo !BLOG_REGION!
exit /b 0

:check_import_ready
call npm.cmd run blog:workflow -- --step check-import --batch
if errorlevel 1 goto check_import_fail
exit /b 0
:check_import_fail
echo.
echo [??] ?? ?? ??? ?? ???? ?????.
echo   ??: %~dp0output\drafts\current
echo   title.txt, body.html ? ????? Ctrl+S ?? ? ?? [2] ?? [5] ??
exit /b 1

:done
set "EXIT_CODE=!ERRORLEVEL!"
echo.
if !EXIT_CODE! neq 0 goto done_error
echo ??.
goto done_pause
:done_error
echo ?? ? ??? ??????.
:done_pause
pause
goto menu

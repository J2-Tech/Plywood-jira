@ECHO OFF
setlocal EnableDelayedExpansion

REM Check if this is the temporary updater script
if "%1"=="__UPDATE__" goto :update_mode

if not exist "%~dp0\config\" mkdir "%~dp0\config\"

WHERE node >nul 2>nul
IF %ERRORLEVEL% NEQ 0 ( ECHO nodejs wasn't found, exiting && pause && EXIT /B 1 ) 
WHERE git >nul 2>nul
IF %ERRORLEVEL% NEQ 0 ( ECHO git wasn't found, skipping update  && GOTO :start ) 
WHERE npm >nul 2>nul
IF %ERRORLEVEL% NEQ 0 ( ECHO npm wasn't found, skipping update  && GOTO :start ) 

cd /D "%~dp0"

REM Create a temporary copy of this script to handle updates safely
set TEMP_UPDATER=%~dp0start_temp_updater.bat
copy "%~f0" "%TEMP_UPDATER%" >nul 2>&1

REM Execute the temporary updater to perform git operations
echo Checking for updates...
"%TEMP_UPDATER%" __UPDATE__ "%~f0"

REM Check if the original script was updated
if exist "%~dp0\.update_completed" (
    echo Script was updated, restarting with new version...
    del "%~dp0\.update_completed" >nul 2>&1
    del "%TEMP_UPDATER%" >nul 2>&1
    start "" "%~f0"
    exit /b 0
)

REM Clean up temporary file
if exist "%TEMP_UPDATER%" del "%TEMP_UPDATER%" >nul 2>&1

npm install & GOTO :start_with_restart

:update_mode
REM This section runs from the temporary copy and can safely update the original
set ORIGINAL_SCRIPT=%2
cd /D "%~dp0"

REM Create backup of original for comparison
copy "%ORIGINAL_SCRIPT%" "%~dp0\start_backup.bat" >nul 2>&1

REM Check if we need to use origin/main instead of github/main
git remote -v | findstr "github" >nul
if %ERRORLEVEL% NEQ 0 (
    echo Using origin/main instead of github/main
    git fetch --all
    git reset --hard origin/main
) else (
    git fetch --all
    git reset --hard github/main
)

REM Check if the original script was modified
if exist "%~dp0\start_backup.bat" (
    fc "%ORIGINAL_SCRIPT%" "%~dp0\start_backup.bat" >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        REM Script was updated, signal main script to restart
        echo. > "%~dp0\.update_completed"
    )
    del "%~dp0\start_backup.bat" >nul 2>&1
)

REM Exit the temporary updater
exit /b 0

:start
cd /D "%~dp0"

:start_with_restart
echo.
echo ========================================
echo    JiraTime Application - Auto Restart
echo ========================================
echo.
echo Starting application with crash recovery...
echo Press Ctrl+C twice to exit permanently
echo.

:restart_loop
echo [%date% %time%] Starting JiraTime application...

REM Start the application and capture exit code
npm run start
set APP_EXIT_CODE=!ERRORLEVEL!

REM Check if the application exited normally (code 0) or was terminated by user (code 1)
if !APP_EXIT_CODE! equ 0 (
    echo [%date% %time%] Application exited normally.
    GOTO :end_normal
)

if !APP_EXIT_CODE! equ 1 (
    echo [%date% %time%] Application terminated by user.
    GOTO :end_normal
)

REM Any other exit code indicates a crash
echo.
echo [%date% %time%] Application crashed with exit code !APP_EXIT_CODE!
echo [%date% %time%] Logging crash and restarting in 5 seconds...

REM Log the crash with timestamp
echo [%date% %time%] Application crashed with exit code !APP_EXIT_CODE! >> "%~dp0\crash.log"

REM Wait 5 seconds with countdown
for /L %%i in (5,-1,1) do (
    echo Restarting in %%i seconds...
    timeout /t 1 /nobreak >nul
)

echo.
echo Restarting application...
echo.
GOTO :restart_loop

:end_normal
echo.
echo Application ended normally.
pause
exit /b 0
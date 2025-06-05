@ECHO OFF
setlocal EnableDelayedExpansion

if not exist "%~dp0\config\" mkdir "%~dp0\config\"

WHERE node >nul 2>nul
IF %ERRORLEVEL% NEQ 0 ( ECHO nodejs wasn't found, exiting && pause && EXIT /B 1 ) 

echo.
echo ========================================
echo        JiraTime Application
echo ========================================
echo.

cd /D "%~dp0"

REM Check for git and npm
WHERE git >nul 2>nul
IF %ERRORLEVEL% NEQ 0 ( 
    echo git wasn't found, skipping update and starting application directly
    call "%~dp0run.bat"
    exit /b 0
) 

WHERE npm >nul 2>nul
IF %ERRORLEVEL% NEQ 0 ( 
    echo npm wasn't found, skipping update and starting application directly
    call "%~dp0run.bat"
    exit /b 0
) 

echo Checking for updates...

REM Create a backup of critical files before updating
if exist "start.bat" copy "start.bat" "start_backup.bat" >nul 2>&1
if exist "update.bat" copy "update.bat" "update_backup.bat" >nul 2>&1
if exist "run.bat" copy "run.bat" "run_backup.bat" >nul 2>&1

REM Execute the update script and wait for it to complete
call "%~dp0update.bat"
set UPDATE_EXIT_CODE=%ERRORLEVEL%

REM Wait a moment for file system to settle after git operations
timeout /t 2 /nobreak >nul

REM Check if critical files were modified during git reset
set FILES_UPDATED=0

if exist "start_backup.bat" (
    fc "start.bat" "start_backup.bat" >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo start.bat was updated
        set FILES_UPDATED=1
    )
    del "start_backup.bat" >nul 2>&1
)

if exist "update_backup.bat" (
    fc "update.bat" "update_backup.bat" >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo update.bat was updated
        set FILES_UPDATED=1
    )
    del "update_backup.bat" >nul 2>&1
)

if exist "run_backup.bat" (
    fc "run.bat" "run_backup.bat" >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo run.bat was updated
        set FILES_UPDATED=1
    )
    del "run_backup.bat" >nul 2>&1
)

REM If critical files were updated, restart the entire process
if %FILES_UPDATED% EQU 1 (
    echo Critical files were updated, restarting application in 3 seconds...
    timeout /t 3 /nobreak >nul
    start "" "%~f0"
    exit /b 0
)

REM If update failed but no files were changed, continue anyway
if %UPDATE_EXIT_CODE% NEQ 0 (
    echo Update process had issues but continuing...
)

echo Starting application...

REM Start the application runner
call "%~dp0run.bat"

pause
exit /b 0
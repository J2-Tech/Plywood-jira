@ECHO OFF
setlocal EnableDelayedExpansion

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

REM Create backup of start.bat and run.bat before updating
if exist "start.bat" copy "start.bat" "start_backup.bat" >nul 2>&1
if exist "run.bat" copy "run.bat" "run_backup.bat" >nul 2>&1

REM Check if we need to use origin/main instead of github/main
git remote -v | findstr "github" >nul
if %ERRORLEVEL% NEQ 0 (
    echo Using origin/main instead of github/main
    git fetch --all
    git reset --hard origin/main
) else (
    echo Using github/main
    git fetch --all
    git reset --hard github/main
)

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

if exist "run_backup.bat" (
    fc "run.bat" "run_backup.bat" >nul 2>&1
    if %ERRORLEVEL% NEQ 0 (
        echo run.bat was updated
        set FILES_UPDATED=1
    )
    del "run_backup.bat" >nul 2>&1
)

REM Check if package.json was updated (indicating need for npm install)
git diff --name-only HEAD@{1} HEAD 2>nul | findstr "package.json" >nul
if %ERRORLEVEL% EQU 0 (
    echo package.json was updated, running npm install...
    npm install
) else (
    REM Run npm install anyway to ensure dependencies are up to date
    npm install
)

REM If critical files were updated, restart the entire process
if %FILES_UPDATED% EQU 1 (
    echo Critical files were updated, restarting application...
    start "" "%~dp0start.bat"
    exit /b 0
)

echo Update completed, starting application...

REM Start the application runner
call "%~dp0run.bat"

exit /b 0

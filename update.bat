@ECHO OFF
setlocal EnableDelayedExpansion

cd /D "%~dp0"

echo Performing git update...

REM Check if we need to use origin/main instead of github/main
git remote -v | findstr "github" >nul
if %ERRORLEVEL% NEQ 0 (
    echo Using origin/main
    git fetch --all
    git reset --hard origin/main
) else (
    echo Using github/main
    git fetch --all
    git reset --hard github/main
)

REM Check if git operations succeeded
if %ERRORLEVEL% NEQ 0 (
    echo Git update failed
    exit /b 1
)

echo Git update completed successfully

REM Run npm install to update dependencies
echo Running npm install...
npm install
if %ERRORLEVEL% NEQ 0 (
    echo npm install failed but continuing
    exit /b 2
)

echo Dependencies updated successfully
exit /b 0

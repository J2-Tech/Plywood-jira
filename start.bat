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
echo Checking for updates and starting application...
echo.

cd /D "%~dp0"

REM Execute the update script which will then start the application
call "%~dp0update.bat"

REM If update script returns, we're done
pause
exit /b 0
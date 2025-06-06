@ECHO OFF
setlocal EnableDelayedExpansion

cd /D "%~dp0"

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

REM Start the application and capture exit code, suppress any prompts
npm run start <nul 2>&1
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
    ping 127.0.0.1 -n 2 >nul 2>&1
)

echo.
echo Restarting application...
echo.
GOTO :restart_loop

:end_normal
echo.
echo Application ended normally.
exit /b 0

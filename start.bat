ECHO OFF
if not exist "%~dp0\config\" mkdir "%~dp0\config\"

WHERE node >nul 2>nul
IF %ERRORLEVEL% NEQ 0 ( ECHO nodejs wasn't found, exiting && pause && EXIT /B 1 ) 
WHERE git >nul 2>nul
IF %ERRORLEVEL% NEQ 0 ( ECHO git wasn't found, skipping update  && GOTO :start ) 
WHERE npm >nul 2>nul
IF %ERRORLEVEL% NEQ 0 ( ECHO npm wasn't found, skipping update  && GOTO :start ) 



cd /D "%~dp0"
git fetch --all
git reset --hard github/main

npm install & npm run start 
pause
exit

:start
cd /D "%~dp0"
npm run start
pause
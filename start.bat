ECHO OFF
WHERE nodeaa >nul 2>nul
IF %ERRORLEVEL% NEQ 0 ( ECHO nodejs wasn't found, exiting && pause && EXIT /B 1 ) 
WHERE git >nul 2>nul
IF %ERRORLEVEL% NEQ 0 ( ECHO git wasn't found, skipping update  && GOTO :start ) 
WHERE npm >nul 2>nul
IF %ERRORLEVEL% NEQ 0 ( ECHO npm wasn't found, skipping update  && GOTO :start ) 

cd /D "%~dp0"
git pull
npm install & npm run start
exit

:start
cd /D "%~dp0"
npm run start
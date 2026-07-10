@echo off
setlocal
cd /d "%~dp0"

echo.
echo ============================================================
echo  S4 - Publish Firestore Rules (products delete fix)
echo  Project: s4-business-thinking-31213
echo ============================================================
echo.
echo Option A - Firebase Console (no CLI login needed):
echo   1. Open: https://console.firebase.google.com/project/s4-business-thinking-31213/firestore/rules
echo   2. Select all existing rules and delete them
echo   3. Open file: firestore.rules in this folder
echo   4. Copy ALL content and paste in Firebase Console
echo   5. Click Publish
echo.
echo Option B - Firebase CLI deploy:
echo   firebase login
echo   firebase deploy --only firestore:rules --project s4-business-thinking-31213
echo.

choice /C AB /M "Open Firebase Console now (A) or run CLI deploy (B)"
if errorlevel 2 goto cli_deploy
if errorlevel 1 goto open_console

:open_console
start "" "https://console.firebase.google.com/project/s4-business-thinking-31213/firestore/rules"
echo.
echo Firebase Console opened. Paste firestore.rules content and Publish.
pause
exit /b 0

:cli_deploy
firebase login
if errorlevel 1 (
  echo Firebase login failed.
  pause
  exit /b 1
)
firebase deploy --only firestore:rules --project s4-business-thinking-31213
if errorlevel 1 (
  echo Deploy failed.
  pause
  exit /b 1
)
echo.
echo Firestore rules deployed successfully.
pause
exit /b 0

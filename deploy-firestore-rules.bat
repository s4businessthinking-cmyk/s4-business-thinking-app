@echo off
setlocal
cd /d "%~dp0"

echo.
echo ============================================================
echo  S4 - Publish Firestore Rules
echo  Project: s4-business-thinking-31213
echo ============================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js is required.
  pause
  exit /b 1
)

node scripts\deploy-firestore-rules.cjs
if not errorlevel 1 goto done

echo.
echo CLI deploy unavailable. Copying rules to clipboard...
powershell -NoProfile -Command "Get-Content -Raw 'firestore.rules' | Set-Clipboard"
echo Rules copied to clipboard.
start "" "https://console.firebase.google.com/project/s4-business-thinking-31213/firestore/rules"
echo.
echo 1. Firebase Console opened
echo 2. firestore.rules is already in your clipboard
echo 3. Select all old rules, paste, click Publish
echo.

:done
pause
exit /b 0

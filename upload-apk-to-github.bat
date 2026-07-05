@echo off
setlocal

cd /d "%~dp0"

if not defined GH_TOKEN (
  echo ERROR: GH_TOKEN is not set.
  echo.
  echo Create a GitHub token with "repo" scope, then run:
  echo   set GH_TOKEN=your_token_here
  echo   upload-apk-to-github.bat
  echo.
  exit /b 1
)

for /f "usebackq tokens=*" %%V in (`node -p "require('./package.json').version"`) do set APP_VERSION=%%V
set APK_FILE=S4-Business-Thinking-%APP_VERSION%.apk

if not exist "%APK_FILE%" (
  if exist "android\app\build\outputs\apk\release\app-release.apk" (
    copy /Y "android\app\build\outputs\apk\release\app-release.apk" "%APK_FILE%"
  ) else (
    echo ERROR: APK not found. Run npm run android:build first.
    exit /b 1
  )
)

where gh >nul 2>&1
if errorlevel 1 (
  echo ERROR: GitHub CLI ^(gh^) is not installed.
  echo Install it, then run: gh auth login
  exit /b 1
)

echo Uploading %APK_FILE% to release v%APP_VERSION%...
gh release upload "v%APP_VERSION%" "%APK_FILE%" --clobber
if errorlevel 1 exit /b 1

echo.
echo SUCCESS
echo https://github.com/s4businessthinking-cmyk/s4-business-thinking-app/releases/tag/v%APP_VERSION%

endlocal

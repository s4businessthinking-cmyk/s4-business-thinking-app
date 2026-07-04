@echo off
setlocal

cd /d "%~dp0"

echo ============================================
echo S4 Business Thinking - GitHub Release
echo ============================================
echo.
echo This will:
echo   1. Build Windows installer
echo   2. Publish to GitHub Releases (auto-update for PC)
echo   3. Build Android APK
echo   4. Upload APK to the same GitHub Release
echo.
echo Requirements:
echo   - Git tag must exist, example: v1.0.3
echo   - package.json version must match tag
echo   - GH_TOKEN environment variable with repo access
echo.

if not defined GH_TOKEN (
  echo ERROR: GH_TOKEN is not set.
  echo.
  echo Create a GitHub Personal Access Token with "repo" scope, then run:
  echo   set GH_TOKEN=your_token_here
  echo   publish-github-release.bat
  echo.
  goto :fail
)

for /f "usebackq tokens=*" %%V in (`node -p "require('./package.json').version"`) do set APP_VERSION=%%V
echo Current version: %APP_VERSION%
echo Expected git tag: v%APP_VERSION%
echo.

git describe --tags --exact-match "v%APP_VERSION%" >nul 2>&1
if errorlevel 1 (
  echo ERROR: Git tag v%APP_VERSION% not found.
  echo.
  echo Run these first:
  echo   git add .
  echo   git commit -m "Release v%APP_VERSION%"
  echo   git tag v%APP_VERSION%
  echo   git push origin HEAD
  echo   git push origin v%APP_VERSION%
  echo.
  goto :fail
)

echo [1/3] Publishing Windows installer...
call npm run desktop:publish
if errorlevel 1 goto :fail

echo [2/3] Building Android APK...
call npm run android:build
if errorlevel 1 goto :fail

echo [3/3] Uploading APK to GitHub Release...
where gh >nul 2>&1
if errorlevel 1 (
  echo.
  echo WARNING: GitHub CLI ^(gh^) not installed.
  echo Upload this file manually to the v%APP_VERSION% release:
  echo   android\app\build\outputs\apk\release\app-release.apk
  goto :done
)

gh release upload "v%APP_VERSION%" "android/app/build/outputs/apk/release/app-release-unsigned.apk#S4-Business-Thinking-%APP_VERSION%.apk" --clobber
if errorlevel 1 (
  gh release upload "v%APP_VERSION%" "android/app/build/outputs/apk/release/app-release.apk#S4-Business-Thinking-%APP_VERSION%.apk" --clobber
)
if errorlevel 1 goto :fail

:done
echo.
echo SUCCESS
echo Release URL:
echo   https://github.com/s4businessthinking-cmyk/s4-business-thinking-app/releases/tag/v%APP_VERSION%
echo.
echo Users can install:
echo   Windows: download .exe from Releases
echo   Android: download .apk from Releases
echo Auto-update:
echo   Windows app checks GitHub automatically
echo   Mobile app shows update in Settings ^> App Update
goto :end

:fail
echo.
echo Release failed.
exit /b 1

:end
endlocal

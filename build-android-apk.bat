@echo off
setlocal

cd /d "%~dp0"

echo [S4] Building web app for Android (no service worker cache)...
call npm run build:android-web
if errorlevel 1 goto :fail

echo [S4] Copying dist to Android assets...
call node scripts\sync-android-assets.cjs
if errorlevel 1 goto :fail

set "JAVA_EXE="
set "ANDROID_SDK="

for %%J in (
  "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe"
  "%LOCALAPPDATA%\Programs\Android Studio\jbr\bin\java.exe"
  "%ProgramFiles%\Java\jdk-21\bin\java.exe"
) do (
  if exist %%~J (
    set "JAVA_EXE=%%~J"
    goto :found_java
  )
)

:found_java
if not defined JAVA_EXE (
  echo.
  echo ERROR: Java JDK not found.
  echo.
  echo Install Android Studio from:
  echo   https://developer.android.com/studio
  echo.
  echo Then either:
  echo   1^) Run this script again: build-android-apk.bat
  echo   2^) Open Android Studio ^> Open folder: android ^> Build ^> Build APK
  goto :fail
)

for %%S in (
  "%LOCALAPPDATA%\Android\Sdk"
  "%USERPROFILE%\AppData\Local\Android\Sdk"
) do (
  if exist %%~S (
    set "ANDROID_SDK=%%~S"
    goto :found_sdk
  )
)

:found_sdk
if not defined ANDROID_SDK (
  echo.
  echo ERROR: Android SDK not found.
  echo Open Android Studio once and install Android SDK Platform + Build Tools.
  goto :fail
)

set "JAVA_HOME=%JAVA_EXE:\bin\java.exe=%"
set "ANDROID_HOME=%ANDROID_SDK%"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%PATH%"

echo [S4] JAVA_HOME=%JAVA_HOME%
echo [S4] ANDROID_HOME=%ANDROID_HOME%
echo [S4] Building release APK v1.0.3...

cd android
call gradlew.bat assembleRelease
if errorlevel 1 goto :fail

echo.
echo SUCCESS
echo Version: 1.0.3
echo APK path:
echo   android\app\build\outputs\apk\release\
echo.
dir /b "app\build\outputs\apk\release\*.apk"
goto :end

:fail
echo.
echo Build failed.
exit /b 1

:end
endlocal

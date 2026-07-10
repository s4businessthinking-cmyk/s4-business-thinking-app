@echo off
setlocal

cd /d "%~dp0"

echo ============================================
echo S4 Business Thinking - ONE CLICK RELEASE
echo ============================================
echo.
echo Ekta command e sob jaygay update hobe:
echo   - Windows EXE
echo   - Android APK
echo   - OTA bundle.zip
echo   - USB folder: ..\S4-CUSTOMER-DELIVERY
echo   - Project folder: release
echo   - GitHub Releases
echo.
echo Age package.json e version baran (example: 1.0.19)
echo.

node scripts\publish-all-release.cjs
if errorlevel 1 goto :fail

echo.
echo SUCCESS - ekbar e sob jaygay update hoyeche.
goto :end

:fail
echo.
echo One-click release failed.
exit /b 1

:end
endlocal

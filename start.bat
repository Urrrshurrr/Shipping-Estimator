@echo off
title NAS Shipping Estimator

cd /d "%~dp0app"

echo Installing dependencies...
call npm install

echo.
echo Starting Electron app...
call npm run dev 2>nul

echo.
echo Application closed.
pause

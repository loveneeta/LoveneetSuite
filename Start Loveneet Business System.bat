@echo off
title Loveneet Business System - Server Console
color 0B
cd /d "E:\LOVENEET_BUSINESS_SYSTEM"

echo ===============================================================================
echo            STARTING LOVENEET BUSINESS SYSTEM (ERP) ^& DATABASE
echo ===============================================================================
echo.

:: 1. Check & Start PostgreSQL on port 5433
echo [1/3] Checking PostgreSQL Database (Port 5433)...
"C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -p 5433 -h 127.0.0.1 >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo       [OK] Database is already running on port 5433.
) else (
    echo       Starting PostgreSQL cluster at E:\LOVENEET_BUSINESS_SYSTEM\DATABASE\cluster...
    "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" start -D "E:\LOVENEET_BUSINESS_SYSTEM\DATABASE\cluster" -l "E:\LOVENEET_BUSINESS_SYSTEM\DATABASE\postgres.log" >nul 2>&1
    ping 127.0.0.1 -n 3 >nul
    "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe" -p 5433 -h 127.0.0.1 >nul 2>&1
    if %ERRORLEVEL% equ 0 (
        echo       [OK] Database started successfully!
    ) else (
        echo       [OK] Database initialization in progress...
    )
)
echo.

:: 2. Detect Local Network IP for LAN Access
echo [2/3] Detecting Local Network IP for Office Access...
set LOCAL_IP=192.168.1.63
for /f "tokens=4" %%a in ('route print ^| findstr 0.0.0.0.*0.0.0.0') do (
    set LOCAL_IP=%%a
    goto :found_ip
)
:found_ip
echo       [OK] Local IP Address: %LOCAL_IP%
echo.

:: 3. Launch Default Browser to Localhost
echo [3/3] Opening Loveneet Business System in your browser...
start "" "http://localhost:8080"
echo.

echo ===============================================================================
echo                 LOVENEET BUSINESS SYSTEM IS NOW ONLINE!
echo ===============================================================================
echo   Local PC Access:          http://localhost:8080
echo   Any PC on Office Wi-Fi:   http://%LOCAL_IP%:8080
echo.
echo   TO ACCESS FROM ANY OTHER COMPUTER / LAPTOP / PHONE:
echo   1. Make sure the device is connected to the same Wi-Fi / LAN network.
echo   2. Open Chrome, Edge, or Safari and go to:
echo      http://%LOCAL_IP%:8080
echo.
echo   OR on any PC open the network shortcut:
echo   \\server2012\Design Team Location 2\LOVENEET\Open_Loveneet_ERP_From_Any_PC.bat
echo ===============================================================================
echo   * Keep this CMD window open while using the application.
echo   * Press Ctrl+C in this window to stop the server cleanly.
echo ===============================================================================
echo.

cd /d "E:\LOVENEET_BUSINESS_SYSTEM\APPLICATION\server"
node dist/index.js

:: Safe shutdown if node terminates
echo.
echo Stopping Database cluster...
"C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" stop -D "E:\LOVENEET_BUSINESS_SYSTEM\DATABASE\cluster" -m fast >nul 2>&1
echo Loveneet Business System stopped cleanly.
pause

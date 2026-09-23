@echo off
rem ============================================================================
rem  Livn - START DEV SERVER
rem
rem  Double-click this file, or run it from any terminal.
rem  It starts PostgreSQL if needed, then Next.js on http://localhost:3777
rem
rem  Leave the window open while you work. Close it (or press Ctrl+C) to stop.
rem ============================================================================
title Livn Dev Server
cd /d "%~dp0.."

echo.
echo  ============================================
echo   Livn - Personal Life OS
echo  ============================================
echo.

rem --- 1. Database -----------------------------------------------------------
call "%~dp0ensure-pg.cmd"
if errorlevel 1 (
  echo.
  echo  [X] Database tidak bisa dijalankan.
  echo      Cek: C:\Users\raso8\pgsql17\pglog.txt
  echo.
  pause
  exit /b 1
)

rem --- 2. Dependencies ------------------------------------------------------
if not exist "node_modules\next" (
  echo  [..] node_modules belum ada, menjalankan npm install...
  call npm install
  if errorlevel 1 (
    echo  [X] npm install gagal.
    pause
    exit /b 1
  )
)

rem --- 3. Prisma client -----------------------------------------------------
if not exist "src\generated\prisma\client.ts" (
  echo  [..] Membuat Prisma client...
  call npx prisma generate
)

rem --- 4. Server -------------------------------------------------------------
echo.
echo  [OK] Buka di browser:  http://localhost:3777
echo       Tekan Ctrl+C untuk berhenti.
echo.
call npx next dev -p 3777

rem Reached only when the server exits.
echo.
echo  Server berhenti.
pause

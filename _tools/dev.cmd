@echo off
rem ============================================================================
rem  Livn - start the development server.
rem
rem  Ensures PostgreSQL is up first, then runs Next.js on a fixed port.
rem  Bounded: never blocks on a broken database.
rem ============================================================================
setlocal

if not exist "%~dp0ensure-pg.cmd" (
  echo [livn] ERROR: _tools\ensure-pg.cmd is missing.
  exit /b 1
)

call "%~dp0ensure-pg.cmd"
if errorlevel 1 (
  echo [livn] ERROR: database unavailable. Starting anyway would show empty pages.
  exit /b 1
)

pushd "%~dp0.."
echo [livn] Starting Next.js on http://localhost:3777
call npm run dev
popd

endlocal

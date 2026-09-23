@echo off
rem ============================================================================
rem  Livn - run every verification suite.
rem
rem  Each script exercises a domain against the real database and reports its
rem  own pass/fail count. Nothing is mocked, so a pass means the behaviour is
rem  genuinely correct rather than merely type-compatible.
rem
rem  Usage:  _tools\verify-all.cmd
rem  Exit:   0 = every suite passed
rem ============================================================================
setlocal EnableDelayedExpansion
cd /d "%~dp0.."

set "FAILED="

call "%~dp0ensure-pg.cmd" >nul 2>&1
if errorlevel 1 (
  echo [livn] Database unavailable. Cannot verify anything.
  exit /b 1
)

for %%S in (
  db-smoke
  verify-register
  verify-plan
  verify-habits
  verify-journal
  verify-analytics
  verify-finance
) do (
  echo.
  echo ============================================================
  echo   %%S
  echo ============================================================
  npx tsx "scripts\%%S.ts"
  if errorlevel 1 set "FAILED=!FAILED! %%S"
)

echo.
echo ============================================================
if defined FAILED goto :failed
echo   ALL SUITES PASSED
exit /b 0

:failed
echo   FAILED SUITES:!FAILED!
exit /b 1

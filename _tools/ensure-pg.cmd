@echo off
rem ============================================================================
rem  Livn - ensure the local PostgreSQL cluster is running.
rem
rem  Safe to call at any time and from anywhere:
rem    * exits immediately if the port already accepts connections
rem    * starts postgres.exe detached (never pg_ctl, which can block forever)
rem    * gives up after a bounded wait rather than hanging the caller
rem
rem  Usage:  _tools\ensure-pg.cmd
rem  Exit:   0 = database reachable, 1 = could not start
rem ============================================================================
setlocal EnableDelayedExpansion

set "PGBIN=C:\Users\raso8\pgsql17\pgsql\bin"
set "PGDATA=C:\Users\raso8\pgsql17\data"
set "PGPORT=5432"
set "WAIT_SECONDS=30"

rem A complete environment is required: postgres spawns helpers that fail with
rem 0xC0000142 when PATH / SystemRoot / TEMP are missing.
set "PATH=%PGBIN%;%SystemRoot%\system32;%SystemRoot%;%SystemRoot%\System32\Wbem;%SystemRoot%\System32\WindowsPowerShell\v1.0;%PATH%"

>"%TEMP%\livn-pg-probe.ps1" echo $c=New-Object Net.Sockets.TcpClient
>>"%TEMP%\livn-pg-probe.ps1" echo try{$t=$c.ConnectAsync('127.0.0.1',%PGPORT%);if($t.Wait(1500)-and$c.Connected){exit 0};exit 1}catch{exit 1}finally{$c.Dispose()}

powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\livn-pg-probe.ps1" >nul 2>&1
if !errorlevel! equ 0 (
  echo [livn] PostgreSQL already listening on %PGPORT%.
  endlocal & exit /b 0
)

if not exist "%PGDATA%\PG_VERSION" (
  echo [livn] ERROR: no PostgreSQL cluster at "%PGDATA%".
  endlocal & exit /b 1
)

echo [livn] Starting PostgreSQL...
start "livn-postgres" /min /b "%PGBIN%\postgres.exe" -D "%PGDATA%"

set /a ELAPSED=0
:wait
timeout /t 1 /nobreak >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%TEMP%\livn-pg-probe.ps1" >nul 2>&1
if !errorlevel! equ 0 (
  echo [livn] PostgreSQL ready on %PGPORT%.
  endlocal & exit /b 0
)
set /a ELAPSED+=1
if !ELAPSED! lss %WAIT_SECONDS% goto wait

echo [livn] ERROR: PostgreSQL did not become ready within %WAIT_SECONDS%s.
echo [livn] Check the server log: "C:\Users\raso8\pgsql17\pglog.txt"
endlocal & exit /b 1

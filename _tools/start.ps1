# Livn - START DEV SERVER (PowerShell)
#
#   .\_tools\start.ps1
#
# Starts PostgreSQL if it is not already listening, then runs Next.js on
# http://localhost:3777 in this window. Ctrl+C stops it.
#
# If PowerShell refuses to run the file, use:
#   powershell -ExecutionPolicy Bypass -File .\_tools\start.ps1

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot
$pgBin   = 'C:\Users\raso8\pgsql17\pgsql\bin'
$pgData  = 'C:\Users\raso8\pgsql17\data'
$nodeDir = 'C:\Program Files\nodejs'
$port    = 3777
$pgPort  = 5432

Write-Host ''
Write-Host ' ============================================' -ForegroundColor DarkCyan
Write-Host '  Livn - Personal Life OS' -ForegroundColor Cyan
Write-Host ' ============================================' -ForegroundColor DarkCyan
Write-Host ''

function Test-Port {
  param([int] $Port, [int] $TimeoutMs = 1200)
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync('127.0.0.1', $Port)
    return ($task.Wait($TimeoutMs) -and $client.Connected)
  } catch { return $false } finally { $client.Dispose() }
}

# --- 1. Database ------------------------------------------------------------
if (Test-Port -Port $pgPort) {
  Write-Host " [OK] PostgreSQL sudah jalan di port $pgPort" -ForegroundColor Green
} else {
  Write-Host " [..] Menjalankan PostgreSQL..." -ForegroundColor Yellow

  if (-not (Test-Path "$pgData\PG_VERSION")) {
    Write-Host " [X] Cluster PostgreSQL tidak ditemukan di $pgData" -ForegroundColor Red
    exit 1
  }

  # A complete environment is required: postgres spawns helper processes that
  # fail to initialise with 0xC0000142 when PATH / SystemRoot / TEMP are thin.
  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName         = "$pgBin\postgres.exe"
  $psi.Arguments        = "-D `"$pgData`""
  $psi.WorkingDirectory = $pgBin
  $psi.UseShellExecute  = $false
  $psi.CreateNoWindow   = $true
  $psi.EnvironmentVariables['PATH'] = "$pgBin;$env:SystemRoot\system32;$env:SystemRoot;$env:SystemRoot\System32\Wbem"
  foreach ($k in @('SystemRoot','windir','TEMP','TMP','USERPROFILE','APPDATA','COMPUTERNAME','NUMBER_OF_PROCESSORS','PATHEXT')) {
    $v = [Environment]::GetEnvironmentVariable($k)
    if ($v) { $psi.EnvironmentVariables[$k] = $v }
  }
  [void][System.Diagnostics.Process]::Start($psi)

  $deadline = (Get-Date).AddSeconds(30)
  while ((Get-Date) -lt $deadline -and -not (Test-Port -Port $pgPort)) {
    Start-Sleep -Milliseconds 500
  }

  if (Test-Port -Port $pgPort) {
    Write-Host " [OK] PostgreSQL siap" -ForegroundColor Green
  } else {
    Write-Host ' [X] PostgreSQL gagal start dalam 30 detik.' -ForegroundColor Red
    Write-Host "     Cek log: C:\Users\raso8\pgsql17\pglog.txt" -ForegroundColor DarkGray
    exit 1
  }
}

# --- 2. Dependencies --------------------------------------------------------
Set-Location $root

if (-not (Test-Path "$root\node_modules\next")) {
  Write-Host ' [..] npm install (pertama kali, agak lama)...' -ForegroundColor Yellow
  & "$nodeDir\npm.cmd" install
  if ($LASTEXITCODE -ne 0) { Write-Host ' [X] npm install gagal.' -ForegroundColor Red; exit 1 }
}

if (-not (Test-Path "$root\src\generated\prisma\client.ts")) {
  Write-Host ' [..] Membuat Prisma client...' -ForegroundColor Yellow
  & "$nodeDir\npx.cmd" prisma generate
}

# --- 3. Server --------------------------------------------------------------
Write-Host ''
Write-Host " [OK] Buka browser:  http://localhost:$port" -ForegroundColor Cyan
Write-Host '      Tekan Ctrl+C untuk berhenti.' -ForegroundColor DarkGray
Write-Host ''

# Run in the foreground so Ctrl+C actually stops it and logs stay visible.
& "$nodeDir\npx.cmd" next dev -p $port

Write-Host ''
Write-Host ' Server berhenti.' -ForegroundColor DarkGray

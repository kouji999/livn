# Livn - detached process launcher.
#
# Why a script and not an inline command
# -------------------------------------
# A dev server runs until it is killed. If it is started from a tool call that
# captures stdout, that call blocks for as long as the server lives - the
# stall this script exists to prevent.
#
# Start-Process with -RedirectStandardOutput hands the child its own file
# handles and returns immediately, so nothing can wait on it.

param(
  [ValidateSet('start', 'stop', 'status', 'restart')]
  [string] $Action = 'status'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot
$logDir  = Join-Path $root '.data'
$outLog  = Join-Path $logDir 'dev.out.log'
$errLog  = Join-Path $logDir 'dev.err.log'
$pidFile = Join-Path $logDir 'dev.pid'
$port    = 3777
$nodeDir = 'C:\Program Files\nodejs'

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

function Get-PortState {
  param([int] $Port)
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync('127.0.0.1', $Port)
    return ($task.Wait(1200) -and $client.Connected)
  } catch { return $false } finally { $client.Dispose() }
}

function Get-LivnDevProcess {
  if (-not (Test-Path $pidFile)) { return $null }
  $storedPid = (Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if (-not $storedPid) { return $null }
  $proc = Get-Process -Id ([int]$storedPid) -ErrorAction SilentlyContinue
  if ($proc -and $proc.ProcessName -eq 'node') { return $proc }
  return $null
}

function Show-Status {
  $proc = Get-LivnDevProcess
  $listening = Get-PortState -Port $port
  [pscustomobject]@{
    Port      = $port
    Listening = $listening
    Pid       = if ($proc) { $proc.Id } else { $null }
    Running   = [bool]$proc
  } | Format-List
  return $listening
}

switch ($Action) {
  'status' { [void](Show-Status) }

  'stop' {
    $proc = Get-LivnDevProcess
    if ($proc) {
      # Kill the tree: Next spawns child workers that would otherwise linger
      # and keep the port bound.
      & taskkill.exe /PID $proc.Id /T /F 2>$null | Out-Null
      Write-Output "stopped pid $($proc.Id)"
    } else {
      Write-Output 'no dev server tracked'
    }
    # A stale PID file is worse than none: it makes `status` lie.
    if (Test-Path $pidFile) { Remove-Item $pidFile -Force }
    Start-Sleep -Milliseconds 500
    Write-Output "port $port listening: $(Get-PortState -Port $port)"
  }

  'start' {
    if (Get-PortState -Port $port) {
      Write-Output "already listening on $port"
      break
    }

    # Truncate logs so a stale error from a previous run is never mistaken
    # for a current one.
    Set-Content -Path $outLog -Value '' -Encoding ASCII
    Set-Content -Path $errLog -Value '' -Encoding ASCII

    $nextBin = Join-Path $root 'node_modules\next\dist\bin\next'
    if (-not (Test-Path $nextBin)) {
      throw "Next.js is not installed. Run 'npm install' in $root first."
    }

    # Start-Process owns the redirect, so it returns as soon as the child is
    # created. No pipe is shared with this shell.
    $proc = Start-Process `
      -FilePath (Join-Path $nodeDir 'node.exe') `
      -ArgumentList @($nextBin, 'dev', '-p', "$port") `
      -WorkingDirectory $root `
      -RedirectStandardOutput $outLog `
      -RedirectStandardError $errLog `
      -WindowStyle Hidden `
      -PassThru

    Set-Content -Path $pidFile -Value $proc.Id -Encoding ASCII
    Write-Output "started pid $($proc.Id); waiting for port $port (bounded)"

    $deadline = (Get-Date).AddSeconds(120)
    while ((Get-Date) -lt $deadline) {
      if ($proc.HasExited) {
        Write-Output "PROCESS EXITED early with code $($proc.ExitCode)"
        Write-Output '--- stderr ---'
        Get-Content $errLog -Tail 40 -ErrorAction SilentlyContinue
        Write-Output '--- stdout ---'
        Get-Content $outLog -Tail 40 -ErrorAction SilentlyContinue
        break
      }
      if (Get-PortState -Port $port) {
        Write-Output "READY on http://localhost:$port"
        break
      }
      Start-Sleep -Milliseconds 700
    }

    if (-not (Get-PortState -Port $port)) {
      Write-Output 'TIMED OUT waiting for the port'
      Write-Output '--- stderr ---'
      Get-Content $errLog -Tail 40 -ErrorAction SilentlyContinue
      Write-Output '--- stdout ---'
      Get-Content $outLog -Tail 40 -ErrorAction SilentlyContinue
    }
  }

  'restart' {
    & $PSCommandPath -Action stop | Out-Null
    & $PSCommandPath -Action start
  }
}

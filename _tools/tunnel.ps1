# Livn - public tunnel.
#
#   .\_tools\tunnel.ps1            start or show status
#   .\_tools\tunnel.ps1 status     show the current URL
#   .\_tools\tunnel.ps1 stop       close the tunnel
#
# Exposes the local dev server on port 3777 through a Cloudflare quick tunnel.
#
# Why this and not a fixed-domain service:
#   * A quick tunnel needs no account, no token and no DNS setup, so a visitor
#     link can be produced in seconds.
#   * It forwards to the running dev server, so every change made locally shows
#     up for the visitor on refresh. Nothing has to be redeployed.
#
# Detached on purpose. A tunnel runs until it is killed; starting one from a
# call that captures stdout would block for as long as it lives.

param(
  [ValidateSet('start', 'stop', 'status', 'url')]
  [string] $Action = 'start'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$root    = Split-Path -Parent $PSScriptRoot
$logDir  = Join-Path $root '.data'
$outLog  = Join-Path $logDir 'tunnel.out.log'
$errLog  = Join-Path $logDir 'tunnel.err.log'
$pidFile = Join-Path $logDir 'tunnel.pid'
$urlFile = Join-Path $logDir 'tunnel.url.txt'
$port    = 3777

if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

function Get-CloudflaredPath {
  $command = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }

  # winget installs to a versioned WindowsApps alias that may not be on PATH in
  # a non-interactive shell, so the usual locations are probed directly.
  $candidates = @(
    "$env:ProgramFiles\cloudflared\cloudflared.exe",
    "${env:ProgramFiles(x86)}\cloudflared\cloudflared.exe",
    "$env:LOCALAPPDATA\Microsoft\WinGet\Links\cloudflared.exe"
  )
  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }

  $found = Get-ChildItem -Path "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse `
    -Filter 'cloudflared.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($found) { return $found.FullName }

  throw 'cloudflared not found. Install it with: winget install Cloudflare.cloudflared'
}

function Get-TunnelUrl {
  if (-not (Test-Path $outLog)) { return $null }
  $match = Select-String -Path $outLog -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' `
    -AllMatches -ErrorAction SilentlyContinue | Select-Object -Last 1
  if (-not $match) { return $null }
  return $match.Matches[0].Value
}

function Test-Port {
  param([int] $Port)
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync('127.0.0.1', $Port)
    return ($task.Wait(1200) -and $client.Connected)
  } catch { return $false } finally { $client.Dispose() }
}

function Get-TunnelProcess {
  if (-not (Test-Path $pidFile)) { return $null }
  $stored = Get-Content $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $stored) { return $null }
  $process = Get-Process -Id ([int]$stored) -ErrorAction SilentlyContinue
  if ($process -and $process.ProcessName -like 'cloudflared*') { return $process }
  return $null
}

switch ($Action) {
  'stop' {
    $process = Get-TunnelProcess
    if ($process) {
      & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
      Write-Output "stopped tunnel pid $($process.Id)"
    } else {
      Write-Output 'no tunnel running'
    }
    if (Test-Path $pidFile) { Remove-Item $pidFile -Force }
    if (Test-Path $outLog) { Remove-Item $outLog -Force }
  }

  'url' {
    # The persisted file survives log truncation, so it is the first source.
    if (Test-Path $urlFile) {
      $persisted = (Get-Content $urlFile -ErrorAction SilentlyContinue | Select-Object -First 1)
      if ($persisted) { Write-Output $persisted; break }
    }
    $url = Get-TunnelUrl
    if ($url) { Write-Output $url } else { Write-Output '(no url yet)' }
  }

  'status' {
    $process = Get-TunnelProcess
    $url = Get-TunnelUrl
    [pscustomobject]@{
      Running      = [bool]$process
      Pid          = if ($process) { $process.Id } else { $null }
      Url          = $url
      LocalServer  = Test-Port -Port $port
    } | Format-List
  }

  'start' {
    if (-not (Test-Port -Port $port)) {
      throw "Nothing is listening on port $port. Start the dev server first: _tools\start.ps1"
    }

    $existing = Get-TunnelProcess
    if ($existing) {
      $url = Get-TunnelUrl
      Write-Output "tunnel already running (pid $($existing.Id))"
      if ($url) { Write-Output $url }
      break
    }

    $exe = Get-CloudflaredPath
    Set-Content -Path $outLog -Value '' -Encoding ASCII
    Set-Content -Path $errLog -Value '' -Encoding ASCII

    # Start-Process owns the redirect, so this returns as soon as the child is
    # created. No pipe is shared with the caller.
    $process = Start-Process `
      -FilePath $exe `
      -ArgumentList @('tunnel', '--url', "http://localhost:$port", '--no-autoupdate') `
      -WorkingDirectory $root `
      -RedirectStandardOutput $outLog `
      -RedirectStandardError $errLog `
      -WindowStyle Hidden `
      -PassThru

    Set-Content -Path $pidFile -Value $process.Id -Encoding ASCII
    Write-Output "starting tunnel (pid $($process.Id)); waiting for the public URL"

    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
      if ($process.HasExited) {
        Write-Output "cloudflared exited early with code $($process.ExitCode)"
        Get-Content $errLog -Tail 20 -ErrorAction SilentlyContinue
        break
      }
      $url = Get-TunnelUrl
      if ($url) {
        Write-Output ''
        Write-Output "  PUBLIC URL: $url"
        # Persisted so the link can be retrieved later without re-reading logs.
        Set-Content -Path $urlFile -Value $url -Encoding ASCII
        Write-Output ''
        break
      }
      Start-Sleep -Milliseconds 700
    }

    if (-not (Get-TunnelUrl)) {
      Write-Output 'timed out waiting for a URL'
      Get-Content $errLog -Tail 20 -ErrorAction SilentlyContinue
    }
  }
}

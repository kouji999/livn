# Livn ??" safe command runner.
#
# Why this exists
# ---------------
# Two environment defects in this shell were causing commands to block
# indefinitely:
#
#   1. Child processes inherited a truncated PATH, so postgres backend
#      processes died with 0xC0000142 ("DLL initialisation failed") and any
#      supervising tool (pg_ctl, npm) waited on them forever.
#   2. Native commands were invoked with no timeout, so a blocked read on
#      stdout/stderr never returned and the whole agent stalled.
#
# This module fixes both. Every external process is started with an explicit,
# complete environment and a hard timeout, and output is drained on background
# tasks so a full pipe buffer can never deadlock the parent.
#
# Usage:
#   . .\_tools\safe.ps1
#   Invoke-Safe -FilePath psql.exe -Arguments @('-c','SELECT 1')

Set-StrictMode -Version Latest

$script:LivnPgBin = 'C:\Users\raso8\pgsql17\pgsql\bin'
$script:LivnPgData = 'C:\Users\raso8\pgsql17\data'

function Get-LivnBaselinePath {
  <#
    A PATH that is always sufficient for Windows service-hosted binaries.
    Anything narrower makes postgres.exe fail to spawn its backends.
  #>
  $parts = @(
    $script:LivnPgBin
    "$env:SystemRoot\system32"
    $env:SystemRoot
    "$env:SystemRoot\System32\Wbem"
    "$env:SystemRoot\System32\WindowsPowerShell\v1.0"
    "$env:SystemRoot\System32\OpenSSH"
    $env:APPDATA + '\npm'
  )
  # Keep whatever the caller already had, minus the broken duplicates.
  if ($env:PATH) { $parts += ($env:PATH -split ';' | Where-Object { $_ -and $_ -notin $parts }) }
  return ($parts | Select-Object -Unique) -join ';'
}

function ConvertTo-CommandLineArgument {
  <#
    Serialise an argument array into a command line string that Windows
    CreateProcess will parse back into exactly the original arguments.

    Needed because .NET Framework's ProcessStartInfo has no ArgumentList, and
    naive joining corrupts values containing spaces, quotes or trailing
    backslashes (all of which occur in SQL and file paths).
  #>
  param([string[]] $Arguments = @())

  $built = foreach ($arg in $Arguments) {
    if ($null -eq $arg) { '""'; continue }
    if ($arg.Length -gt 0 -and $arg -notmatch '[\s"]') { $arg; continue }

    $sb = [System.Text.StringBuilder]::new()
    [void]$sb.Append('"')
    $backslashes = 0
    foreach ($ch in $arg.ToCharArray()) {
      if ($ch -eq '\') {
        $backslashes++
        continue
      }
      if ($ch -eq '"') {
        # Backslashes before a quote must be doubled, and the quote escaped.
        [void]$sb.Append('\' * ($backslashes * 2 + 1))
        [void]$sb.Append('"')
        $backslashes = 0
        continue
      }
      if ($backslashes -gt 0) { [void]$sb.Append('\' * $backslashes); $backslashes = 0 }
      [void]$sb.Append($ch)
    }
    # Trailing backslashes would escape the closing quote, so double them.
    if ($backslashes -gt 0) { [void]$sb.Append('\' * ($backslashes * 2)) }
    [void]$sb.Append('"')
    $sb.ToString()
  }

  return ($built -join ' ')
}

function Invoke-Safe {
  <#
  .SYNOPSIS
    Run an external process with a guaranteed timeout and drained streams.
  .DESCRIPTION
    Never blocks indefinitely. If the process overruns -TimeoutSeconds the
    whole tree is killed and a structured failure is returned instead of a
    hang. Output is captured on background tasks so large stdout cannot fill
    the pipe buffer and deadlock the process.
  #>
  [CmdletBinding()]
  param(
    [Parameter(Mandatory)][string] $FilePath,
    [string[]] $Arguments = @(),
    [string] $WorkingDirectory = (Get-Location).Path,
    [int] $TimeoutSeconds = 60,
    [hashtable] $Environment = @{},
    [switch] $NoFixedPath
  )

  $bin = if ([System.IO.Path]::IsPathRooted($FilePath)) { $FilePath } else {
    $resolved = Get-Command $FilePath -ErrorAction SilentlyContinue
    if (-not $resolved) { throw "Executable not found on PATH: $FilePath" }
    $resolved.Source
  }

  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName               = $bin
  $psi.WorkingDirectory       = $WorkingDirectory
  $psi.UseShellExecute        = $false
  $psi.CreateNoWindow         = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError  = $true
  $psi.RedirectStandardInput  = $true

  # Windows PowerShell 5.1 targets .NET Framework, which has no ArgumentList.
  # Quote each argument defensively so paths and SQL survive the round trip.
  $psi.Arguments = ConvertTo-CommandLineArgument -Arguments $Arguments

  # A complete environment is non-negotiable; a partial one breaks pg subprocesses.
  if (-not $NoFixedPath) { $psi.EnvironmentVariables['PATH'] = Get-LivnBaselinePath }
  foreach ($k in @('SystemRoot','windir','TEMP','TMP','USERPROFILE','APPDATA','LOCALAPPDATA','COMPUTERNAME','NUMBER_OF_PROCESSORS','PATHEXT')) {
    $v = [Environment]::GetEnvironmentVariable($k)
    if ($v) { $psi.EnvironmentVariables[$k] = $v }
  }
  foreach ($k in $Environment.Keys) { $psi.EnvironmentVariables[$k] = [string]$Environment[$k] }

  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  $proc = [System.Diagnostics.Process]::new()
  $proc.StartInfo = $psi
  [void]$proc.Start()
  $proc.StandardInput.Close()

  # Drain on background tasks: a process that writes more than the OS pipe
  # buffer will block forever if nobody is reading.
  $outTask = $proc.StandardOutput.ReadToEndAsync()
  $errTask = $proc.StandardError.ReadToEndAsync()

  $timedOut = -not $proc.WaitForExit($TimeoutSeconds * 1000)
  if ($timedOut) {
    try { $proc.Kill($true) } catch { }
    try { [void]$proc.WaitForExit(5000) } catch { }
  }
  $sw.Stop()

  $stdout = if ($outTask.IsCompleted) { $outTask.Result } else { '' }
  $stderr = if ($errTask.IsCompleted) { $errTask.Result } else { '' }

  [pscustomobject]@{
    FilePath   = $bin
    Arguments  = $Arguments
    ExitCode   = if ($timedOut) { $null } else { $proc.ExitCode }
    StdOut     = $stdout
    StdErr     = $stderr
    TimedOut   = $timedOut
    DurationMs = $sw.ElapsedMilliseconds
    Ok         = (-not $timedOut) -and $proc.ExitCode -eq 0
  }
}

function Assert-Safe {
  <#
    Invoke-Safe, but throws on failure and prints captured output.
    Use when a non-zero exit genuinely invalidates the next step.
  #>
  param(
    [Parameter(Mandatory)][string] $FilePath,
    [string[]] $Arguments = @(),
    [string] $WorkingDirectory = (Get-Location).Path,
    [int] $TimeoutSeconds = 60,
    [hashtable] $Environment = @{}
  )
  $r = Invoke-Safe @PSBoundParameters
  if ($r.StdOut) { Write-Output $r.StdOut.TrimEnd() }
  if ($r.StdErr) { Write-Host $r.StdErr.TrimEnd() -ForegroundColor DarkYellow }
  if ($r.TimedOut) { throw "TIMEOUT after ${TimeoutSeconds}s: $FilePath $($Arguments -join ' ')" }
  if (-not $r.Ok) { throw "FAILED (exit $($r.ExitCode)): $FilePath $($Arguments -join ' ')" }
  return $r
}

function Test-TcpPort {
  <# Non-blocking port probe. Preferred over Test-NetConnection, which can stall. #>
  param([string]$HostName = '127.0.0.1', [Parameter(Mandatory)][int]$Port, [int]$TimeoutMs = 2000)
  $client = [System.Net.Sockets.TcpClient]::new()
  try {
    $task = $client.ConnectAsync($HostName, $Port)
    if ($task.Wait($TimeoutMs) -and $client.Connected) { return $true }
    return $false
  } catch { return $false } finally { $client.Dispose() }
}

function Wait-TcpPort {
  <#
    Bounded wait for a port. Returns $true/$false ??" never blocks past TimeoutSeconds.
  #>
  param([string]$HostName = '127.0.0.1', [Parameter(Mandatory)][int]$Port, [int]$TimeoutSeconds = 30)
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-TcpPort -HostName $HostName -Port $Port -TimeoutMs 1000) { return $true }
    Start-Sleep -Milliseconds 400
  }
  return $false
}

function Get-LivnPostgresStatus {
  $running = @(Get-Process postgres -ErrorAction SilentlyContinue).Count
  [pscustomobject]@{
    ProcessCount = $running
    Listening    = Test-TcpPort -Port 5432
  }
}

function Start-LivnPostgres {
  <#
    Start the local cluster detached, with a complete environment.
    Idempotent: does nothing if the port already accepts connections.
  #>
  param([int] $TimeoutSeconds = 40)

  if (Test-TcpPort -Port 5432) { return [pscustomobject]@{ Started = $false; AlreadyRunning = $true } }

  $psi = [System.Diagnostics.ProcessStartInfo]::new()
  $psi.FileName         = "$script:LivnPgBin\postgres.exe"
  $psi.WorkingDirectory = $script:LivnPgBin
  $psi.UseShellExecute  = $false
  $psi.CreateNoWindow   = $true
  $psi.Arguments        = ConvertTo-CommandLineArgument -Arguments @('-D', $script:LivnPgData)
  $psi.EnvironmentVariables['PATH'] = Get-LivnBaselinePath
  foreach ($k in @('SystemRoot','windir','TEMP','TMP','USERPROFILE','APPDATA','COMPUTERNAME','NUMBER_OF_PROCESSORS','PATHEXT')) {
    $v = [Environment]::GetEnvironmentVariable($k)
    if ($v) { $psi.EnvironmentVariables[$k] = $v }
  }

  $proc = [System.Diagnostics.Process]::Start($psi)
  $ready = Wait-TcpPort -Port 5432 -TimeoutSeconds $TimeoutSeconds
  [pscustomobject]@{
    Started        = $true
    AlreadyRunning = $false
    Pid            = $proc.Id
    Ready          = $ready
  }
}

function Stop-LivnPostgres {
  <# Fast shutdown. Bounded ??" never waits on a broken backend. #>
  param([int] $TimeoutSeconds = 30)
  $r = Invoke-Safe -FilePath 'pg_ctl.exe' -Arguments @('-D', $script:LivnPgData, '-m', 'fast', 'stop') -TimeoutSeconds $TimeoutSeconds
  return $r
}

function Invoke-Psql {
  <# psql with the database pre-selected and no reliance on user-level config. #>
  param(
    [Parameter(Mandatory)][string] $Sql,
    [string] $Database = 'livn',
    [int] $TimeoutSeconds = 30
  )
  Invoke-Safe -FilePath "$script:LivnPgBin\psql.exe" `
    -Arguments @('-h','127.0.0.1','-p','5432','-U','postgres','-d',$Database,'-v','ON_ERROR_STOP=1','-tAc',$Sql) `
    -TimeoutSeconds $TimeoutSeconds
}

function Invoke-Npm {
  <# npm with a long but finite timeout and CI-friendly flags. #>
  param(
    [Parameter(Mandatory)][string[]] $Arguments,
    [int] $TimeoutSeconds = 600,
    [string] $WorkingDirectory = (Get-Location).Path
  )
  Invoke-Safe -FilePath 'npm.cmd' -Arguments $Arguments -TimeoutSeconds $TimeoutSeconds `
    -WorkingDirectory $WorkingDirectory -Environment @{ CI = 'true'; NO_COLOR = '1' }
}

Write-Host 'safe.ps1 loaded - every runner is timeout-bounded.' -ForegroundColor DarkGray

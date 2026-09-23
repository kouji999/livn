# Livn - run every verification and audit.
#
#   .\_tools\verify-all.ps1
#
# Two groups:
#   1. Behavioural suites, which exercise a domain against the real database.
#   2. Static audits, which check what behaviour cannot: dead links, unused
#      dependencies, documentation accuracy, missing route states, encoding.
#
# Written in PowerShell rather than batch. The batch version worked but could not
# report an accurate count: `set /a` inside a labelled subroutine does not persist
# across a `for` loop, and a runner that prints a wrong number is worse than one
# that prints none. PowerShell's arrays and exit codes have no such trap.
#
# Exit code 0 means every check passed.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$results = @()

function Invoke-Check {
  param(
    [Parameter(Mandatory)][string] $Name,
    [Parameter(Mandatory)][string] $Runner,
    [Parameter(Mandatory)][string] $Path
  )

  Write-Host ''
  Write-Host ('-' * 62) -ForegroundColor DarkGray
  Write-Host "  $Name" -ForegroundColor Cyan
  Write-Host ('-' * 62) -ForegroundColor DarkGray

  if ($Runner -eq 'python') {
    & python $Path
  } else {
    & npx tsx $Path
  }

  $ok = $LASTEXITCODE -eq 0
  $script:results += [pscustomobject]@{ Name = $Name; Passed = $ok }

  if (-not $ok) {
    Write-Host "  [FAIL] $Name exited with $LASTEXITCODE" -ForegroundColor Red
  }
}

# --- Database must be reachable before anything behavioural runs -------------
Write-Host ''
& (Join-Path $PSScriptRoot 'ensure-pg.cmd') | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host '[livn] Database unavailable. Cannot verify anything.' -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host '############ Behavioural suites ############' -ForegroundColor Yellow

$suites = @(
  'db-smoke'
  'verify-register'
  'verify-plan'
  'verify-habits'
  'verify-journal'
  'verify-analytics'
  'verify-finance'
  'verify-profile'
)

foreach ($suite in $suites) {
  Invoke-Check -Name $suite -Runner 'tsx' -Path "scripts\$suite.ts"
}

Write-Host ''
Write-Host '############ Static audits ############' -ForegroundColor Yellow

foreach ($audit in @('audit-links', 'audit-project', 'audit-security')) {
  Invoke-Check -Name $audit -Runner 'tsx' -Path "scripts\$audit.ts"
}

Invoke-Check -Name 'audit-encoding' -Runner 'python' -Path 'scripts\audit-encoding.py'

# --- Summary -----------------------------------------------------------------
$failed = @($results | Where-Object { -not $_.Passed })
$passed = $results.Count - $failed.Count

Write-Host ''
Write-Host ('=' * 62) -ForegroundColor DarkGray

if ($failed.Count -eq 0) {
  Write-Host "  ALL CHECKS PASSED  ($passed/$($results.Count))" -ForegroundColor Green
  exit 0
}

Write-Host "  PASSED $passed/$($results.Count)" -ForegroundColor Yellow
foreach ($item in $failed) {
  Write-Host "    FAILED: $($item.Name)" -ForegroundColor Red
}
exit 1

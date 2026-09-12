[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$securityTestShell = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $securityTestShell) { $securityTestShell = (Get-Command powershell -ErrorAction Stop).Source }

function Invoke-IsolatedSecurityTest {
  param([Parameter(Mandatory = $true)][string]$Path)

  & $securityTestShell -NoLogo -NoProfile -ExecutionPolicy Bypass -File $Path
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Invoke-IsolatedSecurityTest (Join-Path $PSScriptRoot "process-management.security.tests.ps1")
Invoke-IsolatedSecurityTest (Join-Path $PSScriptRoot "service-identity.security.tests.ps1")
Invoke-IsolatedSecurityTest (Join-Path $PSScriptRoot "verification-gate.security.tests.ps1")
Invoke-IsolatedSecurityTest (Join-Path $PSScriptRoot "..\..\..\04_docs\scripts\92-prepare-review-staging.security.tests.ps1")

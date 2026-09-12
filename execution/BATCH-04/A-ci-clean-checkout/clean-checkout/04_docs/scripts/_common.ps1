$ErrorActionPreference = "Stop"

function Get-ProjectRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
}

function Set-Utf8NoBomFile([string]$Path, [string]$Content) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Set-DotEnvValue([string]$Content, [string]$Name, [string]$Value) {
  $escaped = [regex]::Escape($Name)
  $line = "$Name=$Value"
  if ($Content -match "(?m)^$escaped=.*$") {
    return [regex]::Replace($Content, "(?m)^$escaped=.*$", $line)
  }
  return ($Content.TrimEnd() + "`r`n" + $line + "`r`n")
}

function Get-DotEnvValue([string]$Content, [string]$Name) {
  $escaped = [regex]::Escape($Name)
  $match = [regex]::Match($Content, "(?m)^$escaped=(?<value>.*)$")
  if (-not $match.Success) { return "" }
  return $match.Groups["value"].Value.Trim().Trim('"').Trim("'")
}

function Test-UsableLocalSecret([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
  $normalized = $Value.Trim().ToLowerInvariant()
  if ($normalized -in @("supersecret", "secret", "changeme", "change-me", "your-secret-here", "replace-me")) { return $false }
  return $Value.Trim().Length -ge 32
}

function Assert-DotEnvKey([string]$Content, [string]$Name, [string]$SourcePath) {
  $escaped = [regex]::Escape($Name)
  if ($Content -notmatch "(?m)^$escaped=") {
    throw "Upstream environment contract changed: $Name is missing from $SourcePath. Stop and inspect the checked-out starter instead of appending an assumed variable."
  }
}

function Get-PnpmExecutable([string]$Root, [string]$Version = "10") {
  $existing = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($existing) {
    try {
      $current = (& $existing.Source -v).Trim()
      if ($current -eq $Version -or ($Version -eq "10" -and $current.StartsWith("10."))) {
        return $existing.Source
      }
      Write-Host "[INFO] Global pnpm $current does not match required pnpm $Version; using an isolated matching version." -ForegroundColor Yellow
    } catch {}
  }

  $corepack = Get-Command corepack -ErrorAction SilentlyContinue
  if ($corepack) {
    try {
      Write-Host "Trying Corepack for pnpm $Version..." -ForegroundColor Cyan
      & corepack enable *> $null
      & corepack prepare "pnpm@$Version" --activate *> $null
      $existing = Get-Command pnpm -ErrorAction SilentlyContinue
      if ($existing) {
        $current = (& $existing.Source -v).Trim()
        if ($current -eq $Version -or ($Version -eq "10" -and $current.StartsWith("10."))) {
          return $existing.Source
        }
      }
    } catch {
      Write-Host "[WARN] Corepack could not activate pnpm without elevation. Falling back to project-local pnpm." -ForegroundColor Yellow
    }
  }

  $safeVersion = ($Version -replace "[^0-9A-Za-z._-]", "_")
  $ToolPrefix = Join-Path $Root ".tooling/pnpm-$safeVersion"
  $PnpmCmd = Join-Path $ToolPrefix "node_modules/.bin/pnpm.cmd"
  if (-not (Test-Path $PnpmCmd)) {
    New-Item -ItemType Directory -Force -Path $ToolPrefix | Out-Null
    Write-Host "Installing project-local pnpm $Version (no admin rights required)..." -ForegroundColor Cyan
    # Important: send npm output to the host instead of the function output pipeline.
    # Otherwise PowerShell may treat npm's status text as part of this function's return value,
    # corrupting the pnpm executable path stored by callers.
    & npm install --prefix $ToolPrefix "pnpm@$Version" --no-audit --no-fund 2>&1 | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Local pnpm installation failed" }
  }
  return $PnpmCmd
}

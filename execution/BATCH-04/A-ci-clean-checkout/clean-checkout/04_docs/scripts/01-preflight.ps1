$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")

function Require-Command($Name) {
  $cmd = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $cmd) {
    Write-Host "[FAIL] Missing: $Name" -ForegroundColor Red
    return $false
  }
  Write-Host "[OK] $Name -> $($cmd.Source)" -ForegroundColor Green
  return $true
}

function Test-PortAvailable([int]$Port) {
  try {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue
    if ($listener) {
      Write-Host "[FAIL] Port $Port is already in use." -ForegroundColor Red
      return $false
    }
  } catch {
    Write-Host "[WARN] Could not inspect port $Port; continuing." -ForegroundColor Yellow
  }
  Write-Host "[OK] Port $Port is available" -ForegroundColor Green
  return $true
}

Write-Host "CrossBorder Independent Store - Windows Preflight" -ForegroundColor Cyan
$ok = $true
$ok = (Require-Command "git") -and $ok
$ok = (Require-Command "node") -and $ok
$ok = (Require-Command "npm") -and $ok
$ok = (Require-Command "docker") -and $ok

if (Get-Command node -ErrorAction SilentlyContinue) {
  $nodeVersion = (& node -v).Trim()
  Write-Host "Node: $nodeVersion"
  $parts = ($nodeVersion -replace '^v','').Split('.')
  $major = [int]$parts[0]
  $minor = [int]$parts[1]
  if (($major -eq 20 -and $minor -ge 19) -or ($major -ge 22 -and (($major -gt 22) -or $minor -ge 12))) {
    Write-Host "[OK] Node satisfies the current DTC Starter engine (^20.19.0 || >=22.12.0)." -ForegroundColor Green
  } else {
    Write-Host "[FAIL] Current DTC Starter requires Node ^20.19.0 or >=22.12.0." -ForegroundColor Red
    $ok = $false
  }
}

if (Get-Command docker -ErrorAction SilentlyContinue) {
  try {
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) { throw "docker info failed" }
    Write-Host "[OK] Docker engine is running" -ForegroundColor Green

    $osType = (& docker info --format '{{.OSType}}').Trim()
    if ($osType -ne "linux") {
      Write-Host "[FAIL] Docker must be using Linux containers. Current OSType: $osType" -ForegroundColor Red
      $ok = $false
    } else {
      Write-Host "[OK] Docker is using Linux containers" -ForegroundColor Green
    }

    & docker compose version *> $null
    if ($LASTEXITCODE -ne 0) { throw "docker compose unavailable" }
    Write-Host "[OK] Docker Compose is available" -ForegroundColor Green
  } catch {
    Write-Host "[FAIL] Docker CLI exists but Docker Desktop/engine/Compose is not ready." -ForegroundColor Red
    $ok = $false
  }
}

$ok = (Test-PortAvailable 54329) -and $ok
$ok = (Test-PortAvailable 9000) -and $ok
$ok = (Test-PortAvailable 8000) -and $ok

$Root = Get-ProjectRoot
try {
  $driveName = (Get-Item $Root).PSDrive.Name
  $drive = Get-PSDrive $driveName
  $freeGB = [math]::Round($drive.Free / 1GB, 1)
  Write-Host "Free disk space on $driveName`: $freeGB GB"
  if ($freeGB -lt 4) {
    Write-Host "[FAIL] Less than 4 GB free. Docker image + dependencies may fail." -ForegroundColor Red
    $ok = $false
  } elseif ($freeGB -lt 10) {
    Write-Host "[WARN] Less than 10 GB free; installation may be tight." -ForegroundColor Yellow
  } else {
    Write-Host "[OK] Disk space is sufficient" -ForegroundColor Green
  }
} catch {
  Write-Host "[WARN] Could not check disk space." -ForegroundColor Yellow
}

if (Get-Command pnpm -ErrorAction SilentlyContinue) {
  Write-Host "[OK] pnpm $(& pnpm -v)"
} else {
  Write-Host "[INFO] pnpm is not installed globally. Preparation script can use Corepack or a project-local pnpm 10 without admin rights." -ForegroundColor Yellow
}

Write-Host "Checking outbound access..." -ForegroundColor Cyan
try {
  & git ls-remote https://github.com/medusajs/dtc-starter.git HEAD *> $null
  if ($LASTEXITCODE -ne 0) { throw "git ls-remote failed" }
  Write-Host "[OK] GitHub reachable" -ForegroundColor Green
} catch {
  $archiveUrl = "https://codeload.github.com/medusajs/dtc-starter/zip/refs/heads/main"
  try {
    & curl.exe --noproxy '*' -I -L --fail --silent --show-error --max-time 15 $archiveUrl *> $null
    if ($LASTEXITCODE -ne 0) { throw "official archive endpoint failed" }
    Write-Host "[WARN] Git clone/ls-remote is unavailable, but the official archive is reachable: FALLBACK_AVAILABLE" -ForegroundColor Yellow
  } catch {
    Write-Host "[FAIL] Both GitHub git access and the official DTC Starter archive are unavailable." -ForegroundColor Red
    $ok = $false
  }
}
try {
  $null = & npm view pnpm version
  if ($LASTEXITCODE -ne 0) { throw "npm view failed" }
  Write-Host "[OK] npm registry reachable" -ForegroundColor Green
} catch {
  Write-Host "[FAIL] npm registry not reachable from this terminal." -ForegroundColor Red
  $ok = $false
}
if (Get-Command docker -ErrorAction SilentlyContinue) {
  try {
    & docker manifest inspect postgres:16-alpine *> $null
    if ($LASTEXITCODE -ne 0) { throw "manifest lookup failed" }
    Write-Host "[OK] Docker registry can resolve postgres:16-alpine" -ForegroundColor Green
  } catch {
    & docker image inspect postgres:16-alpine *> $null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "[WARN] Docker manifest inspect was unavailable, but postgres:16-alpine is present locally: REGISTRY_REACHABLE_BY_LOCAL_IMAGE" -ForegroundColor Yellow
    } else {
      Write-Host "[FAIL] Docker manifest inspect failed and postgres:16-alpine is not present locally." -ForegroundColor Red
      $ok = $false
    }
  }
}

if ($ok) {
  Write-Host "PRECHECK_PASS" -ForegroundColor Green
  exit 0
} else {
  Write-Host "PRECHECK_FAIL" -ForegroundColor Red
  exit 1
}

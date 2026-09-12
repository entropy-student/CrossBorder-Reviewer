param(
  [string]$AdminEmail = "admin@local.test",
  [string]$AdminPassword = ""
)

$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")
$Root = Get-ProjectRoot
$Target = Join-Path $Root "02_demos/medusa-dtc"
$DbScript = Join-Path $PSScriptRoot "02-start-medusa-db.ps1"
$DbCompose = Join-Path $Root "02_demos/medusa-local/docker-compose.db.yml"
$UpstreamRecord = Join-Path $Root "02_demos/medusa-dtc.UPSTREAM.txt"
$CredentialsRecord = Join-Path $Root "02_demos/medusa-admin.local.txt"
$InitRecord = Join-Path $Root "02_demos/medusa-init-mode.local.txt"
$ArchiveTemp = Join-Path $Root "02_demos/dtc-starter-main.zip"
$ArchiveSource = "https://codeload.github.com/medusajs/dtc-starter/zip/refs/heads/main"
$OfficialOrigin = "https://github.com/medusajs/dtc-starter.git"
$AcquisitionMode = "existing"
$ArchiveSha256 = ""

# A failed native git clone can leave a partial target directory behind.
# Never delete an incomplete candidate implicitly; require the guarded reset command.
if ((Test-Path $Target) -and -not (Test-Path (Join-Path $Target ".git"))) {
  throw "Incomplete Medusa source directory exists at $Target. Run 99-reset-local.ps1 -ConfirmReset -DeleteClone only after reviewing the target, then retry."
}

function Initialize-ArchiveBaseline {
  param([string]$Path, [string]$ArchiveHash)

  Push-Location $Path
  try {
    & git init | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "git init failed for archive baseline" }
    & git config user.name "CrossBorder Local Validator"
    & git config user.email "local-validator@example.invalid"
    & git remote add origin $OfficialOrigin
    if ($LASTEXITCODE -ne 0) { throw "git remote add failed for archive baseline" }
    & git add -A
    if ($LASTEXITCODE -ne 0) { throw "git add failed for archive baseline" }
    & git commit -m "Local baseline from medusajs/dtc-starter archive $ArchiveHash" | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "git commit failed for archive baseline" }
  } finally {
    Pop-Location
  }
}

function Test-MedusaAdminUserExists {
  param([Parameter(Mandatory=$true)][string]$Email)

  $containerId = (& docker compose -p "crossborder-medusa" -f $DbCompose ps -q postgres).Trim()
  if (-not $containerId) { throw "Could not resolve the Medusa PostgreSQL container while validating the Admin credential record." }
  $escapedEmail = $Email.Replace("'", "''")
  $query = "SELECT 1 FROM public.user WHERE lower(email)=lower('$escapedEmail') LIMIT 1;"
  $result = ((& docker exec $containerId psql -U medusa -d medusa_dtc -Atc $query) -join "").Trim()
  if ($LASTEXITCODE -ne 0) { throw "Could not query the Medusa Admin user table while validating the credential record." }
  return $result -eq "1"
}

if (-not (Test-Path $Target)) {
  Write-Host "Cloning official medusajs/dtc-starter (shallow clone)..." -ForegroundColor Cyan
  & git clone --depth 1 $OfficialOrigin $Target

  if ($LASTEXITCODE -eq 0) {
    $AcquisitionMode = "git-clone"
  } else {
    Write-Host "[WARN] Git clone could not reach GitHub. Falling back to the official GitHub archive endpoint..." -ForegroundColor Yellow
    if (Test-Path $Target) { Remove-Item $Target -Recurse -Force }
    if (Test-Path $ArchiveTemp) { Remove-Item $ArchiveTemp -Force }

    $downloaded = $false
    try {
      Invoke-WebRequest -Uri $ArchiveSource -OutFile $ArchiveTemp -UseBasicParsing
      $downloaded = $true
    } catch {
      Write-Host "[WARN] Invoke-WebRequest archive download failed. Trying curl.exe..." -ForegroundColor Yellow
      if (Get-Command curl.exe -ErrorAction SilentlyContinue) {
        & curl.exe -L --fail --retry 3 --connect-timeout 20 -o $ArchiveTemp $ArchiveSource
        if ($LASTEXITCODE -eq 0 -and (Test-Path $ArchiveTemp)) { $downloaded = $true }
      }
    }

    if (-not $downloaded) {
      throw "Both git clone and official GitHub archive download failed. Do not change Docker/PostgreSQL. This is only a GitHub connectivity issue."
    }

    $ArchiveSha256 = (Get-FileHash $ArchiveTemp -Algorithm SHA256).Hash.ToLowerInvariant()
    $extractRoot = Join-Path $Root "02_demos/.dtc-starter-extract"
    if (Test-Path $extractRoot) { Remove-Item $extractRoot -Recurse -Force }
    New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
    Expand-Archive -Path $ArchiveTemp -DestinationPath $extractRoot -Force

    $extracted = Get-ChildItem -Path $extractRoot -Directory | Select-Object -First 1
    if (-not $extracted) { throw "Archive downloaded but no extracted starter directory was found" }
    Move-Item $extracted.FullName $Target
    Remove-Item $extractRoot -Recurse -Force
    Remove-Item $ArchiveTemp -Force

    Initialize-ArchiveBaseline -Path $Target -ArchiveHash $ArchiveSha256
    $AcquisitionMode = "github-archive"
    Write-Host "[OK] Official archive fallback succeeded. SHA256: $ArchiveSha256" -ForegroundColor Green
  }
} else {
  Write-Host "Using existing $Target" -ForegroundColor Yellow
  if (Test-Path $UpstreamRecord) {
    $priorModeLine = Get-Content $UpstreamRecord | Where-Object { $_ -like "acquisition_mode=*" } | Select-Object -First 1
    if ($priorModeLine) { $AcquisitionMode = $priorModeLine.Substring(17) }
  }
}

Push-Location $Target
try {
  if (-not (Test-Path (Join-Path $Target ".git"))) {
    throw "Existing Medusa target is not a validated Git baseline. Delete it with 99-reset-local.ps1 -DeleteClone and rerun this script."
  }

  $origin = (& git remote get-url origin).Trim()
  if ($origin -notmatch 'github\.com[:/]medusajs/dtc-starter(\.git)?$') {
    throw "Unexpected upstream origin: $origin"
  }

  $dirty = (& git status --porcelain)
  if ($dirty) {
    throw "The upstream demo baseline has tracked/untracked changes. Preserve the baseline: clean it or use 99-reset-local.ps1 -DeleteClone, then retry."
  }

  if (-not (Test-Path (Join-Path $Target "pnpm-lock.yaml"))) {
    throw "Official starter baseline has no pnpm-lock.yaml; refusing an unpinned dependency install."
  }

  $rootPackage = Get-Content (Join-Path $Target "package.json") -Raw | ConvertFrom-Json
  $requiredPnpm = "10"
  if ($rootPackage.packageManager -and $rootPackage.packageManager -match '^pnpm@(.+)$') {
    $requiredPnpm = $Matches[1]
  }
  $Pnpm = Get-PnpmExecutable $Root $requiredPnpm
  Write-Host "Using pnpm: $Pnpm (required: $requiredPnpm)" -ForegroundColor Cyan

  $baselineCommit = (& git rev-parse HEAD).Trim()
  $upstreamCommit = if ($AcquisitionMode -eq "git-clone") { $baselineCommit } else { "UNRESOLVED" }
  if (-not $ArchiveSha256 -and (Test-Path $UpstreamRecord)) {
    $priorArchive = Get-Content $UpstreamRecord | Where-Object { $_ -like "archive_sha256=*" } | Select-Object -First 1
    if ($priorArchive) { $ArchiveSha256 = $priorArchive.Substring(15) }
    $priorUpstream = Get-Content $UpstreamRecord | Where-Object { $_ -like "upstream_commit=*" } | Select-Object -First 1
    if ($priorUpstream) { $upstreamCommit = $priorUpstream.Substring(16) }
  }

  $record = "origin=$origin`r`nacquisition_mode=$AcquisitionMode`r`nupstream_commit=$upstreamCommit`r`nlocal_baseline_commit=$baselineCommit`r`n"
  if ($ArchiveSha256) { $record += "archive_sha256=$ArchiveSha256`r`narchive_source=$ArchiveSource`r`narchive_reference=refs/heads/main`r`n" }
  $record += "recorded_utc=$([DateTime]::UtcNow.ToString('o'))`r`n"
  Set-Utf8NoBomFile $UpstreamRecord $record
  Write-Host "[OK] Recorded source baseline: $baselineCommit ($AcquisitionMode)" -ForegroundColor Green

  if ($rootPackage.engines.node) {
    Write-Host "Starter package engine: node $($rootPackage.engines.node)"
  }

  Write-Host "Installing exact locked dependencies..." -ForegroundColor Cyan
  & $Pnpm install --frozen-lockfile
  if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }

  $dirtyAfterInstall = (& git status --porcelain)
  if ($dirtyAfterInstall) {
    throw "Locked dependency installation changed the validated baseline; refusing to continue with a drifting source tree."
  }

  & $DbScript

  $backendEnvTemplate = Join-Path $Target "apps/backend/.env.template"
  $backendEnv = Join-Path $Target "apps/backend/.env"
  if (-not (Test-Path $backendEnvTemplate)) { throw "Missing backend .env.template" }
  if (-not (Test-Path $backendEnv)) {
    Copy-Item $backendEnvTemplate $backendEnv
  }

  $content = Get-Content $backendEnv -Raw
  Assert-DotEnvKey $content "DATABASE_URL" $backendEnvTemplate
  Assert-DotEnvKey $content "JWT_SECRET" $backendEnvTemplate
  Assert-DotEnvKey $content "COOKIE_SECRET" $backendEnvTemplate
  $content = Set-DotEnvValue $content "DATABASE_URL" "postgres://medusa:medusa_local_dev@127.0.0.1:54329/medusa_dtc"
  $jwtSecret = Get-DotEnvValue $content "JWT_SECRET"
  if (-not (Test-UsableLocalSecret $jwtSecret)) {
    $content = Set-DotEnvValue $content "JWT_SECRET" ("local-jwt-" + [guid]::NewGuid().ToString("N"))
    Write-Host "[INFO] Generated a local JWT_SECRET because the existing value was missing or a template default." -ForegroundColor Yellow
  } else {
    Write-Host "[OK] Preserving the existing non-default JWT_SECRET for rerun safety." -ForegroundColor Green
  }
  $cookieSecret = Get-DotEnvValue $content "COOKIE_SECRET"
  if (-not (Test-UsableLocalSecret $cookieSecret)) {
    $content = Set-DotEnvValue $content "COOKIE_SECRET" ("local-cookie-" + [guid]::NewGuid().ToString("N"))
    Write-Host "[INFO] Generated a local COOKIE_SECRET because the existing value was missing or a template default." -ForegroundColor Yellow
  } else {
    Write-Host "[OK] Preserving the existing non-default COOKIE_SECRET for rerun safety." -ForegroundColor Green
  }
  if ($content -match "(?m)^REDIS_URL=") {
    $content = Set-DotEnvValue $content "REDIS_URL" ""
  }
  Set-Utf8NoBomFile $backendEnv $content

  $ReuseExistingAdminCredential = $false
  if (-not $AdminPassword -and (Test-Path $CredentialsRecord)) {
    $saved = Get-Content $CredentialsRecord
    $savedEmailLine = $saved | Where-Object { $_ -like "email=*" } | Select-Object -First 1
    $savedPasswordLine = $saved | Where-Object { $_ -like "password=*" } | Select-Object -First 1
    if ($savedEmailLine -and $savedPasswordLine) {
      $savedEmail = $savedEmailLine.Substring(6)
      $savedPassword = $savedPasswordLine.Substring(9)
      if ($savedEmail -eq $AdminEmail -and $savedPassword) {
        $AdminPassword = $savedPassword
        $ReuseExistingAdminCredential = $true
        Write-Host "[INFO] Reusing existing local admin credential record for idempotent rerun." -ForegroundColor Yellow
      }
    }
  }
  if (-not $AdminPassword) {
    $AdminPassword = "Local-" + [guid]::NewGuid().ToString("N")
  }

  Push-Location (Join-Path $Target "apps/backend")
  try {
    Write-Host "Running database migrations..." -ForegroundColor Cyan
    & $Pnpm medusa db:migrate
    if ($LASTEXITCODE -ne 0) { throw "Medusa migrations failed" }

    $backendPackagePath = Join-Path $Target "apps/backend/package.json"
    $backendPackage = Get-Content $backendPackagePath -Raw | ConvertFrom-Json
    $seedScript = $backendPackage.scripts.seed
    $migrationSeedPath = Join-Path $Target "apps/backend/src/migration-scripts/initial-data-seed.ts"
    $migrationSeedDetected = Test-Path $migrationSeedPath
    if ($migrationSeedDetected) {
      Set-Utf8NoBomFile $InitRecord "mode=migration-based-initial-data-seed`r`ncapability_file=$migrationSeedPath`r`nbaseline=$baselineCommit`r`n"
      Write-Host "MEDUSA_BASELINE_SEEDED_BY_MIGRATION" -ForegroundColor Green
      Write-Host "US_USD_AUGMENTATION_REQUIRED" -ForegroundColor Cyan
    } elseif ($seedScript) {
      Write-Host "Official backend seed script detected; running it..." -ForegroundColor Cyan
      & $Pnpm run seed
      if ($LASTEXITCODE -ne 0) { throw "Medusa official seed failed" }
      Set-Utf8NoBomFile $InitRecord "mode=official-seed`r`nseed_script=$seedScript`r`nbaseline=$baselineCommit`r`n"
      Write-Host "[OK] Official seed completed." -ForegroundColor Green
    } else {
      Set-Utf8NoBomFile $InitRecord "mode=manual-minimum-bootstrap-required`r`nbaseline=$baselineCommit`r`n"
      Write-Host "[INFO] Current DTC Starter backend exposes no seed script. No seed will be invented or copied from an older starter." -ForegroundColor Yellow
      Write-Host "MEDUSA_DATA_BOOTSTRAP_REQUIRED" -ForegroundColor Yellow
    }

    if ($ReuseExistingAdminCredential) {
      if (-not (Test-MedusaAdminUserExists -Email $AdminEmail)) {
        throw "Credential record exists but the matching Medusa Admin user is absent from the database. Refusing to print READY or reuse a dangling credential record."
      }
      Write-Host "[OK] Existing local admin credential record matches a database Admin user; reusing it." -ForegroundColor Green
    } else {
      Write-Host "Creating local admin user..." -ForegroundColor Cyan
      & $Pnpm medusa user -e $AdminEmail -p $AdminPassword
      if ($LASTEXITCODE -ne 0) {
        throw "Medusa admin creation failed. No credential file will be written for an unverified password."
      }
      if (-not (Test-MedusaAdminUserExists -Email $AdminEmail)) {
        throw "Medusa user command returned success but the Admin user was not found in the database. No credential file will be written."
      }
      Set-Utf8NoBomFile $CredentialsRecord "LOCAL VALIDATION ONLY`r`nemail=$AdminEmail`r`npassword=$AdminPassword`r`n"
    }
  } finally {
    Pop-Location
  }

  Write-Host ""
  Write-Host "MEDUSA_BACKEND_READY" -ForegroundColor Green
  Write-Host "Validated source baseline: $baselineCommit ($AcquisitionMode)"
  if ($ArchiveSha256) { Write-Host "Archive SHA256: $ArchiveSha256" }
  Write-Host "Local admin credentials: $CredentialsRecord"
  Write-Host "Next: from 02_demos/medusa-dtc run: $Pnpm backend:dev"
  Write-Host "Admin URL: http://localhost:9000/app"
  if (Test-Path $InitRecord) { Write-Host "Initialization mode: $InitRecord" }
  if ((Get-Content $InitRecord -Raw) -match "manual-minimum-bootstrap-required") {
    Write-Host "After login, follow the sibling document center archive/legacy-runbooks/DEMO_BOOTSTRAP.md for historical US/USD augmentation, then copy the publishable API key."
  } else {
    Write-Host "Baseline initialization was detected from the checked-out migration. Follow the sibling document center archive/legacy-runbooks/DEMO_BOOTSTRAP.md only for historical US/USD augmentation, then copy the publishable API key."
  }
} finally {
  Pop-Location
}

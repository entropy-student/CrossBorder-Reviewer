$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "_common.ps1")
$Root = Get-ProjectRoot
$Compose = Join-Path $Root "02_demos/medusa-local/docker-compose.db.yml"
$Project = "crossborder-medusa"
$ImageRecord = Join-Path $Root "02_demos/medusa-db-image.local.txt"
$IntendedImage = "postgres:16-alpine"

function Get-DockerImageIdentity([string]$ImageReference) {
  $raw = ((& docker image inspect $ImageReference 2>$null) -join "").Trim()
  if ($LASTEXITCODE -ne 0 -or -not $raw) { return $null }
  $parsed = $raw | ConvertFrom-Json
  $image = if ($parsed -is [array]) { $parsed[0] } else { $parsed }
  return [pscustomobject]@{
    Id = [string]$image.Id
    RepoTags = @($image.RepoTags)
    RepoDigests = @($image.RepoDigests)
  }
}

function Get-RecordedValue([string]$Path, [string]$Name) {
  $line = Get-Content $Path | Where-Object { $_ -like "$Name=*" } | Select-Object -First 1
  if ($line) { return $line.Substring($Name.Length + 1) }
  return ""
}

if (Test-Path $ImageRecord) {
  Write-Host "[INFO] Existing PostgreSQL image record found; verifying the intended local image before touching the existing volume." -ForegroundColor Yellow
  $recordedImageId = Get-RecordedValue $ImageRecord "image_id"
  $recordedDigests = Get-RecordedValue $ImageRecord "repo_digests"
  $localImage = Get-DockerImageIdentity $IntendedImage
  if (-not $localImage) {
    throw "Recorded PostgreSQL image $IntendedImage is not present locally. Refusing to pull or start an unverified image against the existing volume."
  }
  if ($recordedImageId -and $recordedImageId -ne $localImage.Id) {
    throw "PostgreSQL image drift detected before startup. Recorded $recordedImageId but local $IntendedImage is $($localImage.Id). Preserve the volume and inspect the image before continuing."
  }
  if ($recordedDigests -and $recordedDigests -ne (($localImage.RepoDigests -join ","))) {
    throw "PostgreSQL image repo digest drift detected before startup. Preserve the volume and inspect the image before continuing."
  }
} else {
  Write-Host "Pulling PostgreSQL image for the first recorded validation run..." -ForegroundColor Cyan
  & docker compose -p $Project -f $Compose pull postgres
  if ($LASTEXITCODE -ne 0) { throw "docker compose pull postgres failed" }
  $localImage = Get-DockerImageIdentity $IntendedImage
  if (-not $localImage) { throw "PostgreSQL image pull completed but docker image inspect returned no image identity." }
  $repoDigests = $localImage.RepoDigests -join ","
  Set-Utf8NoBomFile $ImageRecord "tag=$IntendedImage`r`nimage_id=$($localImage.Id)`r`nrepo_digests=$repoDigests`r`nrecorded_utc=$([DateTime]::UtcNow.ToString('o'))`r`n"
  Write-Host "[OK] Recorded PostgreSQL image identity before the first volume startup: $ImageRecord" -ForegroundColor Green
}

Write-Host "Starting disposable Medusa PostgreSQL..." -ForegroundColor Cyan
& docker compose -p $Project -f $Compose up -d
if ($LASTEXITCODE -ne 0) { throw "docker compose up failed" }

$containerId = (& docker compose -p $Project -f $Compose ps -q postgres).Trim()
if (-not $containerId) { throw "Could not resolve PostgreSQL container id" }

$containerRaw = ((& docker inspect $containerId) -join "").Trim()
$parsedContainer = $containerRaw | ConvertFrom-Json
$container = if ($parsedContainer -is [array]) { $parsedContainer[0] } else { $parsedContainer }
$imageId = [string]$container.Image
$recordedImageId = Get-RecordedValue $ImageRecord "image_id"
if ($recordedImageId -and $recordedImageId -ne $imageId) {
  throw "PostgreSQL runtime image drift detected after startup. Recorded $recordedImageId but container uses $imageId. Preserve evidence and inspect before continuing."
}

Write-Host "Waiting for PostgreSQL health check..." -ForegroundColor Cyan
for ($i = 0; $i -lt 40; $i++) {
  $status = (& docker inspect -f '{{.State.Health.Status}}' $containerId 2>$null).Trim()
  if ($status -eq "healthy") {
    Write-Host "[OK] PostgreSQL is healthy on 127.0.0.1:54329" -ForegroundColor Green
    Write-Host "DATABASE_URL=postgres://medusa:medusa_local_dev@127.0.0.1:54329/medusa_dtc"
    exit 0
  }
  Start-Sleep -Seconds 2
}
throw "PostgreSQL did not become healthy. Run: docker compose -p $Project -f `"$Compose`" logs postgres"

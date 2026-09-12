[CmdletBinding()]
param(
  [string]$ImageTag = "spree-demo-source-backend:cb-dev-016"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$SpreeRoot = Join-Path $Root "02_demos/spree-demo"
$Dockerfile = Join-Path $SpreeRoot "backend/Dockerfile"
$BuildStage = Join-Path $Root "02_demos/spree-local/.build-source"
$ArchiveStage = Join-Path $Root "02_demos/spree-local/.build-source.tar"
$SourceBaseline = "f9966ab61ae0ceb72f62a51167b1c013fe10230f"

if (-not (Test-Path -LiteralPath $Dockerfile -PathType Leaf)) { throw "Missing source Dockerfile: $Dockerfile" }
$status = @(& git -C $SpreeRoot status --short)
if ($LASTEXITCODE -ne 0) { throw "Could not inspect Spree source Git status." }
if ($status.Count -gt 0) { throw "Spree source worktree is not clean; refusing source build." }
$currentCommit = (& git -C $SpreeRoot rev-parse HEAD).Trim()
if ($currentCommit -ne $SourceBaseline) { throw "Unexpected Spree source baseline: $currentCommit" }

$started = Get-Date
try {
  if (Test-Path -LiteralPath $BuildStage) {
    Remove-Item -LiteralPath $BuildStage -Recurse -Force
  }
  if (Test-Path -LiteralPath $ArchiveStage) {
    Remove-Item -LiteralPath $ArchiveStage -Force
  }
  New-Item -ItemType Directory -Path $BuildStage -Force | Out-Null
  & git -C $SpreeRoot archive --format=tar --output=$ArchiveStage $currentCommit
  if ($LASTEXITCODE -ne 0) { throw "Could not create source archive." }
  & tar -xf $ArchiveStage -C $BuildStage
  if ($LASTEXITCODE -ne 0) { throw "Could not create LF-normalized source build context." }
  $textExtensions = @(".rb", ".ru", ".rake", ".gemspec", ".yml", ".yaml", ".json", ".js", ".mjs", ".ts", ".tsx", ".css", ".scss", ".md", ".txt", ".lock")
  Get-ChildItem -LiteralPath $BuildStage -File -Recurse | Where-Object {
    $relative = $_.FullName.Substring($BuildStage.Length)
    while ($relative.Length -gt 0 -and ($relative[0] -eq [char]92 -or $relative[0] -eq [char]47)) { $relative = $relative.Substring(1) }
    $relative = $relative.Replace([char]92, [char]47)
    $textExtensions -contains $_.Extension.ToLowerInvariant() -or $relative.StartsWith("backend/bin/", [StringComparison]::OrdinalIgnoreCase)
  } | ForEach-Object {
    $bytes = [System.IO.File]::ReadAllBytes($_.FullName)
    $output = New-Object System.IO.MemoryStream
    $changed = $false
    for ($index = 0; $index -lt $bytes.Length; $index++) {
      if ($bytes[$index] -eq 13 -and $index + 1 -lt $bytes.Length -and $bytes[$index + 1] -eq 10) {
        $output.WriteByte(10)
        $index++
        $changed = $true
      } else {
        $output.WriteByte($bytes[$index])
      }
    }
    if ($changed) { [System.IO.File]::WriteAllBytes($_.FullName, $output.ToArray()) }
    $output.Dispose()
  }
  $stagedDockerfile = Join-Path $BuildStage "backend/Dockerfile"
  if (-not (Test-Path -LiteralPath $stagedDockerfile -PathType Leaf)) { throw "Source archive is missing backend/Dockerfile." }

  Write-Host "SOURCE_BACKEND_BUILD_CONTEXT=$BuildStage"
  Write-Host "SOURCE_BACKEND_SOURCE_CONTEXT=02_demos/spree-demo@$currentCommit"
  Write-Host "SOURCE_BACKEND_SOURCE_LINE_ENDING_NORMALIZATION=TEMPORARY_GIT_ARCHIVE_LF"
  Write-Host "SOURCE_BACKEND_DOCKERFILE=$Dockerfile"
  Write-Host "SPREE_CLI_VERSION=2.4.9"
  Write-Host "SOURCE_BASELINE_COMMIT=$currentCommit"
  Push-Location $BuildStage
  try {
    & docker build --progress=plain --build-arg SPREE_CLI_VERSION=2.4.9 -f backend/Dockerfile -t $ImageTag .
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
} finally {
  if (Test-Path -LiteralPath $BuildStage) {
    Remove-Item -LiteralPath $BuildStage -Recurse -Force
  }
  if (Test-Path -LiteralPath $ArchiveStage) {
    Remove-Item -LiteralPath $ArchiveStage -Force
  }
}

$duration = ((Get-Date) - $started).TotalSeconds
Write-Host ("SOURCE_BACKEND_BUILD_DURATION_SECONDS={0:N1}" -f $duration)
Write-Host "SOURCE_BACKEND_BUILD_EXIT_CODE=$exitCode"
if ($exitCode -ne 0) { throw "Source backend production Docker build failed." }

$inspectJson = & docker image inspect $ImageTag
if ($LASTEXITCODE -ne 0) { throw "Built image cannot be inspected: $ImageTag" }
$image = ($inspectJson -join [Environment]::NewLine) | ConvertFrom-Json | Select-Object -First 1
$repoDigests = @($image.RepoDigests)
Write-Host "SOURCE_BACKEND_IMAGE_TAG=$ImageTag"
Write-Host "SOURCE_BACKEND_IMAGE_ID=$($image.Id)"
Write-Host "SOURCE_BACKEND_IMAGE_REPO_DIGEST=$($(if($repoDigests.Count -gt 0){$repoDigests -join ','}else{'N/A'}))"
Write-Host "SOURCE_BACKEND_IMAGE_SOURCE=02_demos/spree-demo/backend/Dockerfile"

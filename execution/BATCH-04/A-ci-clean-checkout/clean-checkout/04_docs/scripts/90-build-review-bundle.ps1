[CmdletBinding()]
param(
  [string]$OutputZip = "",
  [string]$AttestationPath = "",
  [switch]$KeepStage
)

# HISTORICAL_REVIEW01_TOOL
# CURRENT_REVIEW_STAGING_TOOL=04_docs/scripts/92-prepare-review-staging.ps1
# This script reproduces the historical Review-01 bundle contract. It is not
# the current Review-02 staging path and must not be used for current packaging.
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
if (-not $OutputZip) { $OutputZip = Join-Path $Root "REVIEW-01-FINAL.zip" }
if (-not $AttestationPath) { $AttestationPath = Join-Path $Root "REVIEW-01-FINAL.attestation.txt" }
$OutputZip = [IO.Path]::GetFullPath($OutputZip)
$AttestationPath = [IO.Path]::GetFullPath($AttestationPath)
$RootManifest = Join-Path $Root "REVIEW_MANIFEST.txt"
$Stage = Join-Path $env:TEMP ("CrossBorder-Independent-Store-REVIEW-01-FINAL-" + [guid]::NewGuid().ToString("N"))
$ExcludedCount = 0
$RedactedEnvCount = 0
$SourceMutationCount = 0
$IntegrityRecords = [System.Collections.Generic.List[object]]::new()
$TemplateRecords = [System.Collections.Generic.List[object]]::new()

$ExcludedDirectoryNames = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
foreach ($name in @(
  "node_modules", ".pnpm-store", ".tooling", ".next", ".medusa", "build", "dist",
  "coverage", "tmp", "logs", "log", ".git", ".turbo", ".cache", "storage",
  "postgres_data", "vendor", ".spree"
)) { [void]$ExcludedDirectoryNames.Add($name) }

function Test-ExcludedDirectory([IO.DirectoryInfo]$Directory) {
  return $ExcludedDirectoryNames.Contains($Directory.Name)
}

function Test-ExcludedFile([IO.FileInfo]$File) {
  if ($File.Name -like ".env*") { return $true }
  if ($File.Name -ieq "credentials.json") { return $true }
  if ($File.Name -match "(?i)(^|[-_.])(admin|credential|secret|token|session)([-_.]|$)" -and $File.Name -match "(?i)\.(txt|json|key|pem|p12|pfx)$") { return $true }
  if ($File.Name -match "(?i)\.local\.txt$") { return $true }
  if ($File.Name -match "(?i)\.(log|tmp|cache|tsbuildinfo|zip|7z|tar|gz)$") { return $true }
  if ($File.Name -ieq "spree-products.json") { return $true }
  return $false
}

function Convert-ToRelativePath([string]$Base, [string]$Path) {
  $baseFull = (Get-Item -LiteralPath $Base).FullName.TrimEnd('\') + '\'
  $pathFull = (Get-Item -LiteralPath $Path).FullName
  $baseUri = [Uri]::new($baseFull)
  $pathUri = [Uri]::new($pathFull)
  return [Uri]::UnescapeDataString($baseUri.MakeRelativeUri($pathUri).ToString()).Replace('\', '/')
}

function Get-RelativePath([string]$Path) { return Convert-ToRelativePath $Root $Path }

function Test-SafeEnvTemplate([string]$Name) {
  return $Name -match '^\.env(?:\.[^.]+)*\.(example|template)$'
}

function Get-ReviewFiles([string]$Path) {
  foreach ($file in (Get-ChildItem -LiteralPath $Path -Force -File -ErrorAction Stop)) {
    if (Test-ExcludedFile $file) { $script:ExcludedCount++; continue }
    $file
  }
  foreach ($directory in (Get-ChildItem -LiteralPath $Path -Force -Directory -ErrorAction Stop)) {
    if (Test-ExcludedDirectory $directory) { $script:ExcludedCount++; continue }
    Get-ReviewFiles $directory.FullName
  }
}

function Get-EnvFiles([string]$Path) {
  foreach ($file in (Get-ChildItem -LiteralPath $Path -Force -File -ErrorAction Stop)) {
    if ($file.Name -like ".env*") { $file }
  }
  foreach ($directory in (Get-ChildItem -LiteralPath $Path -Force -Directory -ErrorAction Stop)) {
    if (Test-ExcludedDirectory $directory) { continue }
    Get-EnvFiles $directory.FullName
  }
}

function Get-TextFiles([string]$Path) {
  $extensions = @(".md", ".txt", ".json", ".js", ".mjs", ".ts", ".tsx", ".ps1", ".yml", ".yaml", ".toml", ".env", ".redacted", ".rb", ".rake", ".lock", ".sql", ".sh", ".css", ".html", ".xml", ".Dockerfile")
  return Get-ChildItem -LiteralPath $Path -Recurse -Force -File | Where-Object {
    $extensions -contains $_.Extension.ToLowerInvariant() -or $_.Name -ieq "Dockerfile" -or $_.FullName -match '(?i)[\\/]REVIEW_ENV[\\/]'
  }
}

function Get-StreamSha256([IO.Stream]$Stream) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($Stream))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Get-LineSha256([string]$Line) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Line)))).Replace('-', '').ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Copy-SourceFile([IO.FileInfo]$SourceFile) {
  $relative = Get-RelativePath $SourceFile.FullName
  $destination = Join-Path $Stage $relative
  New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
  Copy-Item -LiteralPath $SourceFile.FullName -Destination $destination -Force
  $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $SourceFile.FullName).Hash.ToLowerInvariant()
  $stagedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $destination).Hash.ToLowerInvariant()
  if ($sourceHash -ne $stagedHash) {
    $script:SourceMutationCount++
    throw "Source copy hash mismatch: $relative"
  }
  $script:IntegrityRecords.Add([pscustomobject]@{ path=$relative; source_sha256=$sourceHash; staged_sha256=$stagedHash; result="PASS" })
}

function Convert-ToRedactedEnv([string]$Path) {
  $result = [System.Collections.Generic.List[string]]::new()
  foreach ($line in [IO.File]::ReadAllLines($Path)) {
    if ($line -match '^\s*#' -or $line -match '^\s*$') {
      $result.Add($line)
    } elseif ($line -match '^(?<prefix>\s*(?:export\s+)?)(?<key>[A-Za-z_][A-Za-z0-9_]*)(?<separator>\s*=\s*).*$') {
      $result.Add($Matches.prefix + $Matches.key + $Matches.separator + "<REDACTED>")
    } else {
      $result.Add("<REDACTED_LINE>")
    }
  }
  return ($result -join [Environment]::NewLine) + [Environment]::NewLine
}

function Test-SourceLineAllowlisted([string]$RelativePath, [string]$Line) {
  $exactSafeLines = @{
    '02_demos/spree-demo/apps/storefront/e2e-backend/docker-compose.yml|0a3081e9d026e6777a96498f01b86ffb63473f1b2de297658ef156ef27e22af8' = $true
    '02_demos/spree-demo/apps/storefront/src/app/api/webhooks/spree/route.ts|0bd602d0e86e6c9ec26f7295ddf4a67f9283659e88d4376029171fc345e91b3e' = $true
    '02_demos/spree-demo/apps/storefront/src/components/checkout/PaymentSection.tsx|7f8aa0b479f29f7e53e681f5e31952bd092f2bf599dd335a843f8c2444d3f51a' = $true
    '04_docs/LOCAL_RUNBOOK.md|e026b59d1d6ba18740b8a00bd18a821741417c31fe4eced16387ce76a5a7f2a6' = $true
    '04_docs/scripts/02-start-medusa-db.ps1|8262c49c6e28edafc30ac0d544f64d480dcea2944a425cb9cd32c789804569cd' = $true
  }
  if ($exactSafeLines.ContainsKey("$RelativePath|$(Get-LineSha256 $Line)")) { return $true }
  if ($Line -match '(?i)process\.env\.[A-Za-z_][A-Za-z0-9_]*|ENV\.fetch\(|formData\.get\(|mocks\.[A-Za-z_][A-Za-z0-9_]*|undefined\s+as\s+string|\.[A-Za-z_][A-Za-z0-9_]*\s+as\s+string|\$\{[^}]+\}|\$[A-Za-z_][A-Za-z0-9_]*') { return $true }
  if ($Line -match '(?i)(?:password|passwd|secret|secret[_-]?key(?:[_-]?base)?|jwt[_-]?secret|cookie[_-]?secret|api[_-]?key|access[_-]?token|auth[_-]?token|webhook[_-]?secret)\s*[:=]\s*["'']?(dummy|placeholder|example\.invalid|medusa_local_dev|supersecret|not_for_production)["'']?') { return $true }
  if ($RelativePath -match '(?i)(/__tests__/|\.(test|spec)\.)' -and $Line -match '(?i)(?:password|current_password|secret)\s*[:=]\s*["''](?:password123|pass|secret|wrong)["'']') { return $true }
  if ($RelativePath -eq '02_demos/spree-demo/README.md' -and $Line -match '^\s*-\s*Password:\s*' -and (Get-LineSha256 $Line) -eq 'ca50ef800cd2198345bde648c063d43a562d3b0702991d19866fbc28833d4ad6') { return $true }
  return $false
}

function Get-SecretFindings([string]$Path, [string]$RelativePath) {
  $findings = [System.Collections.Generic.List[string]]::new()
  $lineNumber = 0
  foreach ($line in [IO.File]::ReadAllLines($Path)) {
    $lineNumber++
    $candidate = $line -match '(?i)\b(?:password|passwd|secret|secret[_-]?key(?:[_-]?base)?|jwt[_-]?secret|cookie[_-]?secret|api[_-]?key|access[_-]?token|auth[_-]?token|webhook[_-]?secret)\s*[:=]\s*(?:"[^"\r\n]{8,}"|''[^''\r\n]{8,}''|[A-Za-z0-9_./:+=@-]{8,})'
    $candidate = $candidate -or ($line -match '(?i)\b(?:sk|pk|rk|whsec|re)_[A-Za-z0-9]{8,}\b')
    $candidate = $candidate -or ($line -match '(?i)-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----')
    $candidate = $candidate -or ($line -match '(?i)\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?)://[^\s]+:[^@\s/]+@')
    if ($candidate -and -not (Test-SourceLineAllowlisted $RelativePath $line)) { $findings.Add("$RelativePath`:$lineNumber") }
  }
  return $findings
}

function Assert-FileNameHygiene([string]$Path) {
  $bad = [System.Collections.Generic.List[string]]::new()
  foreach ($entry in (Get-ChildItem -LiteralPath $Path -Recurse -Force)) {
    $relative = Convert-ToRelativePath $Path $entry.FullName
    if ($relative -match '(?i)(^|/)(node_modules|\.pnpm-store|\.tooling|\.next|\.medusa|build|dist|coverage|tmp|logs?|\.git|storage|postgres_data|vendor|\.spree)(/|$)') { $bad.Add($relative); continue }
    if ($entry.Name -match '(?i)^(medusa-admin\.local\.txt|credentials\.json)$|\.local\.txt$|\.(log|tmp|tsbuildinfo|zip|7z|tar|gz)$|^spree-products\.json$') {
      if ($relative -notmatch '(?i)^REVIEW_ENV/') { $bad.Add($relative) }
    }
    if ($entry.Name -match '^\.env($|\.(local|e2e|development|production|test)(\.|$))' -and -not (Test-SafeEnvTemplate $entry.Name) -and $relative -notmatch '(?i)^REVIEW_ENV/') { $bad.Add($relative) }
  }
  if ($bad.Count -gt 0) { throw "Review bundle denylist violation: $($bad -join ', ')" }
}

function Assert-ManifestEncoding([string]$Path) {
  $bytes = [IO.File]::ReadAllBytes($Path)
  $utf8 = New-Object System.Text.UTF8Encoding($false, $true)
  try { $text = $utf8.GetString($bytes) } catch { throw "Manifest is not valid UTF-8" }
  if ($text -match '[\uFFFD]|鈥|锟|ï¿½') { throw "Manifest contains mojibake" }
}

function Write-ZipArchive([string]$Path) {
  Add-Type -AssemblyName System.IO.Compression
  $fileStream = [IO.File]::Open($Path, [IO.FileMode]::Create, [IO.FileAccess]::Write, [IO.FileShare]::None)
  $archive = [IO.Compression.ZipArchive]::new($fileStream, [IO.Compression.ZipArchiveMode]::Create, $false)
  try {
    foreach ($file in (Get-ChildItem -LiteralPath $Stage -Recurse -Force -File | Sort-Object FullName)) {
      $entryName = Convert-ToRelativePath $Stage $file.FullName
      if ($entryName.Contains('\')) { throw "ZIP entry path contains a backslash: $entryName" }
      $entry = $archive.CreateEntry($entryName, [IO.Compression.CompressionLevel]::Optimal)
      $sourceStream = [IO.File]::OpenRead($file.FullName)
      $destinationStream = $entry.Open()
      try { $sourceStream.CopyTo($destinationStream) } finally { $destinationStream.Dispose(); $sourceStream.Dispose() }
    }
  } finally {
    $archive.Dispose()
    $fileStream.Dispose()
  }
}

function Get-ZipEntry([IO.Compression.ZipArchive]$Archive, [string]$RelativePath) {
  return $Archive.Entries | Where-Object { $_.FullName.Replace('\', '/') -eq $RelativePath } | Select-Object -First 1
}

function Assert-ZipHygiene([string]$Path) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($Path)
  try {
    $bad = [System.Collections.Generic.List[string]]::new()
    $secretFindings = [System.Collections.Generic.List[string]]::new()
    foreach ($entry in $archive.Entries) {
      if ($entry.FullName.Contains('\')) { $bad.Add($entry.FullName); continue }
      $entryName = $entry.FullName
      if ($entryName -match '(?i)(^|/)(node_modules|\.pnpm-store|\.tooling|\.next|\.medusa|build|dist|coverage|tmp|logs?|\.git|storage|postgres_data|vendor|\.spree)(/|$)') { $bad.Add($entryName) }
      if ($entryName -match '(?i)(^|/)(medusa-admin\.local\.txt|credentials\.json)$|\.local\.txt$|\.(log|tmp|tsbuildinfo|zip|7z|tar|gz)$|(^|/)spree-products\.json$') { $bad.Add($entryName) }
      if ($entryName -match '(?i)(^|/)\.env($|\.(local|e2e|development|production|test)(\.|$))' -and $entryName -notmatch '(?i)^REVIEW_ENV/' -and -not (Test-SafeEnvTemplate ([IO.Path]::GetFileName($entryName)))) { $bad.Add($entryName) }
      if ($entryName.EndsWith('/')) { continue }
      if ($entryName -match '(?i)^REVIEW_ENV/' -or [IO.Path]::GetExtension($entryName).ToLowerInvariant() -in @('.md','.txt','.json','.js','.mjs','.ts','.tsx','.ps1','.yml','.yaml','.toml','.lock','.sql','.sh','.rb','.rake','.css','.html','.xml')) {
        $lineNumber = 0
        foreach ($line in ((Read-ZipText $entry) -split "`r?`n")) {
          $lineNumber++
          $candidate = $line -match '(?i)\b(?:password|passwd|secret|secret[_-]?key(?:[_-]?base)?|jwt[_-]?secret|cookie[_-]?secret|api[_-]?key|access[_-]?token|auth[_-]?token|webhook[_-]?secret)\s*[:=]\s*(?:"[^"\r\n]{8,}"|''[^''\r\n]{8,}''|[A-Za-z0-9_./:+=@-]{8,})'
          $candidate = $candidate -or ($line -match '(?i)\b(?:sk|pk|rk|whsec|re)_[A-Za-z0-9]{8,}\b')
          $candidate = $candidate -or ($line -match '(?i)-----BEGIN(?: [A-Z]+)? PRIVATE KEY-----')
          $candidate = $candidate -or ($line -match '(?i)\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?)://[^\s]+:[^@\s/]+@')
          if ($candidate -and -not (Test-SourceLineAllowlisted $entryName $line)) { $secretFindings.Add("$entryName`:$lineNumber") }
        }
      }
    }
    if ($bad.Count -gt 0) { throw "Post-ZIP denylist violation: $($bad -join ', ')" }
    if ($secretFindings.Count -gt 0) { throw "Post-ZIP secret scan found $($secretFindings.Count) non-allowlisted candidate(s)." }
  } finally { $archive.Dispose() }
}

function Assert-ZipSourceIntegrity([string]$Path) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($Path)
  try {
    foreach ($record in $IntegrityRecords) {
      $entry = Get-ZipEntry $archive $record.path
      if (-not $entry) { $script:SourceMutationCount++; throw "Source integrity entry missing from ZIP: $($record.path)" }
      $stream = $entry.Open()
      try { $zipHash = Get-StreamSha256 $stream } finally { $stream.Dispose() }
      if ($zipHash -ne $record.source_sha256) { $script:SourceMutationCount++; throw "Source integrity hash mismatch in ZIP: $($record.path)" }
    }
  } finally { $archive.Dispose() }
}

function Read-ZipText([IO.Compression.ZipArchiveEntry]$Entry) {
  $reader = [IO.StreamReader]::new($Entry.Open())
  try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
}

New-Item -ItemType Directory -Path $Stage -Force | Out-Null
try {
  foreach ($directoryName in @("01_research", "02_demos", "03_template", "04_docs")) {
    foreach ($file in @(Get-ReviewFiles (Join-Path $Root $directoryName))) { Copy-SourceFile $file }
  }
  foreach ($rootFile in @(".gitignore", "00_HANDOFF.md", "README.md", "PROJECT_STATUS.json", "AGENTS.md")) {
    $sourceFile = Join-Path $Root $rootFile
    if (Test-Path -LiteralPath $sourceFile -PathType Leaf) { Copy-SourceFile (Get-Item -LiteralPath $sourceFile) }
  }

  foreach ($envRoot in @("01_research", "02_demos", "03_template", "04_docs")) {
    foreach ($envFile in (Get-EnvFiles (Join-Path $Root $envRoot))) {
      $relative = Get-RelativePath $envFile.FullName
      if (Test-SafeEnvTemplate $envFile.Name) {
        Copy-SourceFile $envFile
        $sourceHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $envFile.FullName).Hash.ToLowerInvariant()
        $TemplateRecords.Add([pscustomobject]@{ path=$relative; source_sha256=$sourceHash; review_sha256=$sourceHash; result="PASS" })
      } else {
        $safeName = (($relative -replace '[\\/]', '-') -replace '[^A-Za-z0-9._-]', '_') + ".redacted"
        $destination = Join-Path $Stage (Join-Path "REVIEW_ENV" $safeName)
        New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
        [IO.File]::WriteAllText($destination, (Convert-ToRedactedEnv $envFile.FullName), (New-Object System.Text.UTF8Encoding($false)))
        $script:RedactedEnvCount++
      }
    }
  }
  $templateKeep = Join-Path $Stage "03_template/.review-empty"
  if (-not (Get-ChildItem -LiteralPath (Join-Path $Stage "03_template") -Force -File -ErrorAction SilentlyContinue)) {
    [IO.File]::WriteAllText($templateKeep, "Source template directory is intentionally empty; no platform winner has been frozen.`n", (New-Object System.Text.UTF8Encoding($false)))
  }
  $reviewEnvReadme = Join-Path $Stage "REVIEW_ENV/README.txt"
  [IO.File]::WriteAllText($reviewEnvReadme, "Runtime .env files are excluded. Files here preserve variable names and structure while replacing values with <REDACTED>.`n", (New-Object System.Text.UTF8Encoding($false)))

  Assert-FileNameHygiene $Stage
  $preZipFindings = [System.Collections.Generic.List[string]]::new()
  foreach ($file in (Get-TextFiles $Stage)) {
    $relative = Convert-ToRelativePath $Stage $file.FullName
    foreach ($finding in (Get-SecretFindings $file.FullName $relative)) { $preZipFindings.Add($finding) }
  }
  if ($preZipFindings.Count -gt 0) { throw "Pre-archive secret scan found $($preZipFindings.Count) non-allowlisted candidate(s): $($preZipFindings -join ', ')" }
  Write-Host "SECRET_SCAN_RESULT=PASS (pre-archive)" -ForegroundColor Green
  if ($SourceMutationCount -ne 0) { throw "SOURCE_MUTATIONS=$SourceMutationCount" }
  Write-Host "SOURCE_INTEGRITY_RESULT=PASS" -ForegroundColor Green
  Write-Host "SOURCE_MUTATIONS=0" -ForegroundColor Green

  $fileCount = (Get-ChildItem -LiteralPath $Stage -Recurse -Force -File | Measure-Object).Count + 1
  $manifestLines = [System.Collections.Generic.List[string]]::new()
  $manifestLines.Add("CrossBorder Independent Store - REVIEW-01-FINAL")
  $manifestLines.Add("generated_at=$((Get-Date).ToUniversalTime().ToString('o'))")
  $manifestLines.Add("expected_external_attestation=REVIEW-01-FINAL.attestation.txt")
  $manifestLines.Add("file_count=$fileCount")
  $manifestLines.Add("excluded_count=$ExcludedCount")
  $manifestLines.Add("redacted_env_count=$RedactedEnvCount")
  $manifestLines.Add("pre_archive_secret_scan=PASS")
  $manifestLines.Add("pre_archive_denylist_scan=PASS")
  $manifestLines.Add("source_integrity_result=PASS")
  $manifestLines.Add("source_mutations=0")
  $manifestLines.Add("root_gitignore_integrity=PASS")
  $manifestLines.Add("manifest_encoding=UTF-8")
  $manifestLines.Add("mojibake_check=PASS")
  $manifestLines.Add("")
  $manifestLines.Add("CURRENT_STATUS")
  $manifestLines.Add("CB-DEV-012=PASS; CB-DEV-013=PASS; CB-DEV-014=PASS; CB-DEV-015=PASS; CB-DEV-015R=PASS")
  $manifestLines.Add("Technology selection remains OPEN; no winner declared.")
  $manifestLines.Add("")
  $manifestLines.Add("TOOL_VERSIONS")
  $manifestLines.Add("node=$((& node --version).Trim())")
  $manifestLines.Add("global_pnpm=$((& pnpm --version).Trim())")
  $manifestLines.Add("medusa_locked_pnpm=10.11.1")
  $manifestLines.Add("spree_locked_pnpm=10.33.4")
  $manifestLines.Add("docker=$((& docker version --format 'server={{.Server.Version}} client={{.Client.Version}}').Trim())")
  $manifestLines.Add("docker_compose=$((& docker compose version).Trim())")
  $manifestLines.Add("")
  $manifestLines.Add("GIT_STATUS_AND_PROVENANCE")
  $manifestLines.Add("workspace_root=meta repository")
  $manifestLines.Add("root_commit=$((& git -C $Root rev-parse HEAD).Trim())")
  $manifestLines.Add("root_status=$(((& git -C $Root status --short --branch) -join ' | '))")
  $manifestLines.Add("medusa_commit=$((& git -C (Join-Path $Root '02_demos/medusa-dtc') rev-parse HEAD).Trim()) (local_baseline_commit; not official upstream commit)")
  $manifestLines.Add("medusa_status=$(((& git -C (Join-Path $Root '02_demos/medusa-dtc') status --short --branch) -join ' | '))")
  $manifestLines.Add("spree_commit=$((& git -C (Join-Path $Root '02_demos/spree-demo') rev-parse HEAD).Trim()) (local_baseline_commit; not official upstream commit)")
  $manifestLines.Add("spree_status=$(((& git -C (Join-Path $Root '02_demos/spree-demo') status --short --branch) -join ' | '))")
  $manifestLines.Add("")
  $manifestLines.Add("SAFE_ENV_TEMPLATE_INTEGRITY")
  foreach ($record in $TemplateRecords) { $manifestLines.Add("$($record.path) source_sha256=$($record.source_sha256) review_sha256=$($record.review_sha256) result=$($record.result)") }
  $manifestLines.Add("")
  $manifestLines.Add("SOURCE_INTEGRITY")
  foreach ($record in $IntegrityRecords) { $manifestLines.Add("$($record.path) source_sha256=$($record.source_sha256) staged_sha256=$($record.staged_sha256) result=$($record.result)") }
  $manifestLines.Add("")
  $manifestLines.Add("RECENT_TASKS")
  $manifestLines.Add("CB-DEV-012 PASS - Medusa US/USD System Payment order smoke with Admin/PostgreSQL double-read.")
  $manifestLines.Add("CB-DEV-013 PASS - Medusa Backend/Storefront production build and production runtime smoke.")
  $manifestLines.Add("CB-DEV-014 PASS - Spree official baseline, Sample Data, API core commerce, and US/USD sanity.")
  $manifestLines.Add("CB-DEV-015 PASS - security, provenance, evidence, and reproducibility normalization.")
  $manifestLines.Add("CB-DEV-015R fixes Review Builder source integrity and cross-platform archive behavior.")
  $manifestLines.Add("")
  $manifestLines.Add("EXCLUDED")
  $manifestLines.Add("Runtime env, credentials, .spree, dependency caches, build/cache output, logs, Git objects, Docker volume data, generated archives, and local credential records.")

  $stageManifest = Join-Path $Stage "REVIEW_MANIFEST.txt"
  [IO.File]::WriteAllText($stageManifest, ($manifestLines -join [Environment]::NewLine) + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
  Assert-ManifestEncoding $stageManifest
  [IO.File]::WriteAllText($RootManifest, ($manifestLines -join [Environment]::NewLine) + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
  Write-ZipArchive $OutputZip
  Assert-ZipHygiene $OutputZip
  Assert-ZipSourceIntegrity $OutputZip
  $zipNames = @()
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [IO.Compression.ZipFile]::OpenRead($OutputZip)
  try { $zipNames = @($archive.Entries | ForEach-Object { $_.FullName }) } finally { $archive.Dispose() }
  if (@($zipNames | Where-Object { $_.Contains('\') }).Count -gt 0) { throw "ZIP_ENTRY_SEPARATOR=BACKSLASH" }
  Write-Host "ZIP_ENTRY_SEPARATOR=FORWARD_SLASH" -ForegroundColor Green
  $archiveHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $OutputZip).Hash.ToLowerInvariant()
  $attestationLines = @(
    "CrossBorder Independent Store - REVIEW-01-FINAL attestation",
    "archive_sha256=$archiveHash",
    "post_zip_secret_scan=PASS",
    "post_zip_denylist_scan=PASS",
    "source_integrity=PASS",
    "source_mutations=0",
    "real_credential_leaks=0",
    "file_count=$fileCount",
    "excluded_count=$ExcludedCount",
    "redacted_env_count=$RedactedEnvCount",
    "generated_at=$((Get-Date).ToUniversalTime().ToString('o'))",
    "manifest=REVIEW_MANIFEST.txt",
    "manifest_encoding=UTF-8",
    "mojibake_check=PASS"
  )
  [IO.File]::WriteAllText($AttestationPath, ($attestationLines -join [Environment]::NewLine) + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
  Assert-ManifestEncoding $AttestationPath
  Write-Host "SECRET_SCAN_RESULT=PASS (post-ZIP)" -ForegroundColor Green
  Write-Host "POST_ZIP_DENYLIST_SCAN=PASS" -ForegroundColor Green
  Write-Host "SOURCE_INTEGRITY_RESULT=PASS" -ForegroundColor Green
  Write-Host "SOURCE_MUTATIONS=0" -ForegroundColor Green
  Write-Host "REAL_CREDENTIAL_LEAKS=0" -ForegroundColor Green
  Write-Host "REVIEW_BUNDLE_SHA256=$archiveHash" -ForegroundColor Green
  Write-Host "FINAL_REVIEW_BUNDLE=$OutputZip" -ForegroundColor Green
  Write-Host "FINAL_ATTESTATION=$AttestationPath" -ForegroundColor Green
} finally {
  if (-not $KeepStage -and (Test-Path -LiteralPath $Stage)) { Remove-Item -LiteralPath $Stage -Recurse -Force }
  elseif (Test-Path -LiteralPath $Stage) { Write-Host "STAGE_RETAINED=$Stage" -ForegroundColor Yellow }
}

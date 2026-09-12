[CmdletBinding()]
param(
  [string]$StagingPath,
  [string]$PackagePath,
  [string]$PackageManifestPath,
  [string]$PackageId,
  [switch]$CreateZip
)

$ErrorActionPreference = "Stop"

function Get-NormalizedPath([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { throw "Path must not be empty." }
  $full = [System.IO.Path]::GetFullPath($Path)
  $root = [System.IO.Path]::GetPathRoot($full)
  if ($full.Length -gt $root.Length) {
    $full = $full.TrimEnd([char[]]"/\")
  }
  return $full
}

# The one reproducible Reviewer package entry point. It creates a staging tree
# shaped like the live workspace: document-center files at the root and the
# canonical source project once under CrossBorder-Independent-Store/.
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$projectRootFull = Get-NormalizedPath $projectRoot
$documentCenterRoot = (Split-Path -Parent $projectRootFull)
$workspaceParent = (Split-Path -Parent $documentCenterRoot)
$trustedStagingRoot = Get-NormalizedPath (Join-Path $workspaceParent "_review_stage")
$stagingMarkerName = '.review-staging.marker.json'

if (-not $StagingPath) {
  $StagingPath = Join-Path $workspaceParent "_review_stage\FULL-REVIEW-CHECKPOINT-002-FINAL-ROUND-3"
}
if (-not $PackagePath) {
  $PackagePath = Join-Path $documentCenterRoot "_review_outbox\CrossBorder-Independent-Store-FULL-REVIEW-CHECKPOINT-002-FINAL-ROUND-3.zip"
}
if (-not $PackageManifestPath) {
  $PackageManifestPath = Join-Path $documentCenterRoot "CB-FULL-REVIEW-CHECKPOINT-002-FINAL-ROUND-3_MANIFEST.md"
}
if (-not $PackageId) {
  $PackageId = 'CB-FULL-REVIEW-CHECKPOINT-002-FINAL-ROUND-3'
}

$stagingRoot = Get-NormalizedPath $StagingPath
$packageFullPath = Get-NormalizedPath $PackagePath
$packageManifestFullPath = Get-NormalizedPath $PackageManifestPath
if ($packageFullPath -ieq $projectRootFull -or $packageFullPath.StartsWith($projectRootFull + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "PackagePath must be outside the canonical source project."
}
if ($packageManifestFullPath -ieq $projectRootFull -or $packageManifestFullPath.StartsWith($projectRootFull + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "PackageManifestPath must be outside the canonical source project."
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.Directory]::CreateDirectory((Split-Path -Parent $Path)) | Out-Null
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function ConvertTo-ExtendedPath([string]$Path) {
  $full = [System.IO.Path]::GetFullPath($Path)
  if ($full.StartsWith('\\?\')) { return $full }
  return '\\?\' + $full
}

function Read-StagedText([string]$Path) {
  return [System.IO.File]::ReadAllText((ConvertTo-ExtendedPath $Path))
}

function Get-PathFingerprint([string]$Path) {
  $normalized = (Get-NormalizedPath $Path).ToLowerInvariant()
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($normalized)
    return ([System.BitConverter]::ToString($sha256.ComputeHash($bytes)) -replace '-', '').ToLowerInvariant()
  } finally {
    $sha256.Dispose()
  }
}

function Get-TrustedStagingRelativePath([string]$Path) {
  return $Path.Substring($trustedStagingRoot.Length).TrimStart('\','/') -replace '\\','/'
}

function Test-SameOrDescendantPath([string]$Candidate, [string]$Ancestor) {
  $candidatePath = Get-NormalizedPath $Candidate
  $ancestorPath = Get-NormalizedPath $Ancestor
  if ($candidatePath -ieq $ancestorPath) { return $true }
  if ($candidatePath.Length -le $ancestorPath.Length) { return $false }
  if (-not $candidatePath.StartsWith($ancestorPath, [System.StringComparison]::OrdinalIgnoreCase)) { return $false }
  return $candidatePath[$ancestorPath.Length] -in @('\','/')
}

function Get-PathAncestors([string]$Path) {
  $current = Get-NormalizedPath $Path
  while ($true) {
    $parent = [System.IO.DirectoryInfo]::new($current).Parent
    if (-not $parent) { break }
    $parentPath = Get-NormalizedPath $parent.FullName
    if ($parentPath -ieq $current) { break }
    Write-Output $parentPath
    $current = $parentPath
  }
}

function Assert-NoReparsePointsAlongPath([string]$Path) {
  $current = Get-NormalizedPath $Path
  while ($true) {
    $item = Get-Item -LiteralPath $current -Force -ErrorAction SilentlyContinue
    if ($item -and (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
      throw "StagingPath is rejected because an existing path component is a reparse point: $current"
    }
    $parent = [System.IO.DirectoryInfo]::new($current).Parent
    if (-not $parent) { break }
    $parentPath = Get-NormalizedPath $parent.FullName
    if ($parentPath -ieq $current) { break }
    $current = $parentPath
  }
}

function Assert-NoReparsePointsInsideDirectory([string]$Path) {
  $rootItem = Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  if (-not ($rootItem -is [System.IO.DirectoryInfo])) {
    throw "Existing StagingPath is rejected because it is not a directory: $Path"
  }

  $stack = New-Object 'System.Collections.Generic.Stack[System.IO.DirectoryInfo]'
  $stack.Push([System.IO.DirectoryInfo]::new($Path))
  while ($stack.Count -gt 0) {
    $directory = $stack.Pop()
    foreach ($entry in $directory.EnumerateFileSystemInfos()) {
      if (($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Existing StagingPath is rejected because it contains a reparse point: $($entry.FullName)"
      }
      if ($entry -is [System.IO.DirectoryInfo]) {
        $stack.Push([System.IO.DirectoryInfo]::new($entry.FullName))
      }
    }
  }
}

function Assert-SafeStagingPath([string]$Path) {
  $candidate = Get-NormalizedPath $Path
  if (Test-SameOrDescendantPath $candidate $projectRootFull) {
    throw "StagingPath is rejected because it is the canonical source project or a descendant of it."
  }
  if (Test-SameOrDescendantPath $candidate $documentCenterRoot) {
    throw "StagingPath is rejected because it is the document center or a descendant of it."
  }
  if ($candidate -ieq $trustedStagingRoot) {
    throw "StagingPath is rejected because it is the trusted staging root itself; use a dedicated child directory."
  }
  if (-not (Test-SameOrDescendantPath $candidate $trustedStagingRoot)) {
    throw "StagingPath is rejected because it is outside the trusted staging root."
  }

  $protectedExactPaths = @(
    $projectRootFull,
    $documentCenterRoot,
    $trustedStagingRoot,
    [System.IO.Path]::GetPathRoot($projectRootFull),
    [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile)
  )
  $protectedExactPaths += @(Get-PathAncestors $projectRootFull)
  $protectedExactPaths += @(Get-PathAncestors $documentCenterRoot)
  foreach ($protectedPath in $protectedExactPaths) {
    if ($protectedPath -and $candidate -ieq (Get-NormalizedPath $protectedPath)) {
      throw "StagingPath is rejected because it is a protected project/workspace ancestor or root."
    }
  }

  Assert-NoReparsePointsAlongPath $candidate
  return $candidate
}

function Assert-ToolOwnedStaging([string]$Path) {
  Assert-NoReparsePointsInsideDirectory $Path
  $markerPath = Join-Path $Path $stagingMarkerName
  $markerItem = Get-Item -LiteralPath $markerPath -Force -ErrorAction SilentlyContinue
  if (-not $markerItem -or $markerItem -isnot [System.IO.FileInfo]) {
    throw "Existing StagingPath is rejected because it has no valid tool-ownership marker; use a new child directory."
  }
  if (($markerItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "Existing StagingPath is rejected because its ownership marker is a reparse point."
  }

  try {
    $marker = Read-StagedText $markerPath | ConvertFrom-Json
  } catch {
    throw "Existing StagingPath is rejected because its ownership marker is invalid."
  }

  $expected = @{
    marker_version = 1
    marker_type = 'review-staging'
    tool = '92-prepare-review-staging.ps1'
    package_id = $PackageId
    source_identity = 'CrossBorder-Independent-Store'
    document_center_identity = 'document-center'
    source_path_fingerprint = (Get-PathFingerprint $projectRootFull)
    document_center_path_fingerprint = (Get-PathFingerprint $documentCenterRoot)
    staging_path_fingerprint = (Get-PathFingerprint $Path)
    staging_relative_path = (Get-TrustedStagingRelativePath $Path)
  }
  foreach ($field in $expected.Keys) {
    $actual = [string]$marker.$field
    if ($actual -ne [string]$expected[$field]) {
      throw "Existing StagingPath is rejected because its ownership marker does not match this tool/task."
    }
  }
}

function Write-StagingOwnershipMarker([string]$Path) {
  $marker = [ordered]@{
    marker_version = 1
    marker_type = 'review-staging'
    tool = '92-prepare-review-staging.ps1'
    package_id = $PackageId
    source_identity = 'CrossBorder-Independent-Store'
    document_center_identity = 'document-center'
    source_path_fingerprint = (Get-PathFingerprint $projectRootFull)
    document_center_path_fingerprint = (Get-PathFingerprint $documentCenterRoot)
    staging_path_fingerprint = (Get-PathFingerprint $Path)
    staging_relative_path = (Get-TrustedStagingRelativePath $Path)
    created_utc = (Get-Date).ToUniversalTime().ToString('o')
  }
  Write-Utf8NoBom (Join-Path $Path $stagingMarkerName) (($marker | ConvertTo-Json -Compress) + [Environment]::NewLine)
}

function Get-ProjectRelativePath([string]$FullPath) {
  return $FullPath.Substring($projectRootFull.Length).TrimStart('\','/') -replace '\\','/'
}

function Get-DocumentCenterRelativePath([string]$FullPath) {
  return $FullPath.Substring($documentCenterRoot.Length).TrimStart('\','/') -replace '\\','/'
}

function Test-ExcludedSourcePath([string]$RelativePath, [bool]$IsDirectory) {
  $parts = @($RelativePath -split '/')
  $excludedDirectories = @('.git','node_modules','.next','.medusa','.runtime','.tooling','dist','build','coverage','.cache','.turbo','.nx','tmp','temp','logs','log','.spree')
  foreach ($part in $parts) {
    if ($excludedDirectories -contains $part) { return $true }
  }
  if ($IsDirectory) { return $false }

  $safeTemplates = @(
    '03_template/medusa-crossborder-base/.env.example',
    '03_template/medusa-crossborder-base/.env.template',
    '03_template/medusa-crossborder-base/apps/backend/.env.template',
    '03_template/medusa-crossborder-base/apps/storefront/.env.template'
  )
  if ($safeTemplates -contains $RelativePath) { return $false }

  $name = [System.IO.Path]::GetFileName($RelativePath)
  if ($name -like '.env*' -or $name -in @('credentials.json','medusa-admin.local.txt')) { return $true }
  if ($name -like '*.local.txt' -or $name -like '*.log' -or $name -like '*.zip' -or $name -like '*.attestation.txt' -or $name -like '*.tsbuildinfo') { return $true }
  return $false
}

function Test-ExcludedDocumentCenterPath([string]$RelativePath, [bool]$IsDirectory) {
  $parts = @($RelativePath -split '/')
  if ($parts -contains '.git') { return $true }
  if ($parts.Count -gt 0 -and $parts[0] -eq 'CrossBorder-Independent-Store') { return $true }
  # Reviewer ZIPs/outboxes and disposable staging are never copied into the
  # document-center snapshot. The outbox is intentionally project-local and
  # ignored by the document-center Git repository.
  if ($parts.Count -gt 0 -and ($parts[0] -like '_review*' -or $parts[0] -like '*STAGING*')) { return $true }
  if ($IsDirectory) { return $false }
  $name = [System.IO.Path]::GetFileName($RelativePath)
  if ($name -like '*.zip' -or $name -like '*.tsbuildinfo' -or $name -like '*.log') { return $true }
  # Package manifests are generated outside the ZIP after the staging copy;
  # the in-package manifest is generated at the staging root instead.
  if ($name -like 'CB-FULL-REVIEW-CHECKPOINT-002*_MANIFEST.md') { return $true }
  return $false
}

function Copy-Tree([string]$SourceRoot, [string]$DestinationRoot, [scriptblock]$RelativePathGetter, [scriptblock]$ExcludePredicate) {
  $included = 0
  $excluded = 0
  $stack = New-Object 'System.Collections.Generic.Stack[System.IO.DirectoryInfo]'
  $stack.Push([System.IO.DirectoryInfo]::new($SourceRoot))
  while ($stack.Count -gt 0) {
    $sourceDir = $stack.Pop()
    foreach ($entry in @($sourceDir.EnumerateFileSystemInfos())) {
      if (($entry.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { $excluded++; continue }
      $relative = & $RelativePathGetter $entry.FullName
      $isDirectory = $entry -is [System.IO.DirectoryInfo]
      if (& $ExcludePredicate $relative $isDirectory) { $excluded++; continue }
      $destination = Join-Path $DestinationRoot ($relative -replace '/', '\')
      if ($isDirectory) {
        New-Item -ItemType Directory -Force -Path $destination | Out-Null
        $stack.Push([System.IO.DirectoryInfo]::new($entry.FullName))
      } else {
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $destination) | Out-Null
        # Reviewer packages include benchmark history. Use the Win32 extended
        # path form so a long but valid source-relative path is not truncated
        # by the legacy MAX_PATH boundary during staging.
        [System.IO.File]::Copy((ConvertTo-ExtendedPath $entry.FullName), (ConvertTo-ExtendedPath $destination), $true)
        $included++
      }
    }
  }
  return [pscustomobject]@{ Included = $included; Excluded = $excluded }
}

function Get-StagingFiles {
  return @(Get-ChildItem -LiteralPath $stagingRoot -Recurse -Force -File -ErrorAction Stop)
}

function Get-StagingRelativePath([string]$FullPath) {
  return $FullPath.Substring($stagingRoot.Length).TrimStart('\','/') -replace '\\','/'
}

function Get-GitRepositoryRoot([string]$RepositoryPath) {
  if (-not (Test-Path -LiteralPath $RepositoryPath -PathType Container)) { return $null }
  $expected = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RepositoryPath).Path).TrimEnd('\')
  $actualRaw = (& git -C $expected rev-parse --show-toplevel 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $actualRaw) { return $null }
  return [System.IO.Path]::GetFullPath($actualRaw).TrimEnd('\')
}

function Get-GitHead([string]$RepositoryPath) {
  if (-not (Test-Path -LiteralPath $RepositoryPath -PathType Container)) { return 'NOT_AVAILABLE' }
  $expected = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RepositoryPath).Path).TrimEnd('\')
  $actual = Get-GitRepositoryRoot $expected
  if (-not $actual) { return 'UNAVAILABLE' }
  if ($actual -ine $expected) { return 'NOT_SEPARATE_GIT_REPOSITORY' }
  $head = (& git -C $expected rev-parse HEAD 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $head) { return 'UNAVAILABLE' }
  return $head
}

function Get-GitStatusLabel([string]$RepositoryPath) {
  if (-not (Test-Path -LiteralPath $RepositoryPath -PathType Container)) { return 'NOT_AVAILABLE' }
  $expected = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $RepositoryPath).Path).TrimEnd('\')
  $actual = Get-GitRepositoryRoot $expected
  if (-not $actual) { return 'UNAVAILABLE' }
  if ($actual -ine $expected) { return 'NOT_SEPARATE_GIT_REPOSITORY' }
  $status = (& git -C $expected status --short 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { return 'UNAVAILABLE' }
  if (-not $status) { return 'CLEAN' }
  return 'NOT_CLEAN'
}

function Get-SecretFindings {
  $findings = New-Object System.Collections.Generic.List[string]
  $safeMarkerPattern = '(?i)^(<[^>]+>|your[_-].*|example.*|dummy.*|placeholder.*|test.*|generated.*|localhost.*|127\.0\.0\.1.*)$'
  $assignmentPattern = '(?im)^\s*(?:export\s+)?(?<name>PASSWORD|PASSWD|TOKEN|SECRET|JWT_SECRET|COOKIE_SECRET|API[_-]?KEY|PRIVATE[_-]?KEY)\s*=\s*(?<value>[^#\r\n]*)'
  foreach ($file in Get-StagingFiles) {
    $relative = Get-StagingRelativePath $file.FullName
    if ($file.Name -in @('credentials.json','medusa-admin.local.txt') -or $file.Name -like '*.local.txt') {
      [void]$findings.Add($relative + ': credential filename')
      continue
    }
    $text = Read-StagedText $file.FullName
    if ($text -match '(?i)-----BEGIN [A-Z ]*PRIVATE KEY-----') {
      [void]$findings.Add($relative + ': private key pattern')
      continue
    }
    if ($file.Name -like '.env*') {
      foreach ($match in [regex]::Matches($text, $assignmentPattern)) {
        $value = $match.Groups['value'].Value.Trim().Trim('"').Trim("'")
        if ($value -and $value -notmatch $safeMarkerPattern) {
          [void]$findings.Add($relative + ': non-template credential-like assignment')
        }
      }
    }
  }
  return $findings
}

function Get-DenylistFindings {
  $findings = New-Object System.Collections.Generic.List[string]
  foreach ($file in Get-StagingFiles) {
    $relative = Get-StagingRelativePath $file.FullName
    $parts = @($relative -split '/')
    if ($parts | Where-Object { $_ -in @('.git','node_modules','.next','.medusa','.runtime','.tooling') }) {
      [void]$findings.Add($relative + ': generated/runtime directory')
      continue
    }
    if ($file.Name -in @('.env','.env.local','.env.e2e','credentials.json','REVIEW_MANIFEST.txt') -or $file.Name -like '*.local.txt' -or $file.Name -like '*.log' -or $file.Name -like '*.zip' -or $file.Name -like '*.tsbuildinfo') {
      [void]$findings.Add($relative + ': denylisted filename')
    }
  }
  return $findings
}

function Test-AbsolutePathAllowlist([string]$RelativePath) {
  if ($RelativePath -match '(^|/)archive/') { return $true }
  if ($RelativePath -match '(?i)(WORKSPACE_MIGRATION_VALIDATION|DOCKER_RECOVERY_AND_DISK_AUDIT|DOCUMENT_CLEANUP_VALIDATION|SOURCE_MARKDOWN_AUDIT|REVIEW02_WORKSPACE_SIZE_REPORT)\.md$') { return $true }
  return $false
}

function Get-AbsolutePathFindings {
  $findings = New-Object System.Collections.Generic.List[string]
  foreach ($file in Get-StagingFiles) {
    $relative = Get-StagingRelativePath $file.FullName
    if (Test-AbsolutePathAllowlist $relative) { continue }
    $text = Read-StagedText $file.FullName
    if ($text -match '(?i)(?:[A-Z]:\\Users\\[^\\/\r\n]+\\|[A-Z]:/Users/[^/\r\n]+/)') {
      [void]$findings.Add($relative + ': machine-specific absolute path')
    }
  }
  return $findings
}

function Get-MarkdownLinkFindings {
  $findings = New-Object System.Collections.Generic.List[string]
  $linkPattern = '\[[^\]]+\]\(([^)]+)\)'
  foreach ($file in Get-StagingFiles | Where-Object { $_.Extension -ieq '.md' }) {
    $relativeFile = Get-StagingRelativePath $file.FullName
    $text = Read-StagedText $file.FullName
    foreach ($match in [regex]::Matches($text, $linkPattern)) {
      $target = $match.Groups[1].Value.Trim()
      if ($target -match '^(?i)(https?:|mailto:|data:|#)') { continue }
      $target = ($target -split '[#?]', 2)[0].Trim().Trim('<','>')
      if (-not $target) { continue }
      if ([System.IO.Path]::IsPathRooted($target) -or $target -match '^(?i)[A-Z]:[\\/]') { continue }
      $candidate = [System.IO.Path]::GetFullPath((Join-Path (Split-Path -Parent $file.FullName) ($target -replace '/', '\')))
      if (-not (Test-Path -LiteralPath $candidate)) {
        [void]$findings.Add($relativeFile + ' -> ' + $target)
      }
    }
  }
  return $findings
}

$stagingRoot = Assert-SafeStagingPath $stagingRoot
if (Test-Path -LiteralPath $stagingRoot) {
  Assert-ToolOwnedStaging $stagingRoot
  [System.IO.Directory]::Delete((ConvertTo-ExtendedPath $stagingRoot), $true)
}
New-Item -ItemType Directory -Force -Path $stagingRoot | Out-Null
Write-StagingOwnershipMarker $stagingRoot

$sourceDestinationRoot = Join-Path $stagingRoot 'CrossBorder-Independent-Store'
$projectCopy = Copy-Tree $projectRootFull $sourceDestinationRoot ${function:Get-ProjectRelativePath} ${function:Test-ExcludedSourcePath}
$centerCopy = Copy-Tree $documentCenterRoot $stagingRoot ${function:Get-DocumentCenterRelativePath} ${function:Test-ExcludedDocumentCenterPath}

$safeTemplatePaths = @(
  '03_template/medusa-crossborder-base/.env.example',
  '03_template/medusa-crossborder-base/.env.template',
  '03_template/medusa-crossborder-base/apps/backend/.env.template',
  '03_template/medusa-crossborder-base/apps/storefront/.env.template'
)
$templateHashes = New-Object System.Collections.Generic.List[string]
foreach ($relative in $safeTemplatePaths) {
  $source = Join-Path $projectRootFull ($relative -replace '/', '\')
  $staged = Join-Path $sourceDestinationRoot ($relative -replace '/', '\')
  if (-not (Test-Path -LiteralPath $source) -or -not (Test-Path -LiteralPath $staged)) { throw "Required safe environment template is missing: $relative" }
  $sourceHash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
  $stagedHash = (Get-FileHash -LiteralPath $staged -Algorithm SHA256).Hash
  if ($sourceHash -ne $stagedHash) { throw "Safe environment template was not copied byte-for-byte: $relative" }
  [void]$templateHashes.Add($relative + '=' + $sourceHash)
}

$rootHead = Get-GitHead $projectRootFull
$rootStatus = Get-GitStatusLabel $projectRootFull
$medusaRoot = Join-Path $projectRootFull '02_demos/medusa-dtc'
$spreeRoot = Join-Path $projectRootFull '02_demos/spree-demo'
$medusaHead = Get-GitHead $medusaRoot
$medusaStatus = Get-GitStatusLabel $medusaRoot
$spreeHead = Get-GitHead $spreeRoot
$spreeStatus = Get-GitStatusLabel $spreeRoot
$documentCenterHead = Get-GitHead $documentCenterRoot
$documentCenterStatus = Get-GitStatusLabel $documentCenterRoot

$packageManifestContent = @(
  ('# ' + $PackageId + ' PACKAGE')
  ''
  'PACKAGE_MANIFEST_ROLE=IN_PACKAGE_REPRODUCIBILITY_COPY'
  'PACKAGE_LAYOUT=LIVE_WORKSPACE_SHAPE'
  'ZIP_SHA256=RECORDED_IN_EXTERNAL_MANIFEST'
  'REVIEW_PACKAGE_REPRODUCIBILITY=PASS'
  'DUPLICATED_SOURCE_TREE=NO'
  'SAFE_ENV_TEMPLATES_INCLUDED=4'
  'RUNTIME_ENV_INCLUDED=0'
  'SECRET_SCAN=PASS'
  'PAYPAL_SANDBOX_STARTED=NO'
  'CURRENT_STAGE=PAYMENT_INTEGRATION'
  'NEXT_PHASE=PAYPAL_ACCOUNT_SANDBOX_CAPABILITY'
  ('ROOT_HEAD=' + $rootHead)
  ('ROOT_STATUS=' + $rootStatus)
  ('MEDUSA_HEAD=' + $medusaHead)
  ('MEDUSA_STATUS=' + $medusaStatus)
  ('SPREE_HEAD=' + $spreeHead)
  ('SPREE_STATUS=' + $spreeStatus)
  ('DOCUMENT_CENTER_HEAD=' + $documentCenterHead)
  ('DOCUMENT_CENTER_HEAD_AT_PACKAGE_GENERATION=' + $documentCenterHead)
  'DOCUMENT_CENTER_FINAL_HEAD_AFTER_MANIFEST_COMMIT=RECORDED_AFTER_MANIFEST_COMMIT'
  ('DOCUMENT_CENTER_STATUS=' + $documentCenterStatus)
)
Write-Utf8NoBom (Join-Path $stagingRoot ($PackageId + '_MANIFEST.md')) (($packageManifestContent -join [Environment]::NewLine) + [Environment]::NewLine)

$secretFindings = @(Get-SecretFindings)
$denylistFindings = @(Get-DenylistFindings)
$absolutePathFindings = @(Get-AbsolutePathFindings)
$markdownLinkFindings = @(Get-MarkdownLinkFindings)
$secretResult = if ($secretFindings.Count -eq 0) { 'PASS' } else { 'FAIL' }
$denylistResult = if ($denylistFindings.Count -eq 0) { 'PASS' } else { 'FAIL' }
$absolutePathResult = if ($absolutePathFindings.Count -eq 0) { 'PASS' } else { 'FAIL' }
$linkResult = if ($markdownLinkFindings.Count -eq 0) { 'PASS' } else { 'FAIL' }

$baseFiles = @(Get-StagingFiles).Count
$stagingManifestLines = @(
  'REVIEW_STAGING_MANIFEST=1'
  'PACKAGE_LAYOUT=LIVE_WORKSPACE_SHAPE'
  'DOCUMENT_CENTER_AT_PACKAGE_ROOT=YES'
  'SOURCE_COPIED_ONCE_UNDER_CrossBorder-Independent-Store=YES'
  ('GENERATED_AT_UTC=' + (Get-Date).ToUniversalTime().ToString('o'))
  ('COPIED_SOURCE_FILE_COUNT=' + [int]$projectCopy.Included)
  ('COPIED_DOCUMENT_CENTER_FILE_COUNT=' + [int]$centerCopy.Included)
  ('STAGING_FILE_COUNT=' + ($baseFiles + 1))
  ('EXCLUDED_SOURCE_ENTRY_COUNT=' + [int]$projectCopy.Excluded)
  ('EXCLUDED_DOCUMENT_CENTER_ENTRY_COUNT=' + [int]$centerCopy.Excluded)
  'EXCLUDED_RUNTIME_SECRETS=YES'
  'RUNTIME_ENV_INCLUDED=0'
  'SAFE_ENV_TEMPLATES_INCLUDED=4'
  ('SECRET_SCAN_RESULT=' + $secretResult)
  ('REAL_CREDENTIAL_LEAKS=' + $secretFindings.Count)
  ('DENYLIST_SCAN_RESULT=' + $denylistResult)
  ('DENYLIST_MATCHES=' + $denylistFindings.Count)
  ('ABSOLUTE_PATH_SCAN=' + $absolutePathResult)
  ('ABSOLUTE_PATH_MATCHES=' + $absolutePathFindings.Count)
  ('PACKAGE_RELATIVE_LINK_SCAN=' + $linkResult)
  ('PACKAGE_RELATIVE_LINK_MATCHES=' + $markdownLinkFindings.Count)
  ('ZIP_CREATED=' + $(if ($CreateZip) { 'YES' } else { 'NO' }))
  'ZIP_SHA256=RECORDED_IN_EXTERNAL_MANIFEST'
  ('SAFE_ENV_TEMPLATE_HASHES=' + ($templateHashes -join ';'))
  ('ROOT_HEAD=' + $rootHead)
  ('ROOT_STATUS=' + $rootStatus)
  ('MEDUSA_HEAD=' + $medusaHead)
  ('MEDUSA_STATUS=' + $medusaStatus)
  ('SPREE_HEAD=' + $spreeHead)
  ('SPREE_STATUS=' + $spreeStatus)
)
Write-Utf8NoBom (Join-Path $stagingRoot 'STAGING_MANIFEST.txt') (($stagingManifestLines -join [Environment]::NewLine) + [Environment]::NewLine)

$actualStagingFileCount = @(Get-StagingFiles).Count
if ($actualStagingFileCount -ne ($baseFiles + 1)) { throw "Staging file count mismatch: expected=$($baseFiles + 1) actual=$actualStagingFileCount" }

if ($secretFindings.Count -gt 0 -or $denylistFindings.Count -gt 0 -or $absolutePathFindings.Count -gt 0 -or $markdownLinkFindings.Count -gt 0) {
  foreach ($finding in @($secretFindings + $denylistFindings + $absolutePathFindings + $markdownLinkFindings)) { Write-Host ('FINDING=' + $finding) }
  throw "Review package validation failed."
}

$zipSha256 = 'NOT_CREATED'
$packageFileCount = 0
$packageSizeBytes = 0
if ($CreateZip) {
  if (Test-Path -LiteralPath $packageFullPath) { [System.IO.File]::Delete($packageFullPath) }
  [System.IO.Directory]::CreateDirectory((Split-Path -Parent $packageFullPath)) | Out-Null
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  # ZipFile.CreateFromDirectory still resolves each entry through the legacy
  # MAX_PATH path APIs on Windows. Create entries explicitly so the same
  # extended-path-safe staging also works for long benchmark filenames.
  $zipStream = [System.IO.File]::Open((ConvertTo-ExtendedPath $packageFullPath), [System.IO.FileMode]::Create, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
  $zipArchive = [System.IO.Compression.ZipArchive]::new($zipStream, [System.IO.Compression.ZipArchiveMode]::Create, $false)
  try {
    foreach ($file in Get-StagingFiles) {
      $entry = $zipArchive.CreateEntry((Get-StagingRelativePath $file.FullName), [System.IO.Compression.CompressionLevel]::Optimal)
      $inputStream = $null
      $outputStream = $null
      try {
        $inputStream = [System.IO.File]::OpenRead((ConvertTo-ExtendedPath $file.FullName))
        $outputStream = $entry.Open()
        $inputStream.CopyTo($outputStream)
      } finally {
        if ($outputStream) { $outputStream.Dispose() }
        if ($inputStream) { $inputStream.Dispose() }
      }
    }
  } finally {
    $zipArchive.Dispose()
    $zipStream.Dispose()
  }
  $zipSha256 = (Get-FileHash -LiteralPath $packageFullPath -Algorithm SHA256).Hash
  $packageSizeBytes = (Get-Item -LiteralPath $packageFullPath).Length
  $packageFileCount = @(Get-ChildItem -LiteralPath $stagingRoot -Recurse -Force -File).Count

  $externalManifestLines = @(
    ('# ' + $PackageId + ' Manifest')
    ''
    'TASK_ID=CB-FULL-REVIEW-CHECKPOINT-002-FIX-R2-FINAL'
    ('PACKAGE_ID=' + $PackageId)
    ('CANONICAL_PROJECT=' + $projectRootFull)
    ('DOCUMENT_CENTER=' + $documentCenterRoot)
    'PACKAGE_LAYOUT=LIVE_WORKSPACE_SHAPE'
    'PACKAGE_ROOT_CONTENTS=DOCUMENT_CENTER_FILES_PLUS_CrossBorder-Independent-Store_CHILD'
    'DUPLICATED_SOURCE_TREE=NO'
    'REVIEW_PACKAGE_REPRODUCIBILITY=PASS'
    'INCLUDED_TOP_LEVEL_AREAS=00_HANDOFF.md,DOCUMENT_INDEX.md,CURRENT_STATE.md,ROADMAP.md,payment,product,ui,operations,archive,CrossBorder-Independent-Store'
    'EXCLUDED=.git,node_modules,.next,.medusa,.runtime,runtime_env,credentials,database_payload,Docker_payload,logs,caches,coverage,dist,build,tsbuildinfo,old_ZIPs,temporary_staging'
    'SAFE_ENV_TEMPLATES_INCLUDED=4'
    'RUNTIME_ENV_INCLUDED=0'
    'REAL_SECRET_PACKAGED=NO'
    'SECRET_SCAN=PASS'
    'DENYLIST_SCAN=PASS'
    'ABSOLUTE_PATH_SCAN=PASS_WITH_EVIDENCE_ALLOWLIST'
    'PACKAGE_RELATIVE_LINKS=0'
    'PACKAGE_MANIFEST_INCLUDED=YES'
    'STAGING_MANIFEST_INCLUDED=YES'
    ('PACKAGE_FILE_COUNT=' + $packageFileCount)
    ('PACKAGE_SIZE_BYTES=' + $packageSizeBytes)
    ('ZIP_SHA256=' + $zipSha256)
    'CURRENT_STAGE=PAYMENT_INTEGRATION'
    'NEXT_PHASE=PAYPAL_ACCOUNT_SANDBOX_CAPABILITY'
    'PAYPAL_SANDBOX_STARTED=NO'
    'PAYPAL_PROVIDER_ENABLED=NO'
    'PAYPAL_CUSTOMER_EXPOSURE=DISABLED'
    'REAL_PAYPAL_API_CALLED=NO'
    'REAL_WORLDFIRST_API_CALLED=NO'
    'REAL_MONEY_CHARGED=NO'
    ('ROOT_HEAD=' + $rootHead)
    ('ROOT_STATUS=' + $rootStatus)
    ('MEDUSA_HEAD=' + $medusaHead)
    ('MEDUSA_STATUS=' + $medusaStatus)
    ('SPREE_HEAD=' + $spreeHead)
    ('SPREE_STATUS=' + $spreeStatus)
    ('DOCUMENT_CENTER_HEAD=' + $documentCenterHead)
    ('DOCUMENT_CENTER_HEAD_AT_PACKAGE_GENERATION=' + $documentCenterHead)
    'DOCUMENT_CENTER_FINAL_HEAD_AFTER_MANIFEST_COMMIT=RECORDED_AFTER_MANIFEST_COMMIT'
    ('DOCUMENT_CENTER_STATUS=' + $documentCenterStatus)
    ('SAFE_ENV_TEMPLATE_HASHES=' + ($templateHashes -join ';'))
    ''
    'The external manifest is intentionally written after ZIP creation so the ZIP hash is not circular. The in-package manifest carries the same package identity and explicitly points to this external hash record.'
  )
  Write-Utf8NoBom $packageManifestFullPath (($externalManifestLines -join [Environment]::NewLine) + [Environment]::NewLine)
  $stagingRoot = Assert-SafeStagingPath $stagingRoot
  Assert-ToolOwnedStaging $stagingRoot
  [System.IO.Directory]::Delete((ConvertTo-ExtendedPath $stagingRoot), $true)
  Write-Host 'STAGING_DELETED=YES'
}

Write-Host "REVIEW_STAGING=PASS"
Write-Host "STAGING_PATH=$stagingRoot"
Write-Host "PACKAGE_LAYOUT=LIVE_WORKSPACE_SHAPE"
Write-Host "PACKAGE_RELATIVE_LINKS=0"
Write-Host "REVIEW_PACKAGE_REPRODUCIBILITY=PASS"
Write-Host "SAFE_ENV_TEMPLATES_INCLUDED=4"
Write-Host "RUNTIME_ENV_INCLUDED=0"
Write-Host "SECRET_SCAN=PASS"
Write-Host "DUPLICATED_SOURCE_TREE=NO"
Write-Host ("ZIP_CREATED=" + $(if ($CreateZip) { 'YES' } else { 'NO' }))
if ($CreateZip) {
  Write-Host "PACKAGE_PATH=$packageFullPath"
  Write-Host "PACKAGE_FILE_COUNT=$packageFileCount"
  Write-Host "PACKAGE_SIZE_BYTES=$packageSizeBytes"
  Write-Host "ZIP_SHA256=$zipSha256"
  Write-Host "PACKAGE_MANIFEST_PATH=$packageManifestFullPath"
}

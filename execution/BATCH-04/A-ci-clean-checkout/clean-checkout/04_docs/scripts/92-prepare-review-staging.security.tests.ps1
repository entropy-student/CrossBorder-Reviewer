[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot '92-prepare-review-staging.ps1'
$sourceRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..')).Path
$documentCenterRoot = Split-Path -Parent $sourceRoot
$workspaceParent = Split-Path -Parent $documentCenterRoot
$trustedStagingRoot = Join-Path $workspaceParent '_review_stage'
$runId = 'RT-01-R1-' + [Guid]::NewGuid().ToString('N')
$fixtureRoot = Join-Path $trustedStagingRoot ('security-tests\' + $runId)
$externalTarget = Join-Path $fixtureRoot 'external-target'
$outsideCandidate = Join-Path $workspaceParent ('_' + $runId + '-outside-candidate')
$packageRoot = Join-Path $fixtureRoot 'outputs'
$packagePath = Join-Path $packageRoot 'package.zip'
$packageManifestPath = Join-Path $packageRoot 'manifest.md'
$packageId = 'RT-01-R1-' + $runId

$results = New-Object System.Collections.Generic.List[object]
$failures = New-Object System.Collections.Generic.List[string]
$passCount = 0
$failCount = 0
$skipCount = 0
$dangerousChildEntrypointCalls = 0
$shell = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $shell) { $shell = (Get-Command powershell -ErrorAction Stop).Source }

function Add-Result([string]$Name, [ValidateSet('PASS', 'FAIL', 'SKIP')][string]$Status, [string]$Detail) {
  $result = [pscustomobject]@{ Name = $Name; Status = $Status; Detail = $Detail }
  [void]$results.Add($result)
  switch ($Status) {
    'PASS' { $script:passCount++ }
    'FAIL' { $script:failCount++; [void]$script:failures.Add($Name) }
    'SKIP' { $script:skipCount++ }
  }
}

function Get-TestNormalizedPath([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { throw 'Test path is empty.' }
  return [System.IO.Path]::GetFullPath($Path)
}

function Test-TestSameOrDescendant([string]$Candidate, [string]$Ancestor) {
  $candidateFull = Get-TestNormalizedPath $Candidate
  $ancestorFull = Get-TestNormalizedPath $Ancestor
  if ([string]::Equals($candidateFull, $ancestorFull, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
  $ancestorWithSeparator = $ancestorFull.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  return $candidateFull.StartsWith($ancestorWithSeparator, [System.StringComparison]::OrdinalIgnoreCase)
}

function Assert-TestNoReparseChain([string]$Path) {
  $current = Get-TestNormalizedPath $Path
  while ($true) {
    if (Test-Path -LiteralPath $current) {
      $item = Get-Item -LiteralPath $current -Force
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Test boundary contains a reparse point: $current"
      }
    }
    $parent = Split-Path -Parent $current
    if ([string]::IsNullOrEmpty($parent) -or [string]::Equals($parent, $current, [System.StringComparison]::OrdinalIgnoreCase)) { break }
    $current = $parent
  }
}

function Assert-TestFixturePath([string]$Path, [switch]$MustExist) {
  $candidate = Get-TestNormalizedPath $Path
  $fixture = Get-TestNormalizedPath $fixtureRoot
  if ([string]::Equals($candidate, $fixture, [System.StringComparison]::OrdinalIgnoreCase)) {
    if ($MustExist -and -not (Test-Path -LiteralPath $candidate -PathType Container)) { throw 'Test fixture root is missing.' }
  } elseif (-not (Test-TestSameOrDescendant $candidate $fixture)) {
    throw "Test path is outside the dedicated fixture root: $candidate"
  }
  if ($MustExist -and -not (Test-Path -LiteralPath $candidate)) { throw "Test path is missing: $candidate" }
  Assert-TestNoReparseChain $candidate
}

function Assert-FixtureCreateBoundary() {
  $trusted = Get-TestNormalizedPath $trustedStagingRoot
  $fixture = Get-TestNormalizedPath $fixtureRoot
  if ([string]::Equals($fixture, $trusted, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Test fixture cannot equal the trusted staging root.' }
  if (-not (Test-TestSameOrDescendant $fixture $trusted)) { throw 'Test fixture is outside the trusted staging root.' }
  if (Test-Path -LiteralPath $fixture) { throw 'Test fixture unexpectedly already exists.' }
  Assert-TestNoReparseChain $trusted
}

function Assert-FixtureCleanupBoundary() {
  $trusted = Get-TestNormalizedPath $trustedStagingRoot
  $fixture = Get-TestNormalizedPath $fixtureRoot
  if ([string]::Equals($fixture, $trusted, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Cleanup refused to target the trusted staging root.' }
  if (-not (Test-TestSameOrDescendant $fixture $trusted)) { throw 'Cleanup target is outside the trusted staging root.' }
  if (-not (Test-Path -LiteralPath $fixture -PathType Container)) { throw 'Cleanup fixture is missing.' }
  $rootItem = Get-Item -LiteralPath $fixture -Force
  if (($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Cleanup refused a reparse-point fixture root.' }
  Assert-TestNoReparseChain $fixture
}

function Assert-TestTreeNoReparse([string]$Path) {
  Assert-TestFixturePath $Path -MustExist
  $reparse = Get-ChildItem -LiteralPath $Path -Force -Recurse -ErrorAction SilentlyContinue | Where-Object {
    ($_.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
  }
  if ($reparse) { throw "Test tree contains a reparse point: $($reparse[0].FullName)" }
}

function Remove-TestTreeSafely([string]$TargetRoot) {
  Assert-TestFixturePath $TargetRoot -MustExist
  Assert-TestTreeNoReparse $TargetRoot
  # The tree was fully checked for reparse points and the exact fixture
  # boundary above; delete only that validated disposable root.
  $validatedRoot = Get-TestNormalizedPath $TargetRoot
  $extendedRoot = if ($validatedRoot.StartsWith('\\?\')) { $validatedRoot } else { '\\?\' + $validatedRoot }
  [System.IO.Directory]::Delete($extendedRoot, $true)
  if (Test-Path -LiteralPath $validatedRoot) { throw 'Fixture cleanup did not remove the exact validated test root.' }
}

function New-TestDirectory([string]$Path) {
  Assert-TestFixturePath $Path
  [System.IO.Directory]::CreateDirectory($Path) | Out-Null
}

function Write-TestFile([string]$Path, [string]$Content) {
  Assert-TestFixturePath $Path
  [System.IO.Directory]::CreateDirectory((Split-Path -Parent $Path)) | Out-Null
  [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function Get-TestFileText([string]$Path) {
  Assert-TestFixturePath $Path -MustExist
  return [System.IO.File]::ReadAllText($Path)
}

function Set-Utf8NoBomFile([string]$Path, [string]$Content) {
  [System.IO.File]::WriteAllText($Path, $Content, (New-Object System.Text.UTF8Encoding($false)))
}

function Assert-Unchanged([string]$Name, [string]$Path, [string]$Before) {
  $exists = Test-Path -LiteralPath $Path
  $after = if ($exists) { [System.IO.File]::ReadAllText($Path) } else { '<MISSING>' }
  Add-Result $Name $(if ($exists -and $after -ceq $Before) { 'PASS' } else { 'FAIL' }) "exists=$exists;content-comparison=exact"
}

function ConvertTo-PsLiteral([string]$Value) {
  return "'" + $Value.Replace("'", "''") + "'"
}

$scriptText = [System.IO.File]::ReadAllText($scriptPath)
$tokens = $null
$parseErrors = $null
$scriptAst = [System.Management.Automation.Language.Parser]::ParseInput($scriptText, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count -gt 0) { throw "Source staging script parse failed with $($parseErrors.Count) error(s)." }

function Get-FunctionSource([string]$Name) {
  $matches = @($scriptAst.FindAll({ param($node)
        $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $Name
      }, $true))
  if ($matches.Count -ne 1) { throw "Expected exactly one source function definition for $Name; found $($matches.Count)." }
  return $matches[0].Extent.Text
}

$pureFunctionNames = @(
  'Get-NormalizedPath',
  'Test-SameOrDescendantPath',
  'Get-PathAncestors',
  'Assert-NoReparsePointsAlongPath',
  'Assert-NoReparsePointsInsideDirectory',
  'Assert-SafeStagingPath'
)
$pureFunctionSource = ($pureFunctionNames | ForEach-Object { Get-FunctionSource $_ }) -join [Environment]::NewLine
Add-Result 'AST_FUNCTION_EXTRACTION' 'PASS' 'loaded pure validation functions only; full script entrypoint not dot-sourced'

function Invoke-PurePathValidation([string]$Candidate) {
  $blockText = @(
    '$ErrorActionPreference = ''Stop''',
    ('$projectRootFull = ' + (ConvertTo-PsLiteral $sourceRoot)),
    ('$documentCenterRoot = ' + (ConvertTo-PsLiteral $documentCenterRoot)),
    ('$trustedStagingRoot = ' + (ConvertTo-PsLiteral $trustedStagingRoot)),
    ('$candidate = ' + (ConvertTo-PsLiteral $Candidate)),
    $pureFunctionSource,
    'Assert-SafeStagingPath $candidate'
  ) -join [Environment]::NewLine
  try {
    $output = @(& ([scriptblock]::Create($blockText)) 2>&1 | ForEach-Object { $_.ToString() })
    return [pscustomobject]@{ Accepted = $true; ErrorMessage = $null; Output = ($output -join [Environment]::NewLine) }
  } catch {
    return [pscustomobject]@{ Accepted = $false; ErrorMessage = $_.Exception.Message; Output = '' }
  }
}

function Invoke-PureDirectoryValidation([string]$Candidate) {
  $blockText = @(
    '$ErrorActionPreference = ''Stop''',
    ('$candidate = ' + (ConvertTo-PsLiteral $Candidate)),
    $pureFunctionSource,
    'Assert-NoReparsePointsInsideDirectory $candidate'
  ) -join [Environment]::NewLine
  try {
    $output = @(& ([scriptblock]::Create($blockText)) 2>&1 | ForEach-Object { $_.ToString() })
    return [pscustomobject]@{ Accepted = $true; ErrorMessage = $null; Output = ($output -join [Environment]::NewLine) }
  } catch {
    return [pscustomobject]@{ Accepted = $false; ErrorMessage = $_.Exception.Message; Output = '' }
  }
}

function Test-ExpectedRejection([scriptblock]$Action, [string]$ExpectedPattern) {
  try {
    $output = @(& $Action 2>&1 | ForEach-Object { $_.ToString() })
    return [pscustomobject]@{ Rejected = $false; ExpectedReason = $false; ErrorMessage = $null; Output = ($output -join [Environment]::NewLine) }
  } catch {
    $message = $_.Exception.Message
    return [pscustomobject]@{ Rejected = $true; ExpectedReason = ($message -match $ExpectedPattern); ErrorMessage = $message; Output = '' }
  }
}

function Quote-ProcessArgument([string]$Value) {
  return '"' + $Value.Replace('"', '\"') + '"'
}

function Invoke-ChildStaging([string]$Name, [string]$StagingPath, [bool]$ExpectedSuccess, [string]$ExpectedPattern, [switch]$AllowReparseStaging) {
  if ($AllowReparseStaging) {
    if (-not (Test-TestSameOrDescendant $StagingPath $fixtureRoot)) { throw 'Reparse staging test path escaped the fixture root.' }
    Assert-TestNoReparseChain (Split-Path -Parent $StagingPath)
    $reparseItem = Get-Item -LiteralPath $StagingPath -Force
    if (($reparseItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) { throw 'Reparse staging test path is not a reparse point.' }
  } else {
    Assert-TestFixturePath $StagingPath
  }
  Assert-TestFixturePath $packageRoot
  Assert-TestFixturePath $packagePath
  Assert-TestFixturePath $packageManifestPath
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $shell
  $psi.Arguments = '-NoLogo -NoProfile -ExecutionPolicy Bypass -File ' + (Quote-ProcessArgument $scriptPath) +
    ' -StagingPath ' + (Quote-ProcessArgument $StagingPath) +
    ' -PackagePath ' + (Quote-ProcessArgument $packagePath) +
    ' -PackageManifestPath ' + (Quote-ProcessArgument $packageManifestPath) +
    ' -PackageId ' + (Quote-ProcessArgument $packageId)
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  $exitCode = $process.ExitCode
  $actualSuccess = $exitCode -eq 0
  $combined = $stdout + [Environment]::NewLine + $stderr
  $outcome = if ($ExpectedSuccess) {
    $actualSuccess -and $stdout -match 'REVIEW_STAGING=PASS'
  } else {
    (-not $actualSuccess) -and ($combined -match $ExpectedPattern)
  }
  $detail = "exit=$exitCode;expected=$ExpectedSuccess;expected-reason=$ExpectedPattern"
  Add-Result $Name $(if ($outcome) { 'PASS' } else { 'FAIL' }) $detail
  Write-Output "CHILD_CASE=$Name"
  Write-Output "CHILD_EXIT_CODE=$exitCode"
  Write-Output 'CHILD_STDOUT_BEGIN'
  Write-Output $stdout -NoEnumerate
  Write-Output 'CHILD_STDOUT_END'
  Write-Output 'CHILD_STDERR_BEGIN'
  Write-Output $stderr -NoEnumerate
  Write-Output 'CHILD_STDERR_END'
  return [pscustomobject]@{ ExitCode = $exitCode; Stdout = $stdout; Stderr = $stderr }
}

function Assert-Sentinel([string]$Name, [string]$Path, [string]$ExpectedText) {
  $exists = Test-Path -LiteralPath $Path
  $content = if ($exists) { Get-TestFileText $Path } else { '<MISSING>' }
  Add-Result $Name $(if ($exists -and $content -ceq $ExpectedText) { 'PASS' } else { 'FAIL' }) 'sentinel-content-comparison=exact'
}

$sourceProtectedFile = Join-Path $sourceRoot 'PROJECT_STATUS.json'
$documentProtectedFile = Join-Path $documentCenterRoot '00_HANDOFF.md'
$documentProtectedFileCreatedForTest = $false
if (-not (Test-Path -LiteralPath $documentProtectedFile)) {
  Set-Utf8NoBomFile $documentProtectedFile "RT-01 isolated clean-checkout document fixture`n"
  $documentProtectedFileCreatedForTest = $true
}
$sourceBefore = [System.IO.File]::ReadAllText($sourceProtectedFile)
$documentBefore = [System.IO.File]::ReadAllText($documentProtectedFile)
$fixtureCreated = $false
$junction = Join-Path $fixtureRoot 'junction-stage'
$junctionTarget = Join-Path $fixtureRoot 'junction-target'
$internalReparseRoot = Join-Path $fixtureRoot 'internal-reparse-root'
$internalReparseChild = Join-Path $internalReparseRoot 'linked-child'

try {
  Assert-FixtureCreateBoundary
  New-TestDirectory $fixtureRoot
  $fixtureCreated = $true
  Assert-TestFixturePath $fixtureRoot -MustExist
  New-TestDirectory $externalTarget
  Write-TestFile (Join-Path $externalTarget 'outside-sentinel.txt') 'outside-sentinel'

  $invalidPaths = @(
    @{ Name = 'REJECT_SOURCE_ROOT'; Path = $sourceRoot; Pattern = 'canonical source project' },
    @{ Name = 'REJECT_SOURCE_DESCENDANT'; Path = Join-Path $sourceRoot 'not-a-stage'; Pattern = 'canonical source project' },
    @{ Name = 'REJECT_SOURCE_CASE_AND_TRAILING_SEPARATOR'; Path = $sourceRoot.ToUpperInvariant() + '\'; Pattern = 'canonical source project' },
    @{ Name = 'REJECT_DOCUMENT_CENTER_ROOT'; Path = $documentCenterRoot; Pattern = 'document center' },
    @{ Name = 'REJECT_DOCUMENT_CENTER_DESCENDANT'; Path = Join-Path $documentCenterRoot 'not-a-stage'; Pattern = 'document center' },
    @{ Name = 'REJECT_WORKSPACE_ANCESTOR'; Path = $workspaceParent; Pattern = 'protected ancestor|outside the trusted staging root' },
    @{ Name = 'REJECT_USER_HOME'; Path = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile); Pattern = 'protected ancestor|outside the trusted staging root' },
    @{ Name = 'REJECT_DISK_ROOT'; Path = [System.IO.Path]::GetPathRoot($sourceRoot); Pattern = 'protected ancestor|outside the trusted staging root' },
    @{ Name = 'REJECT_TRUSTED_ROOT'; Path = $trustedStagingRoot; Pattern = 'trusted staging root itself' },
    @{ Name = 'REJECT_TRUSTED_ROOT_SIMILAR_PREFIX'; Path = $trustedStagingRoot + '-sibling'; Pattern = 'outside the trusted staging root' },
    @{ Name = 'REJECT_EXTERNAL_TARGET'; Path = $outsideCandidate; Pattern = 'outside the trusted staging root' },
    @{ Name = 'REJECT_NORMALIZED_SOURCE_ANCESTOR'; Path = Join-Path $trustedStagingRoot ('..\..\CrossBorder-Independent-Store'); Pattern = 'canonical source project|protected ancestor|outside the trusted staging root' }
  )
  foreach ($case in $invalidPaths) {
    $probe = Invoke-PurePathValidation $case.Path
    $rejection = Test-ExpectedRejection { if ($probe.Accepted) { return $probe.Output }; throw $probe.ErrorMessage } $case.Pattern
    $passed = $probe.Accepted -eq $false -and $rejection.Rejected -and $rejection.ExpectedReason
    $detail = "pure-validation-only;expected-reason=$($case.Pattern);actual-error=$($probe.ErrorMessage)"
    Add-Result $case.Name $(if ($passed) { 'PASS' } else { 'FAIL' }) $detail
  }
  Add-Result 'DANGEROUS_PATHS_FULL_ENTRYPOINT_CALLS' $(if ($dangerousChildEntrypointCalls -eq 0) { 'PASS' } else { 'FAIL' }) 'dangerous paths never invoked the top-level staging script'

  $legalPurePath = Join-Path $fixtureRoot 'pure-legal-child'
  $legalProbe = Invoke-PurePathValidation $legalPurePath
  Add-Result 'ACCEPT_LEGAL_TRUSTED_CHILD' $(if ($legalProbe.Accepted) { 'PASS' } else { 'FAIL' }) 'pure validation accepted a strict descendant of trusted staging root'

  $selfCheck = Test-ExpectedRejection { throw 'ordinary runtime failure' } 'StagingPath is rejected|Existing StagingPath is rejected|ownership marker'
  $selfCheckPassed = $selfCheck.Rejected -and -not $selfCheck.ExpectedReason
  Add-Result 'REJECTION_ASSERTION_SELF_CHECK' $(if ($selfCheckPassed) { 'PASS' } else { 'FAIL' }) 'ordinary runtime exception is not accepted as a valid safety rejection'

  $unowned = Join-Path $fixtureRoot 'unowned'
  New-TestDirectory $unowned
  $unownedSentinel = Join-Path $unowned 'sentinel.txt'
  Write-TestFile $unownedSentinel 'unowned-sentinel'
  [void](Invoke-ChildStaging 'REJECT_EXISTING_NO_MARKER' $unowned $false 'no valid tool-ownership marker')
  Assert-Sentinel 'NO_MARKER_CONTENT_UNCHANGED' $unownedSentinel 'unowned-sentinel'

  $wrongMarker = Join-Path $fixtureRoot 'wrong-marker'
  New-TestDirectory $wrongMarker
  $wrongMarkerSentinel = Join-Path $wrongMarker 'sentinel.txt'
  Write-TestFile $wrongMarkerSentinel 'wrong-marker-sentinel'
  Write-TestFile (Join-Path $wrongMarker '.review-staging.marker.json') '{"marker_version":1,"marker_type":"review-staging","tool":"other-tool","package_id":"other-task"}'
  [void](Invoke-ChildStaging 'REJECT_WRONG_MARKER_IDENTITY' $wrongMarker $false 'ownership marker does not match')
  Assert-Sentinel 'WRONG_MARKER_CONTENT_UNCHANGED' $wrongMarkerSentinel 'wrong-marker-sentinel'

  $corruptMarker = Join-Path $fixtureRoot 'corrupt-marker'
  New-TestDirectory $corruptMarker
  $corruptSentinel = Join-Path $corruptMarker 'sentinel.txt'
  Write-TestFile $corruptSentinel 'corrupt-marker-sentinel'
  Write-TestFile (Join-Path $corruptMarker '.review-staging.marker.json') '{not-json'
  [void](Invoke-ChildStaging 'REJECT_CORRUPT_MARKER' $corruptMarker $false 'ownership marker is invalid')
  Assert-Sentinel 'CORRUPT_MARKER_CONTENT_UNCHANGED' $corruptSentinel 'corrupt-marker-sentinel'

  $valid = Join-Path $fixtureRoot 'owned-valid'
  [void](Invoke-ChildStaging 'CREATE_VALID_NEW_STAGING' $valid $true 'success')
  $validMarker = Join-Path $valid '.review-staging.marker.json'
  Add-Result 'VALID_MARKER_CREATED' $(if (Test-Path -LiteralPath $validMarker) { 'PASS' } else { 'FAIL' }) 'marker-exists'
  $markerText = Get-TestFileText $validMarker
  Add-Result 'OWNERSHIP_MARKER_NO_ABSOLUTE_PATHS' $(if ($markerText -notmatch '(?i)[A-Z]:[\\/]Users[\\/]') { 'PASS' } else { 'FAIL' }) 'path-fingerprints-only'
  $wrongPathMarker = Join-Path $fixtureRoot 'wrong-path-marker'
  New-TestDirectory $wrongPathMarker
  $wrongPathSentinel = Join-Path $wrongPathMarker 'sentinel.txt'
  Write-TestFile $wrongPathSentinel 'wrong-path-sentinel'
  $copiedMarker = Get-TestFileText $validMarker | ConvertFrom-Json
  $copiedMarker.staging_path_fingerprint = 'wrong-path'
  Write-TestFile (Join-Path $wrongPathMarker '.review-staging.marker.json') (($copiedMarker | ConvertTo-Json -Compress) + [Environment]::NewLine)
  [void](Invoke-ChildStaging 'REJECT_WRONG_MARKER_PATH' $wrongPathMarker $false 'ownership marker does not match')
  Assert-Sentinel 'WRONG_PATH_MARKER_CONTENT_UNCHANGED' $wrongPathSentinel 'wrong-path-sentinel'
  Write-TestFile (Join-Path $valid 'owned-sentinel.txt') 'owned-sentinel'
  [void](Invoke-ChildStaging 'RERUN_VALID_OWNED_STAGING' $valid $true 'success')
  Add-Result 'OWNED_RERUN_REPLACED_CONTENT' $(if ((Test-Path -LiteralPath $validMarker) -and -not (Test-Path -LiteralPath (Join-Path $valid 'owned-sentinel.txt'))) { 'PASS' } else { 'FAIL' }) 'marker-remains;old-owned-file-removed'

  $junctionCreated = $false
  try {
    New-TestDirectory $junctionTarget
    Write-TestFile (Join-Path $junctionTarget 'junction-sentinel.txt') 'junction-sentinel'
    New-Item -ItemType Junction -Path $junction -Target $junctionTarget -ErrorAction Stop | Out-Null
    $junctionCreated = $true
  } catch {
    Add-Result 'REPARSE_POINT_CREATION' 'SKIP' 'junction creation unavailable in this environment; no unsafe deletion attempted'
  }
  if ($junctionCreated) {
    $pureJunction = Invoke-PurePathValidation $junction
    $pureJunctionRejected = $pureJunction.Accepted -eq $false -and $pureJunction.ErrorMessage -match 'reparse point'
    Add-Result 'PURE_REPARSE_PATH_REJECTED' $(if ($pureJunctionRejected) { 'PASS' } else { 'FAIL' }) "expected-reason=reparse point;actual-error=$($pureJunction.ErrorMessage)"
    [void](Invoke-ChildStaging 'REJECT_JUNCTION_STAGING' $junction $false 'existing path component is a reparse point' -AllowReparseStaging)
    Assert-Sentinel 'JUNCTION_TARGET_CONTENT_UNCHANGED' (Join-Path $junctionTarget 'junction-sentinel.txt') 'junction-sentinel'
    Add-Result 'REPARSE_POINT_TEST' 'PASS' 'junction rejected before recursive delete'

    New-TestDirectory $internalReparseRoot
    New-Item -ItemType Junction -Path $internalReparseChild -Target $junctionTarget -ErrorAction Stop | Out-Null
    $pureDirectory = Invoke-PureDirectoryValidation $internalReparseRoot
    $pureDirectoryRejected = $pureDirectory.Accepted -eq $false -and $pureDirectory.ErrorMessage -match 'contains a reparse point'
    Add-Result 'PURE_INTERNAL_REPARSE_TREE_REJECTED' $(if ($pureDirectoryRejected) { 'PASS' } else { 'FAIL' }) "expected-reason=contains a reparse point;actual-error=$($pureDirectory.ErrorMessage)"
  }
  Add-Result 'SYMBOLIC_LINK_TEST' 'SKIP' 'not attempted; symbolic-link privilege/elevation was not requested for this non-destructive test run'
} catch {
  Add-Result 'TEST_HARNESS_UNEXPECTED_EXCEPTION' 'FAIL' $_.Exception.Message
} finally {
  Assert-Unchanged 'SOURCE_PROTECTED_FILE_UNCHANGED' $sourceProtectedFile $sourceBefore
  Assert-Unchanged 'DOCUMENT_CENTER_PROTECTED_FILE_UNCHANGED' $documentProtectedFile $documentBefore
  if ($fixtureCreated -and (Test-Path -LiteralPath $fixtureRoot)) {
    try {
      Assert-FixtureCleanupBoundary
      if (Test-Path -LiteralPath $junction -PathType Container) {
        $junctionItem = Get-Item -LiteralPath $junction -Force
        if (($junctionItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) { throw 'Cleanup refused to remove a non-reparse junction test path.' }
        if (-not (Test-TestSameOrDescendant $junction $fixtureRoot)) { throw 'Cleanup junction path escaped the fixture root.' }
        Assert-TestNoReparseChain (Split-Path -Parent $junction)
        [System.IO.Directory]::Delete($junction, $false)
      }
      if (Test-Path -LiteralPath $internalReparseChild) {
        $childItem = Get-Item -LiteralPath $internalReparseChild -Force
        if (($childItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -eq 0) { throw 'Cleanup refused a non-reparse internal link path.' }
        if (-not (Test-TestSameOrDescendant $internalReparseChild $fixtureRoot)) { throw 'Cleanup internal link path escaped the fixture root.' }
        Assert-TestNoReparseChain (Split-Path -Parent $internalReparseChild)
        [System.IO.Directory]::Delete($internalReparseChild, $false)
      }
      Assert-TestTreeNoReparse $fixtureRoot
      Remove-TestTreeSafely $fixtureRoot
      Add-Result 'FIXTURE_CLEANUP_BOUNDARY_VERIFIED' 'PASS' 'fixture exact path, trusted-root descendant, and reparse-free tree verified before delete'
    } catch {
      Add-Result 'FIXTURE_CLEANUP_BOUNDARY_VERIFIED' 'FAIL' (($_.Exception.ToString() -replace "`r?`n", ' | '))
    }
  }
  if ($documentProtectedFileCreatedForTest -and (Test-Path -LiteralPath $documentProtectedFile)) {
    Remove-Item -LiteralPath $documentProtectedFile -Force -ErrorAction SilentlyContinue
  }
}

Write-Output "RT01_SECURITY_TEST= $(if ($failCount -eq 0) { 'PASS' } else { 'FAIL' })"
Write-Output "PASS_COUNT=$passCount"
Write-Output "FAIL_COUNT=$failCount"
Write-Output "SKIP_COUNT=$skipCount"
Write-Output "PATH_AND_OWNERSHIP_ASSERTIONS=$($results.Count)"
foreach ($result in $results) { Write-Output ("$($result.Name)=$($result.Status);$($result.Detail)") }
if ($failCount -gt 0) {
  Write-Output ('FAILED_ASSERTIONS=' + ($failures -join ','))
  exit 1
}

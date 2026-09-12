$ErrorActionPreference = 'Stop'
$sourceScript = 'C:\Users\34707\Documents\ChatGPT\跨境电商\CrossBorder-Independent-Store\04_docs\scripts\92-prepare-review-staging.ps1'
$tokens = $null; $parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($sourceScript, [ref]$tokens, [ref]$parseErrors)
if ($parseErrors.Count) { throw 'Source parse failed' }
# Import function definitions only. Never invoke the packaging/deletion entry point.
$functions = $ast.FindAll({param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst]}, $false)
foreach ($function in $functions) { . ([scriptblock]::Create($function.Extent.Text)) }
$results = [System.Collections.Generic.List[object]]::new()
function Probe([string]$Name, [scriptblock]$Action, [string]$ExpectedError = '') {
  $message = ''; $passed = $false
  try { & $Action | Out-Null; $passed = -not $ExpectedError }
  catch { $message = $_.Exception.Message; $passed = $ExpectedError -and $message.Contains($ExpectedError) }
  $results.Add([pscustomobject]@{name=$Name;passed=[bool]$passed;error=$message})
}
$projectRootFull = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $sourceScript))
$documentCenterRoot = Split-Path -Parent $projectRootFull
$workspaceParent = Split-Path -Parent $documentCenterRoot
$trustedStagingRoot = Join-Path $workspaceParent '_review_stage'
Probe 'actual-source-pure' { Assert-SafeStagingPath $projectRootFull } 'canonical source project'
Probe 'actual-source-descendant-pure' { Assert-SafeStagingPath (Join-Path $projectRootFull 'not-a-stage') } 'canonical source project'
Probe 'actual-case-trailing-pure' { Assert-SafeStagingPath ($projectRootFull.ToUpperInvariant() + '\') } 'canonical source project'
Probe 'actual-doc-pure' { Assert-SafeStagingPath $documentCenterRoot } 'document center'
Probe 'actual-ancestor-pure' { Assert-SafeStagingPath $workspaceParent } 'outside the trusted staging root'
Probe 'actual-home-pure' { Assert-SafeStagingPath ([Environment]::GetFolderPath('UserProfile')) } 'outside the trusted staging root'
Probe 'actual-drive-pure' { Assert-SafeStagingPath ([IO.Path]::GetPathRoot($projectRootFull)) } 'outside the trusted staging root'
Probe 'actual-trusted-root-pure' { Assert-SafeStagingPath $trustedStagingRoot } 'trusted staging root itself'
Probe 'actual-prefix-pure' { Assert-SafeStagingPath ($trustedStagingRoot + '-sibling') } 'outside the trusted staging root'
Probe 'actual-traversal-pure' { Assert-SafeStagingPath (Join-Path $trustedStagingRoot '..\escape') } 'outside the trusted staging root'
# All filesystem changes below are retained under a unique review-owned fixture.
$fixture = Join-Path $PSScriptRoot ('fixture-' + [guid]::NewGuid().ToString('N'))
$documentCenterRoot = Join-Path $fixture 'document-center'
$projectRootFull = Join-Path $documentCenterRoot 'CrossBorder-Independent-Store'
$trustedStagingRoot = Join-Path $fixture '_review_stage'
$stagingMarkerName = '.review-staging.marker.json'
$PackageId = 'REVIEWER-RT01'
$owned = Join-Path $trustedStagingRoot 'owned'
$unowned = Join-Path $trustedStagingRoot 'unowned'
$outside = Join-Path $fixture 'outside'
foreach ($path in @($projectRootFull,$owned,$unowned,$outside)) { [IO.Directory]::CreateDirectory($path) | Out-Null }
Probe 'new-child-allowed' { Assert-SafeStagingPath (Join-Path $trustedStagingRoot 'new') }
Probe 'existing-no-marker' { Assert-ToolOwnedStaging $unowned } 'no valid tool-ownership marker'
Write-StagingOwnershipMarker $owned
Probe 'matching-marker' { Assert-ToolOwnedStaging $owned }
$PackageId = 'WRONG-TASK'
Probe 'wrong-task' { Assert-ToolOwnedStaging $owned } 'does not match this tool/task'
$PackageId = 'REVIEWER-RT01'
Copy-Item -LiteralPath (Join-Path $owned $stagingMarkerName) -Destination (Join-Path $unowned $stagingMarkerName)
Probe 'marker-copied-to-other-path' { Assert-ToolOwnedStaging $unowned } 'does not match this tool/task'
[IO.File]::WriteAllText((Join-Path $unowned $stagingMarkerName), '{bad-json')
Probe 'malformed-json' { Assert-ToolOwnedStaging $unowned } 'ownership marker is invalid'
$junction = Join-Path $trustedStagingRoot 'junction'
New-Item -ItemType Junction -Path $junction -Target $outside | Out-Null
Probe 'junction-root' { Assert-SafeStagingPath $junction } 'reparse point'
Probe 'junction-ancestor' { Assert-SafeStagingPath (Join-Path $junction 'child') } 'reparse point'
$nested = Join-Path $owned 'nested-link'
New-Item -ItemType Junction -Path $nested -Target $outside | Out-Null
Probe 'nested-junction-in-owned-tree' { Assert-ToolOwnedStaging $owned } 'contains a reparse point'
# Leave fixtures and junctions in the review folder; no recursive cleanup in this probe.
$results | ConvertTo-Json -Depth 4 | Write-Output
Write-Output ('SOURCE_SHA256=' + (Get-FileHash -LiteralPath $sourceScript -Algorithm SHA256).Hash)
Write-Output ('FIXTURE=' + $fixture)
Write-Output ('TOTAL=' + $results.Count + ';PASS=' + @($results | Where-Object passed).Count)
if (@($results | Where-Object { -not $_.passed }).Count) { exit 1 }

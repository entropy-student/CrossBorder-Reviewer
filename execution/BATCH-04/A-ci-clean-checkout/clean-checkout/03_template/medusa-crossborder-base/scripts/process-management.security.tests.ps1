[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$testRoot = Join-Path $env:TEMP ('cb-rt02-' + [Guid]::NewGuid().ToString('N'))
$shell = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $shell) { $shell = (Get-Command powershell -ErrorAction Stop).Source }
$results = New-Object System.Collections.Generic.List[object]
$failures = New-Object System.Collections.Generic.List[string]
$passCount = 0
$failCount = 0
$knownProcesses = New-Object System.Collections.Generic.List[int]
$knownSnapshots = @{}

function Add-Result([string]$Name, [ValidateSet('PASS', 'FAIL', 'SKIP')][string]$Status, [string]$Detail) {
  [void]$results.Add([pscustomobject]@{ Name = $Name; Status = $Status; Detail = $Detail })
  if ($Status -eq 'PASS') { $script:passCount++ }
  if ($Status -eq 'FAIL') { $script:failCount++; [void]$script:failures.Add($Name) }
}

function Start-HarmlessProcess([string]$WorkingDirectory = $script:TemplateRoot) {
  $process = Start-Process -FilePath $shell -ArgumentList @('-NoLogo', '-NoProfile', '-Command', 'Start-Sleep -Seconds 120') -WorkingDirectory $WorkingDirectory -PassThru -WindowStyle Hidden
  [void]$knownProcesses.Add([int]$process.Id)
  $deadline = (Get-Date).AddSeconds(5)
  do {
    $snapshot = Get-ManagedProcessSnapshot $process.Id
    if ($snapshot -and $snapshot.StartedAtUtc -and $snapshot.ExecutablePath -and $snapshot.CommandLine) { $knownSnapshots[[int]$process.Id] = $snapshot; return $process }
    Start-Sleep -Milliseconds 100
  } while ((Get-Date) -lt $deadline)
  throw "Harmless test process identity did not become readable: $($process.Id)"
}

function New-TestPidPath([string]$Name) {
  return Join-Path $testRoot ($Name + '.pid')
}

function Invoke-TestStop([string]$PidPath) {
  $output = @(& { Stop-ManagedProcess -PidPath $PidPath -ExpectedRole 'test' } *>&1 | ForEach-Object { $_.ToString() })
  return ($output -join [Environment]::NewLine)
}

function Test-ProcessAlive([int]$ProcessId) {
  return $null -ne (Get-ManagedProcessSnapshot $ProcessId)
}

function Assert-ProcessAlive([string]$Name, [int]$ProcessId) {
  Add-Result $Name $(if (Test-ProcessAlive $ProcessId) { 'PASS' } else { 'FAIL' }) "pid=$ProcessId"
}

function Assert-ProcessStopped([string]$Name, [int]$ProcessId) {
  Add-Result $Name $(if (-not (Test-ProcessAlive $ProcessId)) { 'PASS' } else { 'FAIL' }) "pid=$ProcessId"
}

function Rewrite-Record([string]$Path, [scriptblock]$Mutator) {
  $record = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json
  & $Mutator $record
  Set-Utf8NoBomFile $Path (($record | ConvertTo-Json -Depth 5) + [Environment]::NewLine)
}

$parentScript = Join-Path $testRoot 'spawn-child.ps1'
$childPidFile = Join-Path $testRoot 'child.pid'
$parentScriptContent = @"
`$child = Start-Process -FilePath '$(($shell -replace "'", "''"))' -ArgumentList @('-NoLogo', '-NoProfile', '-Command', 'Start-Sleep -Seconds 120') -WorkingDirectory '$(($script:TemplateRoot -replace "'", "''"))' -PassThru -WindowStyle Hidden
[System.IO.File]::WriteAllText('$(($childPidFile -replace "'", "''"))', [string]`$child.Id)
Start-Sleep -Seconds 120
"@

$parents = New-Object System.Collections.Generic.List[int]
$children = New-Object System.Collections.Generic.List[int]
$sentinel = $null

try {
  New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
  Set-Utf8NoBomFile $parentScript $parentScriptContent

  $owned = Start-HarmlessProcess
  $ownedPidPath = New-TestPidPath 'owned'
  Write-ManagedProcessRecord $ownedPidPath $owned.Id 'test' 'rt02-test' $script:TemplateRoot $script:TemplateRoot | Out-Null
  $stopOutput = Invoke-TestStop $ownedPidPath
  Add-Result 'CORRECT_OWNERSHIP_CAN_STOP' $(if ($stopOutput -match 'MANAGED_PROCESS_STOP=PASS' -and -not (Test-ProcessAlive $owned.Id) -and -not (Test-Path -LiteralPath $ownedPidPath)) { 'PASS' } else { 'FAIL' }) 'exact identity matched; root and descendants were terminated'

  $exited = Start-HarmlessProcess
  $exitedPidPath = New-TestPidPath 'exited'
  Write-ManagedProcessRecord $exitedPidPath $exited.Id 'test' 'rt02-test' $script:TemplateRoot $script:TemplateRoot | Out-Null
  Stop-Process -Id $exited.Id -Force
  Start-Sleep -Milliseconds 250
  $stopOutput = Invoke-TestStop $exitedPidPath
  Add-Result 'ALREADY_EXITED_IS_STALE' $(if ($stopOutput -match 'MANAGED_PROCESS_STOP=REFUSED_STALE' -and (Test-Path -LiteralPath $exitedPidPath)) { 'PASS' } else { 'FAIL' }) 'missing live PID is refused without termination'

  $identitySource = Start-HarmlessProcess
  $identityTarget = Start-HarmlessProcess
  $identityPidPath = New-TestPidPath 'pid-reuse'
  Write-ManagedProcessRecord $identityPidPath $identitySource.Id 'test' 'rt02-test' $script:TemplateRoot $script:TemplateRoot | Out-Null
  Rewrite-Record $identityPidPath { param($record) $record.process_id = $identityTarget.Id; $record.executable_path = Join-Path $env:SystemRoot 'System32\notepad.exe'; $record.started_at_utc = '2000-01-01T00:00:00.0000000Z' }
  $stopOutput = Invoke-TestStop $identityPidPath
  $identityTargetAlive = Test-ProcessAlive $identityTarget.Id
  Add-Result 'PID_REUSE_IDENTITY_MISMATCH_REFUSED' $(if ($stopOutput -match 'REFUSED_STALE' -and $identityTargetAlive) { 'PASS' } else { 'FAIL' }) "record PID was injected to another live process; target-alive=$identityTargetAlive;stop-output=$stopOutput"
  Stop-Process -Id $identitySource.Id -Force -ErrorAction SilentlyContinue
  Stop-Process -Id $identityTarget.Id -Force -ErrorAction SilentlyContinue

  $startupMismatch = Start-HarmlessProcess
  $startupPath = New-TestPidPath 'startup-mismatch'
  Write-ManagedProcessRecord $startupPath $startupMismatch.Id 'test' 'rt02-test' $script:TemplateRoot $script:TemplateRoot | Out-Null
  Rewrite-Record $startupPath { param($record) $record.started_at_utc = '2000-01-01T00:00:00.0000000Z' }
  $stopOutput = Invoke-TestStop $startupPath
  Add-Result 'STARTUP_TIME_MISMATCH_REFUSED' $(if ($stopOutput -match 'REFUSED_STALE' -and (Test-ProcessAlive $startupMismatch.Id)) { 'PASS' } else { 'FAIL' }) 'stale startup timestamp refused'

  $projectMismatch = Start-HarmlessProcess
  $projectPath = New-TestPidPath 'project-mismatch'
  Write-ManagedProcessRecord $projectPath $projectMismatch.Id 'test' 'rt02-test' $script:TemplateRoot $script:TemplateRoot | Out-Null
  Rewrite-Record $projectPath { param($record) $record.project_root = Join-Path $env:TEMP 'other-project' }
  $stopOutput = Invoke-TestStop $projectPath
  Add-Result 'PROJECT_IDENTITY_MISMATCH_REFUSED' $(if ($stopOutput -match 'REFUSED_STALE' -and (Test-ProcessAlive $projectMismatch.Id)) { 'PASS' } else { 'FAIL' }) 'record project identity did not match this template'

  $readFailure = Start-HarmlessProcess
  $readFailurePath = New-TestPidPath 'identity-read-failure'
  Set-Utf8NoBomFile $readFailurePath '{"schema_version":2,"process_id":' + $readFailure.Id + ',"role":"test"}'
  $stopOutput = Invoke-TestStop $readFailurePath
  Add-Result 'IDENTITY_READ_FAILURE_REFUSED' $(if ($stopOutput -match 'REFUSED_STALE' -and (Test-ProcessAlive $readFailure.Id)) { 'PASS' } else { 'FAIL' }) 'missing identity fields refused'

  $oldFormat = Start-HarmlessProcess
  $oldFormatPath = New-TestPidPath 'old-format'
  Set-Utf8NoBomFile $oldFormatPath ([string]$oldFormat.Id + [Environment]::NewLine)
  $stopOutput = Invoke-TestStop $oldFormatPath
  Add-Result 'OLD_PID_FORMAT_REFUSED' $(if ($stopOutput -match 'REFUSED_STALE' -and (Test-ProcessAlive $oldFormat.Id)) { 'PASS' } else { 'FAIL' }) 'legacy PID-only record refused'

  $sentinel = Start-HarmlessProcess
  $staleParent = Start-Process -FilePath $shell -ArgumentList @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $parentScript) -WorkingDirectory $script:TemplateRoot -PassThru -WindowStyle Hidden
  [void]$knownProcesses.Add([int]$staleParent.Id)
  [void]$parents.Add([int]$staleParent.Id)
  $deadline = (Get-Date).AddSeconds(5)
  do {
    if (Test-Path -LiteralPath $childPidFile) { break }
    Start-Sleep -Milliseconds 100
  } while ((Get-Date) -lt $deadline)
  if (-not (Test-Path -LiteralPath $childPidFile)) { throw 'Child fixture did not publish its PID.' }
  $staleChildId = [int](Get-Content -LiteralPath $childPidFile -Raw).Trim()
  [void]$children.Add($staleChildId)
  $staleTreePath = New-TestPidPath 'stale-tree'
  Write-ManagedProcessRecord $staleTreePath $staleParent.Id 'test' 'rt02-test' $script:TemplateRoot $script:TemplateRoot | Out-Null
  Rewrite-Record $staleTreePath { param($record) $record.command_line = 'different-project-command' }
  $stopOutput = Invoke-TestStop $staleTreePath
  Add-Result 'STALE_PARENT_DOES_NOT_KILL_CHILD' $(if ($stopOutput -match 'REFUSED_STALE' -and (Test-ProcessAlive $staleParent.Id) -and (Test-ProcessAlive $staleChildId)) { 'PASS' } else { 'FAIL' }) 'stale parent identity refused; child and external sentinel remain alive'
  Assert-ProcessAlive 'EXTERNAL_SENTINEL_SURVIVES' $sentinel.Id
} catch {
  Add-Result 'TEST_HARNESS_UNEXPECTED_EXCEPTION' 'FAIL' $_.Exception.Message
} finally {
  foreach ($processId in @($children + $parents + $knownProcesses | Sort-Object -Unique)) {
    $expected = $knownSnapshots[[int]$processId]
    $live = Get-ManagedProcessSnapshot ([int]$processId)
    if ($expected -and $live -and (Test-ManagedSnapshotEqual $expected $live)) { Stop-Process -Id ([int]$processId) -Force -ErrorAction SilentlyContinue }
  }
  if (Test-Path -LiteralPath $testRoot) { [System.IO.Directory]::Delete($testRoot, $true) }
}

Write-Output "RT02_PROCESS_SECURITY_TEST= $(if ($failCount -eq 0) { 'PASS' } else { 'FAIL' })"
Write-Output "PASS_COUNT=$passCount"
Write-Output "FAIL_COUNT=$failCount"
Write-Output "ASSERTION_COUNT=$($results.Count)"
foreach ($result in $results) { Write-Output ("$($result.Name)=$($result.Status);$($result.Detail)") }
if ($failCount -gt 0) { Write-Output ('FAILED_ASSERTIONS=' + ($failures -join ',')); exit 1 }

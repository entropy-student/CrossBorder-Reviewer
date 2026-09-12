[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '_common.ps1')

$testRoot = Join-Path $env:TEMP ('cb-rt03-' + [Guid]::NewGuid().ToString('N'))
$shell = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $shell) { $shell = (Get-Command powershell -ErrorAction Stop).Source }
$port = 48100 + (Get-Random -Minimum 0 -Maximum 500)
$healthUri = "http://127.0.0.1:$port/health"
$pidPath = Join-Path $testRoot 'service.pid'
$stubPath = Join-Path $testRoot 'http-stub.ps1'
$results = New-Object System.Collections.Generic.List[object]
$failures = New-Object System.Collections.Generic.List[string]
$passCount = 0
$failCount = 0
$serviceProcesses = New-Object System.Collections.Generic.List[int]
$serviceSnapshots = @{}

function Add-Result([string]$Name, [ValidateSet('PASS', 'FAIL', 'SKIP')][string]$Status, [string]$Detail) {
  [void]$results.Add([pscustomobject]@{ Name = $Name; Status = $Status; Detail = $Detail })
  if ($Status -eq 'PASS') { $script:passCount++ }
  if ($Status -eq 'FAIL') { $script:failCount++; [void]$script:failures.Add($Name) }
}

function Write-Stub([int]$StatusCode) {
  $content = @"
`$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Parse('127.0.0.1'), $port)
`$listener.Start()
while (`$true) {
  `$client = `$listener.AcceptTcpClient()
  `$stream = `$client.GetStream()
  `$buffer = New-Object byte[] 1024
  [void]`$stream.Read(`$buffer, 0, `$buffer.Length)
  `$body = [System.Text.Encoding]::UTF8.GetBytes('rt03-stub')
  `$header = [System.Text.Encoding]::ASCII.GetBytes("HTTP/1.1 $StatusCode OK`r`nContent-Length: `$(`$body.Length)`r`nConnection: close`r`n`r`n")
  `$stream.Write(`$header, 0, `$header.Length)
  `$stream.Write(`$body, 0, `$body.Length)
  `$stream.Close()
  `$client.Close()
}
"@
  Set-Utf8NoBomFile $stubPath $content
}

function Start-Stub([int]$StatusCode) {
  Write-Stub $StatusCode
  $process = Start-Process -FilePath $shell -ArgumentList @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $stubPath) -WorkingDirectory $script:TemplateRoot -PassThru -WindowStyle Hidden
  [void]$serviceProcesses.Add([int]$process.Id)
  $deadline = (Get-Date).AddSeconds(8)
  do {
    Start-Sleep -Milliseconds 150
    $listeners = @(Get-ListeningProcessIds $port)
    if ($listeners -contains [int]$process.Id) { $serviceSnapshots[[int]$process.Id] = Get-ManagedProcessSnapshot $process.Id; return $process }
  } while ((Get-Date) -lt $deadline)
  $snapshot = Get-ManagedProcessSnapshot $process.Id
  throw "HTTP stub did not listen on the exclusive test port: $port;pid=$($process.Id);alive=$([bool]$snapshot);command=$($snapshot.CommandLine)"
}

function Start-LauncherStub([int]$StatusCode) {
  Write-Stub $StatusCode
  $launcherPath = Join-Path $testRoot 'http-launcher.ps1'
  $childPidPath = Join-Path $testRoot 'http-child.pid'
  $content = @"
`$child = Start-Process -FilePath '$($shell.Replace("'", "''"))' -ArgumentList @('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File','$($stubPath.Replace("'", "''"))') -WorkingDirectory '$($script:TemplateRoot.Replace("'", "''"))' -PassThru -WindowStyle Hidden
[IO.File]::WriteAllText('$($childPidPath.Replace("'", "''"))',[string]`$child.Id)
while (`$true) { Start-Sleep -Seconds 1 }
"@
  Set-Utf8NoBomFile $launcherPath $content
  $process = Start-Process -FilePath $shell -ArgumentList @('-NoLogo','-NoProfile','-ExecutionPolicy','Bypass','-File',$launcherPath) -WorkingDirectory $script:TemplateRoot -PassThru -WindowStyle Hidden
  [void]$serviceProcesses.Add([int]$process.Id)
  $deadline = (Get-Date).AddSeconds(8)
  do {
    Start-Sleep -Milliseconds 150
    $listeners = @(Get-ListeningProcessIds $port)
    if ($listeners.Count -gt 0 -and (Get-ManagedProcessSnapshot $process.Id)) { $serviceSnapshots[[int]$process.Id] = Get-ManagedProcessSnapshot $process.Id; return $process }
  } while ((Get-Date) -lt $deadline)
  throw "HTTP child launcher did not start the exclusive test port: $port"
}

function Stop-TestProcess([int]$ProcessId) {
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
  Start-Sleep -Milliseconds 250
}

function Rewrite-Record([scriptblock]$Mutator) {
  $record = Get-Content -LiteralPath $pidPath -Raw | ConvertFrom-Json
  & $Mutator $record
  Set-Utf8NoBomFile $pidPath (($record | ConvertTo-Json -Depth 5) + [Environment]::NewLine)
}

try {
  New-Item -ItemType Directory -Path $testRoot -Force | Out-Null

  $sourceStartText = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'start-local.ps1') -Raw
  $buildText = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'build-production.ps1') -Raw
  Add-Result 'START_BUILD_USE_IDENTITY_DECISION' $(if ($sourceStartText.Contains('Get-ManagedServiceReuseDecision') -and $buildText.Contains('Get-ManagedServiceReuseDecision') -and -not $sourceStartText.Contains('$alreadyReady') -and -not $buildText.Contains('$backendReady')) { 'PASS' } else { 'FAIL' }) 'HTTP 200 reuse path is guarded by managed identity in both callers'

  $healthy = Start-LauncherStub 200
  Write-ManagedProcessRecord $pidPath $healthy.Id 'test-service' 'rt03-test' $script:TemplateRoot $script:TemplateRoot | Out-Null
  $decision = Get-ManagedServiceReuseDecision $pidPath 'test-service' $script:TemplateRoot $port $healthUri
  Add-Result 'CORRECT_INSTANCE_REUSE' $(if ($decision.Status -eq 'REUSE') { 'PASS' } else { 'FAIL' }) "status=$($decision.Status);reason=$($decision.Reason);launcher_to_listener_chain=verified"

  Rewrite-Record { param($record) $record.project_root = Join-Path $env:TEMP 'unrelated-project' }
  $decision = Get-ManagedServiceReuseDecision $pidPath 'test-service' $script:TemplateRoot $port $healthUri
  Add-Result 'WRONG_PROJECT_200_NOT_REUSED' $(if ($decision.Status -eq 'IDENTITY_CONFLICT' -and (Get-ManagedProcessSnapshot $healthy.Id)) { 'PASS' } else { 'FAIL' }) "status=$($decision.Status);stub-alive=$([bool](Get-ManagedProcessSnapshot $healthy.Id))"

  Remove-Item -LiteralPath $pidPath -Force
  $decision = Get-ManagedServiceReuseDecision $pidPath 'test-service' $script:TemplateRoot $port $healthUri
  Add-Result 'UNKNOWN_IDENTITY_200_NOT_REUSED' $(if ($decision.Status -eq 'IDENTITY_UNKNOWN' -and (Get-ManagedProcessSnapshot $healthy.Id)) { 'PASS' } else { 'FAIL' }) "status=$($decision.Status);stub-alive=$([bool](Get-ManagedProcessSnapshot $healthy.Id))"

  Write-ManagedProcessRecord $pidPath $healthy.Id 'test-service' 'rt03-test' $script:TemplateRoot $script:TemplateRoot | Out-Null
  $stopHealthy = Stop-ManagedProcess -PidPath $pidPath -ExpectedRole 'test-service'
  if ($stopHealthy.Status -ne 'STOPPED') { throw "Controlled launcher cleanup failed: $($stopHealthy.Reason)" }
  $decision = Get-ManagedServiceReuseDecision $pidPath 'test-service' $script:TemplateRoot $port $healthUri
  Add-Result 'UNLISTENING_PORT_START_ALLOWED' $(if ($decision.Status -eq 'START_ALLOWED') { 'PASS' } else { 'FAIL' }) "status=$($decision.Status);reason=$($decision.Reason)"

  $notReady = Start-Stub 503
  Write-ManagedProcessRecord $pidPath $notReady.Id 'test-service' 'rt03-test' $script:TemplateRoot $script:TemplateRoot | Out-Null
  $decision = Get-ManagedServiceReuseDecision $pidPath 'test-service' $script:TemplateRoot $port $healthUri
  Add-Result 'IDENTITY_MATCH_NOT_READY_DISTINCT' $(if ($decision.Status -eq 'SERVICE_NOT_READY') { 'PASS' } else { 'FAIL' }) "status=$($decision.Status);reason=$($decision.Reason)"
  Add-Result 'CONTROLLED_SERVICE_NOT_STOPPED' $(if (Get-ManagedProcessSnapshot $notReady.Id) { 'PASS' } else { 'FAIL' }) 'identity probe does not stop a controlled service'
} catch {
  Add-Result 'TEST_HARNESS_UNEXPECTED_EXCEPTION' 'FAIL' $_.Exception.Message
} finally {
  foreach ($processId in @($serviceProcesses)) {
    $expected = $serviceSnapshots[[int]$processId]
    $live = Get-ManagedProcessSnapshot ([int]$processId)
    if ($expected -and $live -and (Test-ManagedSnapshotEqual $expected $live)) { Stop-Process -Id ([int]$processId) -Force -ErrorAction SilentlyContinue }
  }
  if (Test-Path -LiteralPath $testRoot) { [System.IO.Directory]::Delete($testRoot, $true) }
}

Write-Output "RT03_SERVICE_IDENTITY_TEST= $(if ($failCount -eq 0) { 'PASS' } else { 'FAIL' })"
Write-Output "PASS_COUNT=$passCount"
Write-Output "FAIL_COUNT=$failCount"
Write-Output "ASSERTION_COUNT=$($results.Count)"
foreach ($result in $results) { Write-Output ("$($result.Name)=$($result.Status);$($result.Detail)") }
if ($failCount -gt 0) { Write-Output ('FAILED_ASSERTIONS=' + ($failures -join ',')); exit 1 }

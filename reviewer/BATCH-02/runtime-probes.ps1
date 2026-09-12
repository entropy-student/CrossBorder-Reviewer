param([string]$SourceRoot)
$ErrorActionPreference='Stop'
$source=Join-Path $SourceRoot '03_template/medusa-crossborder-base/scripts/_common.ps1'
$tokens=$null;$errors=$null
$ast=[Management.Automation.Language.Parser]::ParseFile($source,[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Parse failed'}
foreach($f in $ast.FindAll({param($n) $n -is [Management.Automation.Language.FunctionDefinitionAst]},$false)){. ([scriptblock]::Create($f.Extent.Text))}
$script:TemplateRoot=$PSScriptRoot
$script:BackendRoot=Join-Path $PSScriptRoot 'backend'
$script:StorefrontRoot=Join-Path $PSScriptRoot 'storefront'
$now=[datetime]::UtcNow
$root=[pscustomobject]@{ProcessId=101;ParentProcessId=1;StartedAtUtc=$now;ExecutablePath='test.exe';CommandLine='test'}
$child=[pscustomobject]@{ProcessId=102;ParentProcessId=101;StartedAtUtc=$now.AddMinutes(-5);ExecutablePath='old-orphan.exe';CommandLine='old-orphan'}
$record=[pscustomobject]@{schema_version=2;process_id=101;started_at_utc=$now.ToString('o');executable_path='test.exe';command_line='test';project_root=$PSScriptRoot;working_directory=$PSScriptRoot;role='test'}
$recordPath=Join-Path $PSScriptRoot 'synthetic-record.json'
$record | ConvertTo-Json | Set-Content -LiteralPath $recordPath
# Entire process/termination layer is replaced by in-memory fixtures. Never stop any OS process.
$script:killed=[Collections.Generic.List[int]]::new()
function Get-ManagedProcessSnapshot([int]$ProcessId){if($script:killed.Contains($ProcessId)){return $null};if($ProcessId -eq 101){return $root};if($ProcessId -eq 102){return $child};return $null}
function Get-CimInstance { if($script:killed.Count){return @()}; @($root,$child) | ForEach-Object {[pscustomobject]@{ProcessId=$_.ProcessId;ParentProcessId=$_.ParentProcessId;CreationDate=$_.StartedAtUtc;ExecutablePath=$_.ExecutablePath;CommandLine=$_.CommandLine}} }
function Stop-Process([int]$Id,[switch]$Force,[object]$ErrorAction){$script:killed.Add($Id)}
function Start-Sleep {}
Stop-ManagedProcess $recordPath 'test'
'ORPHAN_OLDER_THAN_VERIFIED_ROOT_WOULD_BE_KILLED='+$script:killed.Contains(102)
$script:killed.Clear()
$record.command_line='wrong-command'
$record | ConvertTo-Json | Set-Content -LiteralPath $recordPath
$continued=$false
$stopResult=Stop-ManagedProcess $recordPath 'test'
$continued=$stopResult.Status -in @('STOPPED','NOT_RUNNING')
'CALLER_CONTINUES_AFTER_STOP_REFUSAL='+$continued
$record.command_line='test'
$record | ConvertTo-Json | Set-Content -LiteralPath $recordPath
function Get-ListeningProcessIds([int]$Port){return @(102)}
function Test-LocalHttp200([string]$Uri){return $true}
$child.StartedAtUtc=$now.AddSeconds(2)
$decision=Get-ManagedServiceReuseDecision $recordPath 'test' $PSScriptRoot 12345 'http://127.0.0.1:12345/'
'VALID_ROOT_WITH_LISTENING_CHILD_DECISION='+$decision.Status
'REASON='+$decision.Reason
'PROCESS_OPERATIONS=SIMULATED_ONLY'
'COMMON_SHA256='+(Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash
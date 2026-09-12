$ErrorActionPreference = "Stop"

$script:TemplateRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$script:BackendRoot = Join-Path $script:TemplateRoot "apps/backend"
$script:StorefrontRoot = Join-Path $script:TemplateRoot "apps/storefront"
$script:RuntimeRoot = Join-Path $script:TemplateRoot ".runtime"
$script:RuntimeConfigPath = Join-Path $script:RuntimeRoot "local-config.json"
$script:ComposeFile = Join-Path $script:TemplateRoot "docker-compose.local.yml"
$script:Corepack = (Get-Command corepack -ErrorAction Stop).Source

function Set-Utf8NoBomFile([string]$Path, [string]$Content) {
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Set-DotEnvValue([string]$Content, [string]$Name, [string]$Value) {
  $line = "$Name=$Value"
  $escaped = [regex]::Escape($Name)
  if ($Content -match "(?m)^$escaped=.*$") {
    return [regex]::Replace($Content, "(?m)^$escaped=.*$", $line)
  }
  return ($Content.TrimEnd() + [Environment]::NewLine + $line + [Environment]::NewLine)
}

function Get-DotEnvValue([string]$Content, [string]$Name) {
  $escaped = [regex]::Escape($Name)
  $match = [regex]::Match($Content, "(?m)^$escaped=(?<value>.*)$")
  if (-not $match.Success) { return "" }
  return $match.Groups["value"].Value.Trim().Trim('"').Trim("'")
}

function Read-KeyValueFile([string]$Path) {
  $result = @{}
  if (-not (Test-Path -LiteralPath $Path)) { return $result }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$') {
      $result[$Matches.key] = $Matches.value
    }
  }
  return $result
}

function Write-KeyValueFile([string]$Path, [hashtable]$Values) {
  $lines = foreach ($key in $Values.Keys) { "$key=$($Values[$key])" }
  Set-Utf8NoBomFile $Path (($lines -join [Environment]::NewLine) + [Environment]::NewLine)
}

function Get-RequiredPnpmVersion {
  $package = Get-Content -LiteralPath (Join-Path $script:TemplateRoot "package.json") -Raw | ConvertFrom-Json
  if (-not $package.packageManager -or $package.packageManager -notmatch '^pnpm@(.+)$') {
    throw "Template package.json must declare an exact pnpm packageManager value."
  }
  return $Matches[1]
}

function Assert-ExactPnpm {
  $required = Get-RequiredPnpmVersion
  $actual = (& $script:Corepack ("pnpm@" + $required) --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $actual -ne $required) {
    throw "Exact project pnpm mismatch. Required $required, got $actual."
  }
  Write-Host "PNPM_EXECUTABLE=$script:Corepack"
  Write-Host "PNPM_VERSION=$actual"
  return $required
}

function Assert-TemplateProjectName([string]$ProjectName) {
  if (-not $ProjectName -or $ProjectName -notmatch '^[a-z][a-z0-9_-]{2,62}$') {
    throw "ProjectName must be a lowercase Docker Compose project name (3-63 characters)."
  }
  $blocked = @(
    "crossborder-medusa",
    "crossborder-medusa-repeat",
    "crossborder-medusa-repeat-2",
    "medusa-template-validation"
  )
  if ($blocked -contains $ProjectName.ToLowerInvariant()) {
    throw "ProjectName is reserved for an existing historical or prior validation environment: $ProjectName"
  }
}

function New-TemplateProjectName {
  $leaf = Split-Path -Leaf $script:TemplateRoot
  $safeLeaf = [regex]::Replace($leaf.ToLowerInvariant(), '[^a-z0-9]+', '-').Trim('-')
  if (-not $safeLeaf) { $safeLeaf = 'template' }
  $base = "medusa-$safeLeaf"
  $suffix = ([guid]::NewGuid().ToString('N')).Substring(0, 8)
  $maxBaseLength = 63 - 1 - $suffix.Length
  if ($base.Length -gt $maxBaseLength) { $base = $base.Substring(0, $maxBaseLength).Trim('-') }
  return "$base-$suffix"
}

function Assert-TemplatePorts([int]$DatabasePort, [int]$BackendPort, [int]$StorefrontPort) {
  foreach ($entry in @(@("DatabasePort", $DatabasePort), @("BackendPort", $BackendPort), @("StorefrontPort", $StorefrontPort))) {
    if ($entry[1] -lt 1024 -or $entry[1] -gt 65535) { throw "$($entry[0]) must be between 1024 and 65535." }
  }
  if (@($DatabasePort, $BackendPort, $StorefrontPort) | Group-Object | Where-Object Count -gt 1) {
    throw "DatabasePort, BackendPort, and StorefrontPort must be distinct."
  }
}

function Read-TemplateRuntimeConfig {
  if (-not (Test-Path -LiteralPath $script:RuntimeConfigPath)) { return $null }
  try {
    return (Get-Content -LiteralPath $script:RuntimeConfigPath -Raw | ConvertFrom-Json)
  } catch {
    throw "Template runtime config is not valid JSON: $script:RuntimeConfigPath"
  }
}

function Write-TemplateRuntimeConfig($Settings) {
  $payload = [ordered]@{
    ProjectName = $Settings.ProjectName
    DatabasePort = $Settings.DatabasePort
    BackendPort = $Settings.BackendPort
    StorefrontPort = $Settings.StorefrontPort
  }
  Set-Utf8NoBomFile $script:RuntimeConfigPath (($payload | ConvertTo-Json) + [Environment]::NewLine)
}

function Resolve-TemplateSettings {
  param(
    [Nullable[int]]$DatabasePort,
    [Nullable[int]]$BackendPort,
    [Nullable[int]]$StorefrontPort,
    [string]$ProjectName,
    [switch]$AllowFreshIdentity,
    [switch]$RequireSavedConfig
  )
  $saved = Read-TemplateRuntimeConfig
  if ($RequireSavedConfig -and -not $saved) {
    throw "RUN_SETUP_LOCAL_FIRST: .runtime/local-config.json is missing. Run setup-local.ps1 before this command."
  }
  if (-not $saved -and -not $ProjectName -and -not $AllowFreshIdentity) {
    throw "RUN_SETUP_LOCAL_FIRST: .runtime/local-config.json is missing. Run setup-local.ps1 before this command."
  }
  $resolved = [ordered]@{
    DatabasePort = if ($null -ne $DatabasePort) { [int]$DatabasePort } elseif ($saved -and $null -ne $saved.DatabasePort) { [int]$saved.DatabasePort } else { 54332 }
    BackendPort = if ($null -ne $BackendPort) { [int]$BackendPort } elseif ($saved -and $null -ne $saved.BackendPort) { [int]$saved.BackendPort } else { 9500 }
    StorefrontPort = if ($null -ne $StorefrontPort) { [int]$StorefrontPort } elseif ($saved -and $null -ne $saved.StorefrontPort) { [int]$saved.StorefrontPort } else { 8500 }
    ProjectName = if ($ProjectName) { $ProjectName } elseif ($saved -and $saved.ProjectName) { [string]$saved.ProjectName } else { New-TemplateProjectName }
  }
  if ($saved) {
    foreach ($name in @("DatabasePort", "BackendPort", "StorefrontPort", "ProjectName")) {
      $explicit = switch ($name) {
        "DatabasePort" { $null -ne $DatabasePort }
        "BackendPort" { $null -ne $BackendPort }
        "StorefrontPort" { $null -ne $StorefrontPort }
        "ProjectName" { [bool]$ProjectName }
      }
      if ($explicit -and ([string]$resolved[$name] -ne [string]$saved.$name)) {
        throw "Explicit $name does not match the saved template runtime config. Use a fresh template copy for a new environment."
      }
    }
  }
  Assert-TemplateProjectName $resolved.ProjectName
  Assert-TemplatePorts $resolved.DatabasePort $resolved.BackendPort $resolved.StorefrontPort
  return [pscustomobject]$resolved
}

function Set-TemplateComposeEnvironment($Settings) {
  Set-Item -Path "Env:MEDUSA_PROJECT_NAME" -Value ([string]$Settings.ProjectName)
  Set-Item -Path "Env:MEDUSA_DB_PORT" -Value ([string]$Settings.DatabasePort)
}

function Invoke-TemplatePnpm([string]$WorkingDirectory, [string[]]$PnpmArgs) {
  Push-Location $WorkingDirectory
  try {
    $required = Get-RequiredPnpmVersion
    & $script:Corepack ("pnpm@" + $required) @PnpmArgs
    if ($LASTEXITCODE -ne 0) { throw ("pnpm command failed with exit code " + $LASTEXITCODE + ": pnpm " + ($PnpmArgs -join ' ')) }
  } finally {
    Pop-Location
  }
}

function Set-ProcessEnvironment([hashtable]$Values) {
  foreach ($key in $Values.Keys) { Set-Item -Path "Env:$key" -Value ([string]$Values[$key]) }
}

function Get-ManagedIdentityPath([string]$Path) {
  if ([string]::IsNullOrWhiteSpace($Path)) { return "" }
  $full = [System.IO.Path]::GetFullPath($Path)
  $root = [System.IO.Path]::GetPathRoot($full)
  if ($full.Length -gt $root.Length) { $full = $full.TrimEnd([char[]]"/\") }
  return $full
}

function ConvertTo-ManagedProcessSnapshot($CimProcess) {
  if (-not $CimProcess) { return $null }
  $startedAtUtc = $null
  if ($CimProcess.CreationDate) {
    try {
      if ($CimProcess.CreationDate -is [datetime]) { $startedAtUtc = $CimProcess.CreationDate.ToUniversalTime() }
      else { $startedAtUtc = ([System.Management.ManagementDateTimeConverter]::ToDateTime([string]$CimProcess.CreationDate)).ToUniversalTime() }
    } catch {}
  }
  return [pscustomobject]@{
    ProcessId = [int]$CimProcess.ProcessId
    ParentProcessId = [int]$CimProcess.ParentProcessId
    StartedAtUtc = $startedAtUtc
    ExecutablePath = [string]$CimProcess.ExecutablePath
    CommandLine = [string]$CimProcess.CommandLine
  }
}

function Get-ManagedProcessSnapshot([int]$ProcessId) {
  if ($ProcessId -le 0) { return $null }
  $cim = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $ProcessId) -ErrorAction SilentlyContinue
  return ConvertTo-ManagedProcessSnapshot $cim
}

function Test-ManagedSnapshotEqual($Expected, $Actual) {
  if (-not $Expected -or -not $Actual) { return $false }
  if ([int]$Expected.ProcessId -ne [int]$Actual.ProcessId) { return $false }
  if ([int]$Expected.ParentProcessId -ne [int]$Actual.ParentProcessId) { return $false }
  if ([string]$Expected.ExecutablePath -cne [string]$Actual.ExecutablePath) { return $false }
  if ([string]$Expected.CommandLine -cne [string]$Actual.CommandLine) { return $false }
  if ($null -eq $Expected.StartedAtUtc -or $null -eq $Actual.StartedAtUtc) { return $false }
  return $Expected.StartedAtUtc.ToUniversalTime().Ticks -eq $Actual.StartedAtUtc.ToUniversalTime().Ticks
}

function Write-ManagedProcessRecord([string]$Path, [int]$ProcessId, [string]$Role, [string]$ProjectName, [string]$ProjectRoot, [string]$WorkingDirectory) {
  $deadline = (Get-Date).AddSeconds(5)
  $snapshot = $null
  do {
    $snapshot = Get-ManagedProcessSnapshot $ProcessId
    if ($snapshot -and $snapshot.StartedAtUtc -and $snapshot.ExecutablePath -and $snapshot.CommandLine) { break }
    Start-Sleep -Milliseconds 100
  } while ((Get-Date) -lt $deadline)
  if (-not $snapshot -or -not $snapshot.StartedAtUtc -or [string]::IsNullOrWhiteSpace($snapshot.ExecutablePath) -or [string]::IsNullOrWhiteSpace($snapshot.CommandLine)) {
    throw "Managed process identity could not be read for PID $ProcessId. Refusing to write a stoppable record."
  }
  $record = [ordered]@{
    schema_version = 2
    process_id = $snapshot.ProcessId
    started_at_utc = $snapshot.StartedAtUtc.ToString("o")
    executable_path = $snapshot.ExecutablePath
    command_line = $snapshot.CommandLine
    project_name = $ProjectName
    project_root = Get-ManagedIdentityPath $ProjectRoot
    working_directory = Get-ManagedIdentityPath $WorkingDirectory
    role = $Role
  }
  Set-Utf8NoBomFile $Path (($record | ConvertTo-Json -Depth 5) + [Environment]::NewLine)
  return [pscustomobject]$record
}

function Read-ManagedProcessRecord([string]$Path) {
  if (-not (Test-Path -LiteralPath $Path)) { throw "Managed process record is missing." }
  $record = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8) | ConvertFrom-Json
  foreach ($name in @("schema_version", "process_id", "started_at_utc", "executable_path", "command_line", "project_root", "working_directory", "role")) {
    if ($null -eq $record.$name -or [string]::IsNullOrWhiteSpace([string]$record.$name)) { throw "Managed process record is missing identity field: $name" }
  }
  if ([int]$record.schema_version -ne 2 -or [int]$record.process_id -le 0) { throw "Managed process record format is stale or invalid." }
  return $record
}

function Test-ManagedProcessIdentity($Record, $Live, [string]$ExpectedRole, [string]$ExpectedWorkingDirectory) {
  if (-not $Record -or -not $Live) { return [pscustomobject]@{ Matched = $false; Reason = "process is not running or identity could not be read" } }
  if ([int]$Record.process_id -ne [int]$Live.ProcessId) { return [pscustomobject]@{ Matched = $false; Reason = "PID does not match the managed record" } }
  if ($ExpectedRole -and [string]$Record.role -cne $ExpectedRole) { return [pscustomobject]@{ Matched = $false; Reason = "managed role does not match" } }
  if ($ExpectedWorkingDirectory -and (Get-ManagedIdentityPath $Record.working_directory) -cne (Get-ManagedIdentityPath $ExpectedWorkingDirectory)) { return [pscustomobject]@{ Matched = $false; Reason = "working directory identity does not match" } }
  if ((Get-ManagedIdentityPath $Record.project_root) -cne (Get-ManagedIdentityPath $script:TemplateRoot)) { return [pscustomobject]@{ Matched = $false; Reason = "project identity does not match this template" } }
  if ([string]$Record.executable_path -cne [string]$Live.ExecutablePath) { return [pscustomobject]@{ Matched = $false; Reason = "executable path does not match" } }
  if ([string]$Record.command_line -cne [string]$Live.CommandLine) { return [pscustomobject]@{ Matched = $false; Reason = "command identity does not match" } }
  try {
    $recordStartedAt = if ($Record.started_at_utc -is [datetime]) { ([datetime]$Record.started_at_utc).ToUniversalTime() } else { ([datetime]::Parse([string]$Record.started_at_utc)).ToUniversalTime() }
    if ($null -eq $Live.StartedAtUtc -or $recordStartedAt.Ticks -ne $Live.StartedAtUtc.ToUniversalTime().Ticks) { return [pscustomobject]@{ Matched = $false; Reason = "startup time does not match" } }
  } catch { return [pscustomobject]@{ Matched = $false; Reason = "startup time identity could not be read" } }
  return [pscustomobject]@{ Matched = $true; Reason = "PID, startup time, executable, project and command identity match" }
}

function Test-ManagedProcessEdge($Parent, $Child) {
  if (-not $Parent -or -not $Child) { return $false }
  if ([int]$Child.ParentProcessId -ne [int]$Parent.ProcessId) { return $false }
  if ($null -eq $Parent.StartedAtUtc -or $null -eq $Child.StartedAtUtc) { return $false }
  if ($Child.StartedAtUtc.ToUniversalTime().Ticks -lt $Parent.StartedAtUtc.ToUniversalTime().Ticks) { return $false }
  if ([string]::IsNullOrWhiteSpace([string]$Child.ExecutablePath) -or [string]::IsNullOrWhiteSpace([string]$Child.CommandLine)) { return $false }
  return $true
}

function Get-ManagedProcessTree([int]$RootProcessId, $RootSnapshot = $null) {
  $root = if ($RootSnapshot) { $RootSnapshot } else { Get-ManagedProcessSnapshot $RootProcessId }
  if (-not $root -or [int]$root.ProcessId -ne $RootProcessId) { return @() }
  $processes = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object { ConvertTo-ManagedProcessSnapshot $_ })
  $childrenByParent = @{}
  foreach ($process in $processes) {
    if (-not $childrenByParent.ContainsKey([int]$process.ParentProcessId)) { $childrenByParent[[int]$process.ParentProcessId] = New-Object System.Collections.ArrayList }
    [void]$childrenByParent[[int]$process.ParentProcessId].Add($process)
  }
  $result = New-Object System.Collections.ArrayList
  $visited = New-Object 'System.Collections.Generic.HashSet[int]'
  [void]$visited.Add($RootProcessId)
  function Add-ManagedDescendants($Parent, [int]$Depth) {
    $parentId = [int]$Parent.ProcessId
    if (-not $childrenByParent.ContainsKey($parentId)) { return }
    foreach ($child in @($childrenByParent[$ParentId])) {
      if ($visited.Contains([int]$child.ProcessId)) { continue }
      if (-not (Test-ManagedProcessEdge $Parent $child)) { continue }
      [void]$visited.Add([int]$child.ProcessId)
      [void]$result.Add([pscustomobject]@{ Snapshot = $child; Depth = $Depth })
      Add-ManagedDescendants $child ($Depth + 1)
    }
  }
  Add-ManagedDescendants $root 1
  return @($result.ToArray())
}

function Get-ListeningProcessIds([int]$Port) {
  try {
    return @((Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop | Select-Object -ExpandProperty OwningProcess | ForEach-Object { [int]$_ }) | Sort-Object -Unique)
  } catch {
    $lines = @(netstat.exe -ano -p tcp 2>$null)
    $ids = New-Object System.Collections.Generic.List[int]
    foreach ($line in $lines) {
      if ($line -match "^\s*TCP\s+[^\s]+:$Port\s+[^\s]+\s+LISTENING\s+(\d+)\s*$") { [void]$ids.Add([int]$Matches[1]) }
    }
    return @($ids | Sort-Object -Unique)
  }
}

function Test-LocalHttp200([string]$Uri) {
  try {
    $code = (& curl.exe --noproxy "*" -sS -o NUL -w "%{http_code}" $Uri 2>$null).Trim()
    return $LASTEXITCODE -eq 0 -and $code -eq "200"
  } catch { return $false }
}

function Get-ManagedServiceReuseDecision([string]$PidPath, [string]$Role, [string]$WorkingDirectory, [int]$Port, [string]$HealthUri) {
  try { $listeners = @(Get-ListeningProcessIds $Port) } catch { return [pscustomobject]@{ Status = "INSPECTION_UNAVAILABLE"; Reason = "listening-process inspection failed"; ProcessId = 0 } }
  if ($listeners.Count -eq 0) { return [pscustomobject]@{ Status = "START_ALLOWED"; Reason = "port is not listening"; ProcessId = 0 } }
  try { $record = Read-ManagedProcessRecord $PidPath } catch { return [pscustomobject]@{ Status = "IDENTITY_UNKNOWN"; Reason = "port is listening but the managed identity record is missing or invalid"; ProcessId = $listeners[0] } }
  $live = Get-ManagedProcessSnapshot ([int]$record.process_id)
  $identity = Test-ManagedProcessIdentity $record $live $Role $WorkingDirectory
  if (-not $identity.Matched) { return [pscustomobject]@{ Status = "IDENTITY_CONFLICT"; Reason = $identity.Reason; ProcessId = [int]$record.process_id } }
  $tree = @(Get-ManagedProcessTree ([int]$record.process_id) $live)
  $trustedProcessIds = @([int]$record.process_id) + @($tree | ForEach-Object { [int]$_.Snapshot.ProcessId })
  $untrustedListeners = @($listeners | Where-Object { $trustedProcessIds -notcontains [int]$_ })
  $trustedListeners = @($listeners | Where-Object { $trustedProcessIds -contains [int]$_ })
  if ($untrustedListeners.Count -gt 0 -or $trustedListeners.Count -eq 0) {
    return [pscustomobject]@{ Status = "IDENTITY_CONFLICT"; Reason = "port listener PID is outside the verified managed process chain"; ProcessId = [int]$record.process_id }
  }
  if (-not (Test-LocalHttp200 $HealthUri)) { return [pscustomobject]@{ Status = "SERVICE_NOT_READY"; Reason = "verified managed process owns the port but health did not return HTTP 200"; ProcessId = [int]$record.process_id } }
  return [pscustomobject]@{ Status = "REUSE"; Reason = "verified managed process owns the port and health returned HTTP 200"; ProcessId = [int]$record.process_id }
}

function Invoke-LocalHttp {
  param(
    [Parameter(Mandatory=$true)][ValidateSet("GET","POST")][string]$Method,
    [Parameter(Mandatory=$true)][string]$Uri,
    [hashtable]$Headers = @{},
    [object]$Body = $null
  )
  Add-Type -AssemblyName System.Net.Http -ErrorAction SilentlyContinue
  $handler = New-Object System.Net.Http.HttpClientHandler
  $handler.UseProxy = $false
  $client = New-Object System.Net.Http.HttpClient($handler)
  try {
    $request = New-Object System.Net.Http.HttpRequestMessage([System.Net.Http.HttpMethod]::$Method, $Uri)
    foreach ($key in $Headers.Keys) { [void]$request.Headers.TryAddWithoutValidation($key, [string]$Headers[$key]) }
    if ($null -ne $Body) {
      $json = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 10 -Compress }
      $request.Content = New-Object System.Net.Http.StringContent($json, [System.Text.Encoding]::UTF8, "application/json")
    }
    $response = $client.SendAsync($request).GetAwaiter().GetResult()
    $text = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $response.IsSuccessStatusCode) {
      throw ("HTTP " + [int]$response.StatusCode + " from " + $Uri + ": " + $text)
    }
    $jsonResult = $null
    try { $jsonResult = $text | ConvertFrom-Json } catch {}
    return [pscustomobject]@{ StatusCode = [int]$response.StatusCode; Text = $text; Json = $jsonResult }
  } finally {
    $client.Dispose()
    $handler.Dispose()
  }
}

function Wait-LocalHttp([string]$Uri, [int]$TimeoutSeconds = 90) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  do {
    try {
      $code = (& curl.exe --noproxy "*" -sS -o NUL -w "%{http_code}" $Uri 2>$null).Trim()
      if ($LASTEXITCODE -eq 0 -and $code -eq "200") { return (Invoke-LocalHttp -Method GET -Uri $Uri) }
    } catch {}
    Start-Sleep -Seconds 2
  } while ((Get-Date) -lt $deadline)
  throw "Local HTTP endpoint did not become ready: $Uri"
}

function Stop-ManagedProcess([string]$PidPath, [string]$ExpectedRole = "") {
  if (-not (Test-Path -LiteralPath $PidPath)) { return [pscustomobject]@{ Status = "NOT_RUNNING"; Reason = "managed process record is absent" } }
  $role = if ($ExpectedRole) { $ExpectedRole } elseif ((Split-Path -Leaf $PidPath) -ieq "backend.pid") { "backend" } elseif ((Split-Path -Leaf $PidPath) -ieq "storefront.pid") { "storefront" } else { "" }
  try {
    $record = Read-ManagedProcessRecord $PidPath
    if (-not $role) { throw "managed role is unknown" }
    $expectedWorkingDirectory = if ($role -eq "backend") { Join-Path $script:BackendRoot ".medusa/server" } elseif ($role -eq "storefront") { $script:StorefrontRoot } else { $script:TemplateRoot }
    $live = Get-ManagedProcessSnapshot ([int]$record.process_id)
    $identity = Test-ManagedProcessIdentity $record $live $role $expectedWorkingDirectory
    if (-not $identity.Matched) { throw $identity.Reason }

    $freshRoot = Get-ManagedProcessSnapshot ([int]$record.process_id)
    $freshIdentity = Test-ManagedProcessIdentity $record $freshRoot $role $expectedWorkingDirectory
    if (-not $freshIdentity.Matched) { throw "managed root identity changed before termination: $($freshIdentity.Reason)" }
    $tree = @(Get-ManagedProcessTree ([int]$record.process_id) $freshRoot)
    foreach ($entry in $tree) {
      $freshChild = Get-ManagedProcessSnapshot ([int]$entry.Snapshot.ProcessId)
      if ($freshChild -and -not (Test-ManagedSnapshotEqual $entry.Snapshot $freshChild)) { throw "managed child identity changed before termination: PID $($entry.Snapshot.ProcessId)" }
    }

    foreach ($entry in @($tree | Sort-Object Depth -Descending)) {
      $freshChild = Get-ManagedProcessSnapshot ([int]$entry.Snapshot.ProcessId)
      if ($freshChild) {
        if (-not (Test-ManagedSnapshotEqual $entry.Snapshot $freshChild)) { throw "managed child identity changed immediately before termination: PID $($entry.Snapshot.ProcessId)" }
        Stop-Process -Id ([int]$entry.Snapshot.ProcessId) -Force -ErrorAction Stop
      }
    }
    $freshRootBeforeKill = Get-ManagedProcessSnapshot ([int]$record.process_id)
    if ($freshRootBeforeKill) {
      $rootIdentityBeforeKill = Test-ManagedProcessIdentity $record $freshRootBeforeKill $role $expectedWorkingDirectory
      if (-not $rootIdentityBeforeKill.Matched) { throw "managed root identity changed immediately before termination: $($rootIdentityBeforeKill.Reason)" }
      Stop-Process -Id ([int]$record.process_id) -Force -ErrorAction Stop
    }
    Start-Sleep -Milliseconds 500
    $remainingIds = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
      $_.ProcessId -eq [int]$record.process_id -or @($tree.Snapshot.ProcessId) -contains [int]$_.ProcessId
    } | Select-Object -ExpandProperty ProcessId)
    if ($remainingIds.Count -gt 0) { throw ("Managed process tree did not exit: " + ($remainingIds -join ",")) }
    Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
    Write-Host "MANAGED_PROCESS_STOP=PASS"
    return [pscustomobject]@{ Status = "STOPPED"; Reason = "verified managed process tree terminated" }
  } catch {
    Write-Host "MANAGED_PROCESS_STOP=REFUSED_STALE"
    Write-Host ("MANAGED_PROCESS_REASON=" + $_.Exception.Message)
    return [pscustomobject]@{ Status = "REFUSED"; Reason = $_.Exception.Message }
  }
}

function Move-GeneratedTree([string]$Path, [string]$Label) {
  if (-not (Test-Path -LiteralPath $Path)) { return }
  $archive = Join-Path $script:RuntimeRoot ("build-archive/" + (Get-Date -Format "yyyyMMdd-HHmmssfff") + "-" + $Label)
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $archive) | Out-Null
  try {
    [System.IO.Directory]::Move($Path, $archive)
    Write-Host "MOVED_OLD_GENERATED_TREE=$Label"
  } catch {
    $moveError = $_.Exception.Message
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
    } catch {
      throw "Could not archive or remove generated tree '$Path'. Archive error: $moveError. Cleanup error: $($_.Exception.Message)"
    }
    if (Test-Path -LiteralPath $Path) { throw "Generated tree remained after cleanup: $Path" }
    Write-Host "REMOVED_OLD_GENERATED_TREE=$Label"
  }
}

function Get-ComposeVolumeName([string]$ProjectName) {
  return ($ProjectName + "_pgdata")
}

function Assert-FreshTemplateVolume {
  param(
    [Parameter(Mandatory=$true)][string]$ProjectName,
    [switch]$AllowReuse
  )
  Assert-TemplateProjectName $ProjectName
  $volume = Get-ComposeVolumeName $ProjectName
  $forbidden = @(
    "crossborder-medusa_medusa_pgdata",
    "crossborder-medusa-repeat_pgdata",
    "crossborder-medusa-repeat-2_pgdata",
    "medusa-template-validation_pgdata"
  )
  if ($forbidden -contains $volume) { throw "Template validation volume resolves to a historical/repeat volume: $volume" }
  $existing = ""
  $inspectExitCode = 1
  try {
    $existing = (& docker volume inspect $volume 2>$null | Out-String).Trim()
    $inspectExitCode = $LASTEXITCODE
  } catch { $existing = "" }
  if ($inspectExitCode -eq 0 -and $existing) {
    if (-not $AllowReuse) {
      throw "FRESH_TEMPLATE_COPY_VOLUME_COLLISION: volume already exists before first setup: $volume. Use a fresh copy or pass an explicit unique -ProjectName."
    }
    $metadata = $existing | ConvertFrom-Json
    $label = $metadata[0].Labels.'com.docker.compose.project'
    if (-not $label) { throw "Refusing to reuse an unlabeled template volume: $volume" }
    if ($label -and $label -ne $ProjectName) { throw "Refusing a volume owned by another Compose project: $volume ($label)" }
    Write-Host "TEMPLATE_VALIDATION_VOLUME_REUSED=$volume"
  } else {
    Write-Host "TEMPLATE_VALIDATION_VOLUME_NEW=$volume"
  }
  return $volume
}

[CmdletBinding()]
param(
  [string]$EvidencePath
)

$ErrorActionPreference = "Stop"
$templateRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendRoot = Join-Path $templateRoot "apps\backend"
$storefrontRoot = Join-Path $templateRoot "apps\storefront"
$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("rt04-gate-tests-" + [guid]::NewGuid().ToString("N"))
$failureLog = [System.Collections.Generic.List[string]]::new()
$testFixture = Join-Path $backendRoot ("src\__tests__\rt04-injected-failure-" + [guid]::NewGuid().ToString("N") + ".unit.spec.ts")
$typeFixture = Join-Path $storefrontRoot ("src\__rt04_injected_type_error-" + [guid]::NewGuid().ToString("N") + ".ts")

function Add-FailureEvidence([string]$Command, [object[]]$Output, [int]$ExitCode) {
  $failureLog.Add("COMMAND=$Command")
  foreach ($line in $Output) { $failureLog.Add([string]$line) }
  $failureLog.Add("EXIT_CODE=$ExitCode")
}

function Invoke-CapturedPnpm([string]$WorkingDirectory, [string]$CommandLine, [string]$OutputStem) {
  $stdoutPath = Join-Path $tempRoot ($OutputStem + ".stdout.log")
  $stderrPath = Join-Path $tempRoot ($OutputStem + ".stderr.log")
  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = "cmd.exe"
  $startInfo.Arguments = "/d /c " + $CommandLine
  $startInfo.WorkingDirectory = $WorkingDirectory
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  [IO.File]::WriteAllText($stdoutPath, $stdout)
  [IO.File]::WriteAllText($stderrPath, $stderr)
  return [pscustomobject]@{
    Output = @($stdout -split "`r?`n") + @($stderr -split "`r?`n")
    ExitCode = $process.ExitCode
  }
}

New-Item -ItemType Directory -Force -Path $tempRoot, (Split-Path -Parent $testFixture) | Out-Null
try {
  [IO.File]::WriteAllText(
    $testFixture,
    'describe("RT04 injected failure", () => { test("must fail unified test gate", () => { throw new Error("intentional RT04 gate probe") }) })'
  )

  Push-Location $backendRoot
  try {
    $testRun = Invoke-CapturedPnpm $backendRoot ("corepack pnpm@10.11.1 run test:unit -- --runTestsByPath `"" + $testFixture + "`"") "rt04-test"
    $testOutput = $testRun.Output
    $testExitCode = $testRun.ExitCode
  } finally {
    Pop-Location
  }
  Add-FailureEvidence "corepack pnpm@10.11.1 run test:unit -- --runTestsByPath <temporary-failing-test>" $testOutput $testExitCode
  if ($testExitCode -eq 0) { throw "Unified test gate accepted an intentional failing test." }

  [IO.File]::WriteAllText(
    $typeFixture,
    "const rt04InjectedTypeError: string = 1`nexport default rt04InjectedTypeError`n"
  )
  Push-Location $templateRoot
  try {
    $typeRun = Invoke-CapturedPnpm $templateRoot "corepack pnpm@10.11.1 run typecheck" "rt04-typecheck"
    $typeOutput = $typeRun.Output
    $typeExitCode = $typeRun.ExitCode
  } finally {
    Pop-Location
  }
  Add-FailureEvidence "corepack pnpm@10.11.1 run typecheck (with temporary source type error)" $typeOutput $typeExitCode
  if ($typeExitCode -eq 0) { throw "Unified typecheck gate accepted an intentional type error." }

  if ($EvidencePath) {
    $failureLog | Set-Content -LiteralPath $EvidencePath -Encoding utf8
  }
  Write-Host "RT04_FAILURE_INJECTION_TEST= PASS"
  Write-Host "TEST_GATE_REJECTED_INJECTED_FAILURE=PASS"
  Write-Host "TYPECHECK_GATE_REJECTED_INJECTED_ERROR=PASS"
  Write-Host "PERMANENT_FAILURE_FIXTURE=NO"
} finally {
  if (Test-Path -LiteralPath $typeFixture) { Remove-Item -LiteralPath $typeFixture -Force }
  if (Test-Path -LiteralPath $testFixture) { Remove-Item -LiteralPath $testFixture -Force }
  if (Test-Path -LiteralPath $tempRoot) { Remove-Item -LiteralPath $tempRoot -Recurse -Force }
}

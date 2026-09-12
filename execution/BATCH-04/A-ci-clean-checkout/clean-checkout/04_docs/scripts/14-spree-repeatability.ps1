[CmdletBinding()]
param(
  [string]$ComposeFile = "02_demos/spree-repeat/docker-compose.repeat.yml",
  [string]$ProjectName = "spree-demo-repeat",
  [switch]$RunSampleData
)

$ErrorActionPreference = "Stop"
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}
$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$ComposePath = Join-Path $Root $ComposeFile
if (-not (Test-Path -LiteralPath $ComposePath -PathType Leaf)) { throw "Missing repeat compose: $ComposePath" }
if ($ProjectName -notmatch "repeat") { throw "Refusing a non-repeat Docker project: $ProjectName" }

function Invoke-RepeatCompose {
  param([string[]]$Arguments)
  $command = 'docker compose -p "{0}" -f "{1}" {2} 2>&1' -f $ProjectName, $ComposePath, ($Arguments -join ' ')
  & cmd.exe /d /c $command
  if ($LASTEXITCODE -ne 0) { throw "Repeat compose command failed with exit code $LASTEXITCODE" }
}

Invoke-RepeatCompose @("up", "-d", "postgres")
$postgresId = (docker compose -p $ProjectName -f $ComposePath ps -q postgres).Trim()
if (-not $postgresId) { throw "Repeat PostgreSQL container was not created." }
$healthy = $false
for ($i = 0; $i -lt 60; $i++) {
  $health = (docker inspect --format '{{.State.Health.Status}}' $postgresId 2>$null).Trim()
  if ($health -eq "healthy") { $healthy = $true; break }
  Start-Sleep -Seconds 2
}
if (-not $healthy) { throw "Repeat PostgreSQL did not become healthy." }
Write-Host "SPREE_REPEAT_POSTGRES_HEALTH=healthy"

Invoke-RepeatCompose @("run", "--rm", "-T", "web", "bin/rails", "db:prepare")
Invoke-RepeatCompose @("run", "--rm", "-T", "--user", "root", "web", "chown", "-R", "rails:rails", "/rails/storage")
if ($RunSampleData) {
  Invoke-RepeatCompose @("run", "--rm", "-T", "web", "bin/rails", "spree:load_sample_data")
  Write-Host "SPREE_REPEAT_SAMPLE_DATA=PASS"
}

$checkRunner = "m=Spree::PaymentMethod.find_by(type:'Spree::PaymentMethod::Check'); abort('check missing') unless m; m.update!(display_on:'both'); puts({products:Spree::Product.count,variants:Spree::Variant.count,check_display_on:m.display_on}.to_json)"
$checkCommand = 'docker compose -p "{0}" -f "{1}" run --rm -T web bin/rails runner "{2}" 2>&1' -f $ProjectName, $ComposePath, $checkRunner
$checkOutput = & cmd.exe /d /c $checkCommand
if ($LASTEXITCODE -ne 0) { throw "Repeat Check payment setup failed." }
$checkOutput | Select-Object -Last 1 | ForEach-Object { Write-Host $_ }
Invoke-RepeatCompose @("up", "-d", "web")
Write-Host "SPREE_REPEAT_PREPARATION=PASS"

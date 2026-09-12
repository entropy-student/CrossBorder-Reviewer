[CmdletBinding()]
param(
  [int]$BackendPort = 9300,
  [int]$DatabasePort = 54330,
  [string]$LogDirectory = ".runtime/medusa-repeat"
)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path (Join-Path $PSScriptRoot "../..")).Path
$Backend = Join-Path $Root "02_demos/medusa-dtc/apps/backend"
$Server = Join-Path $Backend ".medusa/server"
$Cli = Join-Path $Backend "node_modules/@medusajs/cli/cli.js"
$Logs = Join-Path $Root $LogDirectory

if (-not (Test-Path -LiteralPath (Join-Path $Server "package.json"))) { throw "Medusa production artifact is missing: $Server" }
if (-not (Test-Path -LiteralPath $Cli)) { throw "Medusa CLI is missing: $Cli" }
New-Item -ItemType Directory -Force -Path $Logs | Out-Null

$env:NODE_ENV = "production"
$env:PORT = "$BackendPort"
$env:DATABASE_URL = "postgres://medusa:medusa_local_dev@127.0.0.1:$DatabasePort/medusa_dtc"
$env:JWT_SECRET = "repeat-medusa-jwt-$([guid]::NewGuid().ToString('N'))"
$env:COOKIE_SECRET = "repeat-medusa-cookie-$([guid]::NewGuid().ToString('N'))"
$env:STORE_CORS = "http://localhost:8003"
$env:ADMIN_CORS = "http://localhost:$BackendPort"
$env:AUTH_CORS = "http://localhost:$BackendPort,http://localhost:8003"
$env:REDIS_URL = ""

$stdout = Join-Path $Logs "backend.out.log"
$stderr = Join-Path $Logs "backend.err.log"
$started = Get-Date
$process = Start-Process -FilePath "node.exe" -ArgumentList @($Cli, "start", "--port", "$BackendPort") -WorkingDirectory $Server -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
Write-Host "MEDUSA_REPEAT_BACKEND_PID=$($process.Id)"
$deadline = (Get-Date).AddSeconds(90)
$ready = $false
do {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $ready = $client.ConnectAsync("127.0.0.1", $BackendPort).Wait(2000)
  } catch {
    $ready = $false
  } finally {
    $client.Dispose()
  }
  if ($ready) {
    try {
      $health = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$BackendPort/health" -TimeoutSec 5
      $ready = $health.StatusCode -eq 200
    } catch {
      $ready = $false
    }
  }
  if ($ready) { break }
  Start-Sleep -Seconds 3
} while ((Get-Date) -lt $deadline)
$coldStart = ((Get-Date) - $started).TotalSeconds
Write-Host ("MEDUSA_REPEAT_BACKEND_COLD_START_SECONDS={0:N1}" -f $coldStart)
Write-Host "MEDUSA_REPEAT_BACKEND_READY=$ready"
if (-not $ready) {
  Get-Content -LiteralPath $stdout -Tail 100 -ErrorAction SilentlyContinue
  Get-Content -LiteralPath $stderr -Tail 100 -ErrorAction SilentlyContinue
  throw "Medusa repeat production backend did not become healthy."
}

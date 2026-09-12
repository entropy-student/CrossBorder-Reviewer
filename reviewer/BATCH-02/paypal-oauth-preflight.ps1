$ErrorActionPreference='Stop'
$raw=[IO.File]::ReadAllText('C:\Users\34707\Desktop\PayPal信息.txt')
$idLines=@($raw -split '\r?\n' | Where-Object {$_ -match '(?i)client[ _-]?id'})
$secretLines=@($raw -split '\r?\n' | Where-Object {$_ -match '(?i)secret'})
$ids=@($idLines|ForEach-Object {[regex]::Matches($_,'(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{40,}(?![A-Za-z0-9_-])')}|ForEach-Object {$_.Value})
$secrets=@($secretLines|ForEach-Object {[regex]::Matches($_,'(?<![A-Za-z0-9_-])[A-Za-z0-9_-]{40,}(?![A-Za-z0-9_-])')}|ForEach-Object {$_.Value})
$result=[ordered]@{utc=[datetime]::UtcNow.ToString('o');environment='sandbox';client_id_unambiguous=($ids.Count -eq 1);client_secret_unambiguous=($secrets.Count -eq 1);webhook_required_for_oauth=$false;oauth_attempted=$false;http_status=$null;authenticated=$false;expires_in=$null;real_money_operations=$false;credentials_logged=$false}
if($ids.Count -eq 1 -and $secrets.Count -eq 1){
  $handler=[Net.Http.HttpClientHandler]::new();$handler.AllowAutoRedirect=$false
  $client=[Net.Http.HttpClient]::new($handler);$client.Timeout=[timespan]::FromSeconds(20)
  try {
    $request=[Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post,'https://api-m.sandbox.paypal.com/v1/oauth2/token')
    $basic=[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($ids[0]+':'+$secrets[0]))
    $request.Headers.Authorization=[Net.Http.Headers.AuthenticationHeaderValue]::new('Basic',$basic)
    $request.Content=[Net.Http.StringContent]::new('grant_type=client_credentials',[Text.Encoding]::UTF8,'application/x-www-form-urlencoded')
    $result.oauth_attempted=$true
    $response=$client.SendAsync($request).GetAwaiter().GetResult()
    $result.http_status=[int]$response.StatusCode
    if($response.IsSuccessStatusCode){
      $payload=$response.Content.ReadAsStringAsync().GetAwaiter().GetResult()|ConvertFrom-Json
      $result.authenticated= -not [string]::IsNullOrWhiteSpace([string]$payload.access_token)
      $result.expires_in=$payload.expires_in
    }
  }catch{$result.failure_category='REQUEST_FAILED_DETAILS_WITHHELD'}
  finally{$payload=$null;$basic=$null;$raw=$null;$ids=$null;$secrets=$null;$request.Dispose();$client.Dispose();$handler.Dispose()}
}
$result|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $PSScriptRoot 'paypal-oauth-sanitized.json') -Encoding utf8
$result|ConvertTo-Json
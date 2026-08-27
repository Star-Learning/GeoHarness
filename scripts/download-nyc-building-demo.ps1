$ErrorActionPreference = 'Stop'

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$temporaryRoot = [System.IO.Path]::GetFullPath((Join-Path $repositoryRoot '.tmp'))
$rawPath = [System.IO.Path]::GetFullPath((Join-Path $temporaryRoot 'nyc-building-source.geojson'))

if (-not $rawPath.StartsWith($temporaryRoot + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing temporary path outside repository .tmp: $rawPath"
}

$uri = (& node (Join-Path $PSScriptRoot 'download-nyc-building-demo.mjs') --print-url).Trim()
if (-not $uri.StartsWith('https://data.cityofnewyork.us/resource/5zhs-2jue.geojson?', [System.StringComparison]::Ordinal)) {
  throw "Unexpected NYC Open Data URL: $uri"
}

New-Item -ItemType Directory -Force -Path $temporaryRoot | Out-Null
try {
  Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $rawPath -TimeoutSec 60
  & node (Join-Path $PSScriptRoot 'download-nyc-building-demo.mjs') --input $rawPath
  if ($LASTEXITCODE -ne 0) {
    throw "GeoJSON normalization failed with exit code $LASTEXITCODE"
  }
}
finally {
  if (Test-Path -LiteralPath $rawPath) {
    Remove-Item -LiteralPath $rawPath -Force
  }
}

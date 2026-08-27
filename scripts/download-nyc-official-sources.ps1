$ErrorActionPreference = 'Stop'

$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot 'data\official-sources\nyc'))
if (-not $outputRoot.StartsWith($repositoryRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing official data output outside repository: $outputRoot"
}

$downloads = @(
  @{
    Name = 'building.geojson'
    Uri = 'https://data.cityofnewyork.us/resource/5zhs-2jue.geojson?%24select=the_geom%2Cbin%2Cdoitt_id%2Cconstruction_year%2Cfeature_code%2Cgeom_source%2Cground_elevation%2Cheight_roof%2Clast_edited_date%2Cobjectid%2Cbase_bbl%2Cname%2Cshape_area&%24where=within_box(the_geom%2C40.72%2C-74.015%2C40.705%2C-73.99)&%24order=objectid%20ASC&%24limit=5000'
    Expected = 2622
  },
  @{
    Name = 'centerline.geojson'
    Uri = 'https://data.cityofnewyork.us/resource/inkn-q76z.geojson?%24select=the_geom%2Cphysicalid%2Cobjectid%2Cstreet_name%2Cfull_street_name%2Crw_type%2Csegment_type%2Cposted_speed%2Cnumber_total_lanes%2Cnumber_travel_lanes%2Cstatus%2Cmodified_date&%24where=within_box(the_geom%2C40.72%2C-74.015%2C40.705%2C-73.99)%20and%20number_total_lanes%20%3E%3D%204&%24order=objectid%20ASC&%24limit=5000'
    Expected = 293
  },
  @{
    Name = 'hydrography.geojson'
    Uri = 'https://data.cityofnewyork.us/resource/pjs3-c3z5.geojson?%24select=the_geom%2Cname%2Csource_id%2Cfeat_code%2Csub_code%2Cstatus%2Cshape_leng%2Cshape_area&%24where=within_box(the_geom%2C40.74%2C-74.02%2C40.70%2C-73.97)&%24order=source_id%20ASC&%24limit=5000'
    Expected = 6
  },
  @{
    Name = 'community-districts.geojson'
    Uri = 'https://data.cityofnewyork.us/resource/5crt-au7u.geojson?%24select=the_geom%2Cboro_cd%2Cshape_leng%2Cshape_area&%24where=boro_cd%20between%20101%20and%20103&%24order=boro_cd%20ASC&%24limit=100'
    Expected = 3
  },
  @{
    Name = 'community-districts-water.geojson'
    Uri = 'https://data.cityofnewyork.us/resource/6ak9-vek3.geojson?%24select=the_geom%2Cboro_cd%2Cshape_leng%2Cshape_area&%24where=boro_cd%20between%20101%20and%20103&%24order=boro_cd%20ASC&%24limit=100'
    Expected = 3
  }
)

New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
foreach ($item in $downloads) {
  $destination = Join-Path $outputRoot $item.Name
  Invoke-WebRequest -UseBasicParsing -Uri $item.Uri -OutFile $destination -TimeoutSec 120
  $collection = Get-Content -Raw -Encoding UTF8 -LiteralPath $destination | ConvertFrom-Json -Depth 100
  if ($collection.type -ne 'FeatureCollection' -or $collection.features.Count -ne $item.Expected) {
    throw "$($item.Name): expected $($item.Expected) official features, received $($collection.features.Count)"
  }
  Write-Output "$($item.Name): $($collection.features.Count) features"
}

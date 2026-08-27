import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputPath = resolve(
  repositoryRoot,
  'examples',
  'scenarios',
  '07-official-nyc-building-inspection',
  'data',
  'buildings.geojson',
)

const DATASET_ID = '5zhs-2jue'
const DATASET_URL = `https://data.cityofnewyork.us/d/${DATASET_ID}`
const TERMS_URL = 'https://opendata.cityofnewyork.us/overview/#termsofuse'
const SNAPSHOT_DATE = '2026-08-27'
const SOURCE_UPDATED_AT = '2026-08-23T13:15:06Z'
const BOUNDS = {
  north: 40.7110,
  west: -74.0130,
  south: 40.7060,
  east: -74.0070,
}
const fields = [
  'the_geom',
  'bin',
  'doitt_id',
  'construction_year',
  'feature_code',
  'geom_source',
  'ground_elevation',
  'height_roof',
  'last_edited_date',
  'objectid',
]
const where = `within_box(the_geom,${BOUNDS.north},${BOUNDS.west},${BOUNDS.south},${BOUNDS.east})`
const search = new URLSearchParams({
  '$select': fields.join(','),
  '$where': where,
  '$order': 'objectid ASC',
  '$limit': '500',
})
const API_URL = `https://data.cityofnewyork.us/resource/${DATASET_ID}.geojson?${search}`

function numberOrNull(value) {
  if (value === undefined || value === null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function integerOrNull(value) {
  const parsed = numberOrNull(value)
  return parsed === null ? null : Math.trunc(parsed)
}

function normalizeFeature(feature) {
  if (feature?.type !== 'Feature' || feature.geometry?.type !== 'MultiPolygon') {
    throw new Error('NYC Open Data response contains a non-MultiPolygon building feature')
  }
  const source = feature.properties ?? {}
  const objectId = integerOrNull(source.objectid)
  if (objectId === null) throw new Error('NYC Open Data building is missing OBJECTID')
  return {
    type: 'Feature',
    id: `nyc-building-${objectId}`,
    properties: {
      object_id: objectId,
      bin: source.bin ?? null,
      doitt_id: integerOrNull(source.doitt_id),
      construction_year: integerOrNull(source.construction_year),
      feature_code: integerOrNull(source.feature_code),
      geometry_source: source.geom_source ?? null,
      ground_elevation_ft: numberOrNull(source.ground_elevation),
      height_roof_ft: numberOrNull(source.height_roof),
      last_edited_date: source.last_edited_date ?? null,
    },
    geometry: feature.geometry,
  }
}

async function main() {
  const inputIndex = process.argv.indexOf('--input')
  let source
  if (inputIndex >= 0) {
    const inputPath = process.argv[inputIndex + 1]
    if (inputPath === undefined) throw new Error('--input requires a GeoJSON path')
    source = JSON.parse(await readFile(resolve(inputPath), 'utf8'))
  } else {
    const response = await fetch(API_URL, {
      headers: {
        accept: 'application/geo+json,application/json;q=0.9',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36 GeoHarness/1.0',
      },
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) throw new Error(`NYC Open Data request failed: HTTP ${response.status}`)
    source = await response.json()
  }
  if (source?.type !== 'FeatureCollection' || !Array.isArray(source.features)) {
    throw new Error('NYC Open Data did not return a GeoJSON FeatureCollection')
  }
  const features = source.features.map(normalizeFeature)
  if (features.length !== 133) {
    throw new Error(`Expected the audited 133-building snapshot, received ${features.length}`)
  }
  const ids = new Set(features.map(feature => feature.id))
  if (ids.size !== features.length) throw new Error('NYC Open Data response contains duplicate OBJECTID values')

  const collection = {
    type: 'FeatureCollection',
    name: 'buildings',
    crs: {
      type: 'name',
      properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
    },
    metadata: {
      fixture: false,
      official_data: true,
      source: 'NYC Open Data — BUILDING',
      publisher: 'NYC Office of Technology and Innovation (OTI)',
      dataset_id: DATASET_ID,
      dataset_url: DATASET_URL,
      api_query_url: API_URL,
      source_updated_at: SOURCE_UPDATED_AT,
      snapshot_date: SNAPSHOT_DATE,
      spatial_filter: BOUNDS,
      coordinate_reference_system: 'OGC:CRS84',
      terms: 'NYC Open Data Terms of Use',
      terms_url: TERMS_URL,
      processing: 'Fixed within_box query; selected official fields; numeric strings normalized; geometry unchanged.',
    },
    features,
  }

  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(collection, null, 2)}\n`, 'utf8')
  process.stdout.write(`${outputPath}\n${features.length} official NYC building footprints\n`)
}

if (process.argv.includes('--print-url')) {
  process.stdout.write(`${API_URL}\n`)
} else {
  await main()
}

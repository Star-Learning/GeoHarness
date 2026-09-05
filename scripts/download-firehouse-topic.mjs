import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputRoot = resolve(repositoryRoot, 'examples', 'topics', '02-firehouse-coverage', 'data')
const datasetId = 'hc8x-tcnd'
const sourceUrl = `https://data.cityofnewyork.us/d/${datasetId}`
const apiUrl = `https://data.cityofnewyork.us/resource/${datasetId}.json?$limit=1000&$order=facilityname`

async function readJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'GeoHarness/1.0 (+https://github.com/Star-Learning/GeoHarness)',
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  return response.json()
}

const inputIndex = process.argv.indexOf('--input')
const inputPath = inputIndex >= 0 ? process.argv[inputIndex + 1] : null
if (inputIndex >= 0 && !inputPath) throw new Error('--input requires a JSON file path')
const rows = inputPath
  ? JSON.parse(await readFile(resolve(repositoryRoot, inputPath), 'utf8'))
  : await readJson(apiUrl)
const manhattan = rows
  .filter(row => row.borough === 'Manhattan' && row.latitude && row.longitude)
  .map(row => ({
    type: 'Feature',
    id: String(row.bin ?? row.facilityname),
    properties: {
      facility_name: String(row.facilityname),
      address: String(row.facilityaddress ?? ''),
      borough: String(row.borough),
      postcode: row.postcode ? String(row.postcode) : null,
      community_board: row.community_board ? Number(row.community_board) : null,
      community_council: row.community_council ? Number(row.community_council) : null,
      census_tract: row.census_tract ? String(row.census_tract) : null,
      bin: row.bin ? String(row.bin) : null,
      bbl: row.bbl ? String(row.bbl) : null,
      nta: String(row.nta ?? ''),
    },
    geometry: {
      type: 'Point',
      coordinates: [Number(row.longitude), Number(row.latitude)],
    },
  }))
  .sort((left, right) => left.properties.facility_name.localeCompare(right.properties.facility_name, 'en'))

if (manhattan.length !== 48) {
  throw new Error(`Expected 48 Manhattan firehouses from ${datasetId}, received ${manhattan.length}`)
}
if (manhattan.some(feature => !Number.isFinite(feature.geometry.coordinates[0]) || !Number.isFinite(feature.geometry.coordinates[1]))) {
  throw new Error('The official response contains invalid firehouse coordinates.')
}

const collection = {
  type: 'FeatureCollection',
  name: 'fdny_firehouses_manhattan',
  crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
  metadata: {
    source: 'NYC Open Data',
    publisher: 'New York City Fire Department (FDNY)',
    dataset_id: datasetId,
    source_url: sourceUrl,
    api_query_url: apiUrl,
    snapshot_date: '2026-08-31',
    license: 'NYC Open Data Terms of Use',
    filter: 'borough = Manhattan; valid latitude/longitude',
    feature_count: manhattan.length,
  },
  features: manhattan,
}

await mkdir(outputRoot, { recursive: true })
const data = `${JSON.stringify(collection, null, 2)}\n`
await writeFile(resolve(outputRoot, 'firehouses.geojson'), data, 'utf8')
await writeFile(resolve(outputRoot, 'source.json'), `${JSON.stringify({
  schema_version: '1.0',
  dataset_id: datasetId,
  title: 'FDNY Firehouse Listing',
  publisher: 'New York City Fire Department (FDNY)',
  source_url: sourceUrl,
  api_query_url: apiUrl,
  snapshot_date: '2026-08-31',
  feature_count: manhattan.length,
  sha256: createHash('sha256').update(data).digest('hex'),
  license: 'NYC Open Data Terms of Use',
}, null, 2)}\n`, 'utf8')

console.log(`Saved ${manhattan.length} official Manhattan firehouses to ${outputRoot}`)

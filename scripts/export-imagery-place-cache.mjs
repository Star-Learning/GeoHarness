import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname, basename } from 'node:path'

// Explicit source only: never scan user sessions or copy image/result pixels.
const [input, output] = process.argv.slice(2)
if (!input || !output) throw new Error('Usage: node scripts/export-imagery-place-cache.mjs <imagery/latest.json> <place-cache.json>')
const source = resolve(input)
const record = JSON.parse(await readFile(source, 'utf8'))
if (!record.resolved_place?.administrative_boundary?.geometry) throw new Error('Source has no real administrative boundary')
const cache = {
  schema_version: '1.0',
  places: [{
    query: record.resolved_place.query,
    captured_at: record.created_at,
    source_session: basename(dirname(dirname(source))),
    resolved_place: record.resolved_place,
  }],
}
const target = resolve(output)
await mkdir(dirname(target), { recursive: true })
await writeFile(target, `${JSON.stringify(cache, null, 2)}\n`)
console.log(JSON.stringify({ file: target, query: cache.places[0].query, captured_at: cache.places[0].captured_at, osm_id: record.resolved_place.administrative_boundary.osm_id }))

export type GeoBounds = readonly [number, number, number, number]

export interface MercatorProjection {
  minWorldX: number
  minWorldY: number
  scale: number
  offsetX: number
  offsetY: number
  width: number
  height: number
  project: (point: [number, number]) => [number, number]
}

export interface RasterTile {
  key: string
  url: string
  x: number
  y: number
  width: number
  height: number
  zoom: number
}

export interface GeoViewFlightStops {
  departure: GeoBounds
  approach: GeoBounds
}

const MAX_MERCATOR_LATITUDE = 85.05112878
const TILE_SIZE = 256
const ESRI_WORLD_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile'

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value))
}

function boundsCenter(bounds: GeoBounds): [number, number] {
  return [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]
}

function boundsAround(center: [number, number], longitudeSpan: number, latitudeSpan: number): GeoBounds {
  const boundedLongitudeSpan = clamp(longitudeSpan, 0.0001, 360)
  const boundedLatitudeSpan = clamp(latitudeSpan, 0.0001, MAX_MERCATOR_LATITUDE * 2)
  let west = center[0] - boundedLongitudeSpan / 2
  let east = center[0] + boundedLongitudeSpan / 2
  let south = center[1] - boundedLatitudeSpan / 2
  let north = center[1] + boundedLatitudeSpan / 2
  if (west < -180) {
    east += -180 - west
    west = -180
  }
  if (east > 180) {
    west -= east - 180
    east = 180
  }
  if (south < -MAX_MERCATOR_LATITUDE) {
    north += -MAX_MERCATOR_LATITUDE - south
    south = -MAX_MERCATOR_LATITUDE
  }
  if (north > MAX_MERCATOR_LATITUDE) {
    south -= north - MAX_MERCATOR_LATITUDE
    north = MAX_MERCATOR_LATITUDE
  }
  return [west, south, east, north]
}

export function interpolateGeoBounds(from: GeoBounds, to: GeoBounds, progress: number): GeoBounds {
  const boundedProgress = clamp(progress, 0, 1)
  if (boundedProgress === 0) return [...from]
  if (boundedProgress === 1) return [...to]
  return [
    from[0] + (to[0] - from[0]) * boundedProgress,
    from[1] + (to[1] - from[1]) * boundedProgress,
    from[2] + (to[2] - from[2]) * boundedProgress,
    from[3] + (to[3] - from[3]) * boundedProgress,
  ]
}

export function createGeoViewFlightStops(from: GeoBounds, to: GeoBounds): GeoViewFlightStops {
  const fromCenter = boundsCenter(from)
  const toCenter = boundsCenter(to)
  const fromLongitudeSpan = from[2] - from[0]
  const fromLatitudeSpan = from[3] - from[1]
  const toLongitudeSpan = to[2] - to[0]
  const toLatitudeSpan = to[3] - to[1]
  const travelLongitude = Math.abs(toCenter[0] - fromCenter[0])
  const travelLatitude = Math.abs(toCenter[1] - fromCenter[1])
  const flightLongitudeSpan = Math.max(
    fromLongitudeSpan * 3.4,
    toLongitudeSpan * 3.4,
    travelLongitude * 0.55,
    0.08,
  )
  const flightLatitudeSpan = Math.max(
    fromLatitudeSpan * 3.4,
    toLatitudeSpan * 3.4,
    travelLatitude * 0.55,
    0.06,
  )
  return {
    departure: boundsAround(fromCenter, flightLongitudeSpan, flightLatitudeSpan),
    approach: boundsAround(toCenter, flightLongitudeSpan, flightLatitudeSpan),
  }
}

export function longitudeToWorldX(longitude: number) {
  return (longitude + 180) / 360
}

export function latitudeToWorldY(latitude: number) {
  const clamped = clamp(latitude, -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE)
  const radians = clamped * Math.PI / 180
  return (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2
}

export function worldXToLongitude(worldX: number) {
  return worldX * 360 - 180
}

export function worldYToLatitude(worldY: number) {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY))) * 180 / Math.PI
}

/** Zero velocity and acceleration at either end; unlike three stopped tweens. */
function smootherStep(value: number) {
  const t = clamp(value, 0, 1)
  return t * t * t * (t * (t * 6 - 15) + 10)
}

function cameraForBounds(bounds: GeoBounds) {
  const projection = createMercatorProjection(bounds)
  return {
    x: (longitudeToWorldX(bounds[0]) + longitudeToWorldX(bounds[2])) / 2,
    y: (latitudeToWorldY(bounds[1]) + latitudeToWorldY(bounds[3])) / 2,
    span: 1 / projection.scale,
  }
}

function cameraBounds(x: number, y: number, span: number): GeoBounds {
  // Match the map's 1000×700 viewport and 50 px fit padding. Interpolating a
  // single Mercator scale avoids aspect-ratio changes halfway through a flight.
  const halfWidth = 450 * span
  const centerY = clamp(y, .000001, 1 - .000001)
  // At polar edges trim the fitted vertical extent, not the camera center.
  // Width still determines the same scale, so a wide polar view cannot jump.
  const halfHeight = Math.min(300 * span, centerY, 1 - centerY)
  return [worldXToLongitude(x - halfWidth), worldYToLatitude(centerY + halfHeight),
    worldXToLongitude(x + halfWidth), worldYToLatitude(centerY - halfHeight)]
}

/** Preserve the user's actual panned/zoomed camera when a named target arrives. */
export function geoBoundsForView(bounds: GeoBounds, zoom: number, pan: { x: number, y: number }): GeoBounds {
  if (zoom === 1 && pan.x === 0 && pan.y === 0) return [...bounds]
  const camera = cameraForBounds(bounds)
  const span = camera.span / zoom
  return cameraBounds(camera.x - pan.x * span, camera.y - pan.y * span, span)
}

/** A short, direct camera adjustment (e.g. candidate extent → real boundary). */
export function interpolateMercatorView(from: GeoBounds, to: GeoBounds, progress: number): GeoBounds {
  if (progress <= 0) return [...from]
  if (progress >= 1) return [...to]
  const a = cameraForBounds(from)
  const b = cameraForBounds(to)
  const t = smootherStep(progress)
  return cameraBounds(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t,
    Math.exp(Math.log(a.span) + Math.log(b.span / a.span) * t))
}

export function createGeoViewFlight(from: GeoBounds, to: GeoBounds) {
  const a = cameraForBounds(from)
  const b = cameraForBounds(to)
  const distance = Math.hypot(b.x - a.x, b.y - a.y)
  const near = distance < Math.max(a.span, b.span) * 30
  const cruise = Math.min(1 / 900, Math.max(a.span, b.span) * 3.4 + distance / 520)
  const levels = Math.max(0, Math.log2(cruise / Math.min(a.span, b.span)))
  const duration = near ? 900 : clamp(2200 + levels * 440 + distance * 1100, 2800, 7600)
  return {
    duration,
    sample(progress: number): GeoBounds {
      if (progress <= 0) return [...from]
      if (progress >= 1) return [...to]
      if (near) return interpolateMercatorView(from, to, progress)
      // Pan overlaps both zoom phases. At the cruise apex pan still has speed,
      // so the camera never stops between zoom-out, travel and zoom-in.
      const travel = smootherStep((progress - .24) / .52)
      const scaleProgress = smootherStep(progress < .5 ? progress * 2 : (progress - .5) * 2)
      const startSpan = progress < .5 ? a.span : cruise
      const endSpan = progress < .5 ? cruise : b.span
      const span = Math.exp(Math.log(startSpan) + Math.log(endSpan / startSpan) * scaleProgress)
      return cameraBounds(a.x + (b.x - a.x) * travel, a.y + (b.y - a.y) * travel, span)
    },
  }
}

export function createMercatorProjection(
  bounds: GeoBounds,
  width = 1000,
  height = 700,
  paddingX = 50,
  paddingY = 50,
): MercatorProjection {
  const minWorldX = longitudeToWorldX(bounds[0])
  const maxWorldX = longitudeToWorldX(bounds[2])
  const minWorldY = latitudeToWorldY(bounds[3])
  const maxWorldY = latitudeToWorldY(bounds[1])
  const worldWidth = Math.max(maxWorldX - minWorldX, 0.000001)
  const worldHeight = Math.max(maxWorldY - minWorldY, 0.000001)
  const scale = Math.min((width - paddingX * 2) / worldWidth, (height - paddingY * 2) / worldHeight)
  const offsetX = (width - worldWidth * scale) / 2
  const offsetY = (height - worldHeight * scale) / 2
  return {
    minWorldX,
    minWorldY,
    scale,
    offsetX,
    offsetY,
    width,
    height,
    project: ([longitude, latitude]) => [
      offsetX + (longitudeToWorldX(longitude) - minWorldX) * scale,
      offsetY + (latitudeToWorldY(latitude) - minWorldY) * scale,
    ],
  }
}

export function rasterZoomForScale(scale: number, viewZoom: number) {
  return clamp(Math.round(Math.log2(Math.max(scale * viewZoom, TILE_SIZE) / TILE_SIZE)), 0, 19)
}

function wrapTileX(value: number, tileCount: number) {
  return ((value % tileCount) + tileCount) % tileCount
}

export function visibleEsriWorldImageryTiles(
  projection: MercatorProjection,
  viewZoom: number,
  pan: { x: number, y: number },
): RasterTile[] {
  const zoom = rasterZoomForScale(projection.scale, viewZoom)
  const tileCount = 2 ** zoom
  const centerX = projection.width / 2
  const centerY = projection.height / 2
  const baseLeft = centerX + (0 - centerX - pan.x) / viewZoom
  const baseRight = centerX + (projection.width - centerX - pan.x) / viewZoom
  const baseTop = centerY + (0 - centerY - pan.y) / viewZoom
  const baseBottom = centerY + (projection.height - centerY - pan.y) / viewZoom
  const worldLeft = projection.minWorldX + (baseLeft - projection.offsetX) / projection.scale
  const worldRight = projection.minWorldX + (baseRight - projection.offsetX) / projection.scale
  const worldTop = projection.minWorldY + (baseTop - projection.offsetY) / projection.scale
  const worldBottom = projection.minWorldY + (baseBottom - projection.offsetY) / projection.scale
  const minimumTileX = Math.floor(Math.min(worldLeft, worldRight) * tileCount) - 1
  const maximumTileX = Math.floor(Math.max(worldLeft, worldRight) * tileCount) + 1
  const minimumTileY = clamp(Math.floor(Math.min(worldTop, worldBottom) * tileCount) - 1, 0, tileCount - 1)
  const maximumTileY = clamp(Math.floor(Math.max(worldTop, worldBottom) * tileCount) + 1, 0, tileCount - 1)
  const tileSize = projection.scale / tileCount
  const tiles: RasterTile[] = []
  for (let tileY = minimumTileY; tileY <= maximumTileY; tileY += 1) {
    for (let tileX = minimumTileX; tileX <= maximumTileX; tileX += 1) {
      const sourceX = wrapTileX(tileX, tileCount)
      tiles.push({
        key: `${zoom}/${tileX}/${tileY}`,
        url: `${ESRI_WORLD_IMAGERY}/${zoom}/${tileY}/${sourceX}`,
        x: projection.offsetX + (tileX / tileCount - projection.minWorldX) * projection.scale,
        y: projection.offsetY + (tileY / tileCount - projection.minWorldY) * projection.scale,
        width: tileSize + 0.35,
        height: tileSize + 0.35,
        zoom,
      })
    }
  }
  return tiles
}

/** Stable low-resolution imagery remains underneath changing detail tiles while flying. */
export function overviewEsriWorldImageryTiles(projection: MercatorProjection): RasterTile[] {
  const tiles: RasterTile[] = []
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < 4; x += 1) {
      tiles.push({
        key: `overview/2/${x}/${y}`,
        url: `${ESRI_WORLD_IMAGERY}/2/${y}/${x}`,
        x: projection.offsetX + (x / 4 - projection.minWorldX) * projection.scale,
        y: projection.offsetY + (y / 4 - projection.minWorldY) * projection.scale,
        width: projection.scale / 4 + .35,
        height: projection.scale / 4 + .35,
        zoom: 2,
      })
    }
  }
  return tiles
}

/** Retain recent detail sources across zoom levels; always keep the visible set. */
export function retainRasterTiles(previous: readonly RasterTile[], visible: readonly RasterTile[], limit = 128): RasterTile[] {
  const currentKeys = new Set(visible.map(tile => tile.key))
  const recent = previous.filter(tile => !currentKeys.has(tile.key))
  const capacity = Math.max(0, limit - visible.length)
  return [...(capacity === 0 ? [] : recent.slice(-capacity)), ...visible]
}

/** A retained image must stay geographically registered as the camera moves. */
export function reprojectRasterTile(tile: RasterTile, projection: MercatorProjection): RasterTile {
  const [zoom, x, y] = tile.key.split('/').map(Number)
  const count = 2 ** zoom
  return {
    ...tile,
    x: projection.offsetX + (x / count - projection.minWorldX) * projection.scale,
    y: projection.offsetY + (y / count - projection.minWorldY) * projection.scale,
    width: projection.scale / count + .35,
    height: projection.scale / count + .35,
  }
}

export function visibleGeographicBounds(
  projection: MercatorProjection,
  viewZoom: number,
  pan: { x: number, y: number },
): GeoBounds {
  const centerX = projection.width / 2
  const centerY = projection.height / 2
  const baseLeft = centerX + (0 - centerX - pan.x) / viewZoom
  const baseRight = centerX + (projection.width - centerX - pan.x) / viewZoom
  const baseTop = centerY + (0 - centerY - pan.y) / viewZoom
  const baseBottom = centerY + (projection.height - centerY - pan.y) / viewZoom
  const worldLeft = projection.minWorldX + (baseLeft - projection.offsetX) / projection.scale
  const worldRight = projection.minWorldX + (baseRight - projection.offsetX) / projection.scale
  const worldTop = projection.minWorldY + (baseTop - projection.offsetY) / projection.scale
  const worldBottom = projection.minWorldY + (baseBottom - projection.offsetY) / projection.scale
  return [
    Math.max(-180, worldXToLongitude(Math.min(worldLeft, worldRight))),
    Math.max(-MAX_MERCATOR_LATITUDE, worldYToLatitude(Math.max(worldTop, worldBottom))),
    Math.min(180, worldXToLongitude(Math.max(worldLeft, worldRight))),
    Math.min(MAX_MERCATOR_LATITUDE, worldYToLatitude(Math.min(worldTop, worldBottom))),
  ]
}

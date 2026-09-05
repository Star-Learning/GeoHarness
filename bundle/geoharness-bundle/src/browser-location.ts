export type BrowserLocationPermission = 'granted' | 'prompt' | 'denied' | 'unsupported'
export type BrowserLocationFailure = 'denied' | 'unavailable' | 'timeout' | 'unsupported'

export interface BrowserLocation {
  longitude: number
  latitude: number
  accuracy: number
  timestamp: number
}

export type BrowserLocationResult =
  | { ok: true, location: BrowserLocation }
  | { ok: false, reason: BrowserLocationFailure }

export async function browserLocationPermission(): Promise<BrowserLocationPermission> {
  if (typeof navigator === 'undefined' || navigator.geolocation === undefined) return 'unsupported'
  if (navigator.permissions?.query === undefined) return 'prompt'
  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' })
    return permission.state
  } catch {
    return 'prompt'
  }
}

export function shouldAutoRequestBrowserLocation(permission: BrowserLocationPermission) {
  return permission === 'granted' || permission === 'prompt'
}

export function requestBrowserLocation(): Promise<BrowserLocationResult> {
  if (typeof navigator === 'undefined' || navigator.geolocation === undefined) {
    return Promise.resolve({ ok: false, reason: 'unsupported' })
  }
  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        ok: true,
        location: {
          longitude: position.coords.longitude,
          latitude: position.coords.latitude,
          accuracy: Math.max(0, position.coords.accuracy),
          timestamp: position.timestamp,
        },
      }),
      error => resolve({
        ok: false,
        reason: error.code === 1 ? 'denied' : error.code === 3 ? 'timeout' : 'unavailable',
      }),
      { enableHighAccuracy: true, timeout: 30_000, maximumAge: 5 * 60_000 },
    )
  })
}

export function locationViewportBounds(location: BrowserLocation): readonly [number, number, number, number] {
  const radiusMetres = Math.max(2_000, Math.min(50_000, location.accuracy * 3))
  const latitudeDelta = radiusMetres / 111_320
  const longitudeDelta = radiusMetres / (111_320 * Math.max(0.05, Math.cos(location.latitude * Math.PI / 180)))
  return [
    Math.max(-180, location.longitude - longitudeDelta),
    Math.max(-85, location.latitude - latitudeDelta),
    Math.min(180, location.longitude + longitudeDelta),
    Math.min(85, location.latitude + latitudeDelta),
  ]
}

export function locationAccuracyLabel(accuracy: number) {
  if (!Number.isFinite(accuracy) || accuracy <= 0) return '精度未知'
  if (accuracy >= 1_000) return `精度约 ${(accuracy / 1_000).toFixed(1)} km`
  return `精度约 ${Math.round(accuracy)} m`
}

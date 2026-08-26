/**
 * Host half of the GeoHarness Phase 0 dual-face plugin.
 *
 * The browser half is discovered from this package's `dsh.client` manifest.
 * Host services and model-facing Geo Tools intentionally start in later phases.
 */

export const name = 'geoharness-phase0'

/** Mount the host half without adding post-Phase-0 behavior. */
export function apply() {}

import { Service } from '@deepseek-ai/cordis'

export class GeoServiceError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'GeoServiceError'
    this.code = code
  }
}

/** Service Definition: provider selection and structured Geo request dispatch. */
export class GeoRuntime extends Service {
  constructor(ctx, config = {}) {
    super(ctx, 'geo')
    this.providerId = config.provider
    this.providers = new Map()
  }

  registerProvider(provider) {
    if (!provider || typeof provider.id !== 'string' || provider.id.trim() === '') {
      throw new GeoServiceError('Geo provider id must be a non-empty string', 'GEO_PROVIDER_INVALID')
    }
    if (this.providers.has(provider.id)) {
      throw new GeoServiceError(`Geo provider "${provider.id}" is already registered`, 'GEO_DUPLICATE_PROVIDER')
    }
    const dispose = this.ctx.effect(function* () {
      this.providers.set(provider.id, provider)
      yield () => this.providers.delete(provider.id)
    }.bind(this), 'geo.registerProvider()')
    return () => void dispose()
  }

  resolveProvider() {
    if (this.providerId !== undefined) {
      const configured = this.providers.get(this.providerId)
      if (configured === undefined) {
        throw new GeoServiceError(`Configured Geo provider "${this.providerId}" is not registered`, 'GEO_PROVIDER_MISSING')
      }
      if (!configured.available()) {
        throw new GeoServiceError(`Configured Geo provider "${this.providerId}" is unavailable`, 'GEO_PROVIDER_UNAVAILABLE')
      }
      return configured
    }
    const available = [...this.providers.values()].filter(provider => provider.available())
    if (available.length === 0) {
      throw new GeoServiceError('No usable Geo provider is registered', 'GEO_PROVIDER_UNAVAILABLE')
    }
    if (available.length > 1) {
      throw new GeoServiceError(
        `Multiple Geo providers are available (${available.map(provider => provider.id).join(', ')})`,
        'GEO_PROVIDER_AMBIGUOUS',
      )
    }
    return available[0]
  }

  execute(request, signal) {
    return this.resolveProvider().execute(request, signal)
  }

  diagnostics(workspaceKey) {
    const provider = this.resolveProvider()
    if (typeof provider.diagnostics !== 'function') {
      throw new GeoServiceError('Configured Geo provider does not expose diagnostics', 'GEO_DIAGNOSTICS_UNAVAILABLE')
    }
    return provider.diagnostics(workspaceKey)
  }
}

export default GeoRuntime

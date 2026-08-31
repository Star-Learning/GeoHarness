import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { LocalPythonGeoProvider } from './host/provider.js'
import { registerGeoRpc } from './host/rpc.js'
import { registerRunManifestProjector } from './host/run-manifest.js'
import { GeoRuntime } from './host/service.js'
import { TaskGraphRuntime } from './host/task-graph.js'
import { registerGeoTools } from './host/tools.js'

export const name = 'geoharness'
export const inject = ['tools', 'systemPrompt', 'sessions']

const packagedBackendRoot = fileURLToPath(new URL('../../backend/geo-service/', import.meta.url))
const packagedDatasetRoot = fileURLToPath(new URL('../../examples/datasets/', import.meta.url))

/** Compose the Geo Service Definition, local Python Provider and model-facing Tool consumers. */
export function apply(ctx, config = {}) {
  const providerId = config.provider ?? 'local-python'
  const runtime = new GeoRuntime(ctx, { provider: providerId })
  runtime.registerProvider(new LocalPythonGeoProvider({
    id: providerId,
    python: config.python ?? process.env.GEOHARNESS_PYTHON ?? 'python',
    backendRoot: resolve(config.backendRoot ?? packagedBackendRoot),
    scenarioRoot: resolve(config.scenarioRoot ?? resolve(process.cwd(), 'examples/scenarios')),
    datasetRoot: resolve(config.datasetRoot ?? packagedDatasetRoot),
    workspaceRoot: resolve(config.workspaceRoot ?? resolve(process.cwd(), '.geoharness/workspaces')),
    uploadMaxBytes: config.uploadMaxBytes,
    requestTimeoutMs: config.requestTimeoutMs,
    maxLayerFeatures: config.maxLayerFeatures,
    maxLayerBytes: config.maxLayerBytes,
  }))
  new TaskGraphRuntime(ctx, { scenarioRoot: resolve(config.scenarioRoot ?? resolve(process.cwd(), 'examples/scenarios')) })
  registerGeoTools(ctx, { datasetRoot: resolve(config.datasetRoot ?? packagedDatasetRoot) })
  registerRunManifestProjector(ctx)
  ctx.inject(['connection'], connectionCtx => registerGeoRpc(connectionCtx))
}

export { GeoRuntime, LocalPythonGeoProvider, TaskGraphRuntime, registerGeoRpc, registerGeoTools, registerRunManifestProjector }

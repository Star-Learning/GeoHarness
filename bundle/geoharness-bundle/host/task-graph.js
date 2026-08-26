import { readFile } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { Service } from '@deepseek-ai/cordis'

const STEP_STATUSES = new Set(['pending', 'running', 'success', 'failed'])
const TRANSITIONS = {
  pending: new Set(['running', 'failed']),
  running: new Set(['success', 'failed']),
  success: new Set(['pending']),
  failed: new Set(['pending']),
}

export class TaskGraphError extends Error {
  constructor(message, code = 'TASK_GRAPH_ERROR') {
    super(message)
    this.name = 'TaskGraphError'
    this.code = code
  }
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function validateDefinition(definition) {
  if (!plainObject(definition) || typeof definition.goal !== 'string' || definition.goal.trim() === '') {
    throw new TaskGraphError('Task Graph goal must be a non-empty string', 'TASK_GRAPH_INVALID')
  }
  if (!Array.isArray(definition.steps) || definition.steps.length === 0) {
    throw new TaskGraphError('Task Graph must contain at least one step', 'TASK_GRAPH_INVALID')
  }
  const ids = new Set()
  const outputOwners = new Map()
  for (const step of definition.steps) {
    if (!plainObject(step) || typeof step.id !== 'string' || !/^[a-z][a-z0-9_]*$/.test(step.id)) {
      throw new TaskGraphError('Every step id must be a stable snake_case identifier', 'TASK_GRAPH_INVALID')
    }
    if (ids.has(step.id)) throw new TaskGraphError(`Duplicate Task Graph step id: ${step.id}`, 'TASK_GRAPH_INVALID')
    ids.add(step.id)
    if (typeof step.title !== 'string' || step.title.trim() === '' || typeof step.tool !== 'string' || step.tool.trim() === '') {
      throw new TaskGraphError(`Step ${step.id} requires a title and tool`, 'TASK_GRAPH_INVALID')
    }
    if (!Array.isArray(step.dependencies) || !step.dependencies.every(value => typeof value === 'string')) {
      throw new TaskGraphError(`Step ${step.id} dependencies must be an array`, 'TASK_GRAPH_INVALID')
    }
    if (!plainObject(step.parameters)) throw new TaskGraphError(`Step ${step.id} parameters must be an object`, 'TASK_GRAPH_INVALID')
    if (!Array.isArray(step.outputs) || !step.outputs.every(value => typeof value === 'string' && value.length > 0)) {
      throw new TaskGraphError(`Step ${step.id} outputs must be an array of Layer aliases`, 'TASK_GRAPH_INVALID')
    }
    for (const alias of step.outputs) {
      if (outputOwners.has(alias)) {
        throw new TaskGraphError(`Layer alias ${alias} is produced by multiple steps`, 'TASK_GRAPH_INVALID')
      }
      outputOwners.set(alias, step.id)
    }
  }
  for (const step of definition.steps) {
    for (const dependency of step.dependencies) {
      if (!ids.has(dependency)) throw new TaskGraphError(`Step ${step.id} has unknown dependency ${dependency}`, 'TASK_GRAPH_INVALID')
      if (dependency === step.id) throw new TaskGraphError(`Step ${step.id} cannot depend on itself`, 'TASK_GRAPH_INVALID')
    }
  }
  const visiting = new Set()
  const visited = new Set()
  const byId = new Map(definition.steps.map(step => [step.id, step]))
  const visit = (id) => {
    if (visiting.has(id)) throw new TaskGraphError(`Task Graph contains a dependency cycle at ${id}`, 'TASK_GRAPH_CYCLE')
    if (visited.has(id)) return
    visiting.add(id)
    for (const dependency of byId.get(id).dependencies) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of ids) visit(id)
  return definition
}

function resolveParameters(value, layerAliases) {
  if (Array.isArray(value)) return value.map(item => resolveParameters(item, layerAliases))
  if (!plainObject(value)) return value
  const keys = Object.keys(value)
  if (keys.length === 1 && keys[0] === '$layer') {
    const alias = value.$layer
    if (typeof alias !== 'string' || !layerAliases.has(alias)) {
      throw new TaskGraphError(`Unknown Layer alias: ${String(alias)}`, 'TASK_GRAPH_LAYER_MISSING')
    }
    return layerAliases.get(alias)
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, resolveParameters(item, layerAliases)]))
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

/** One validated, observable execution of a Scenario Task Graph. */
export class TaskGraphExecution {
  constructor(definition, options) {
    this.definition = validateDefinition(clone(definition))
    this.executor = options.executor
    if (typeof this.executor !== 'function') throw new TaskGraphError('Task Graph executor is required', 'TASK_GRAPH_INVALID')
    this.onTransition = options.onTransition
    this.layerAliases = new Map(Object.entries(options.initialLayers ?? {}))
    this.initialLayerAliases = new Set(this.layerAliases.keys())
    this.steps = new Map(this.definition.steps.map(step => [step.id, {
      ...step,
      status: 'pending',
      resolved_parameters: null,
      resolved_outputs: [],
      result: null,
      error: null,
    }]))
    this.history = []
    this.runHistory = []
    this.pendingRevision = null
    this.sequence = 0
    this.active = false
  }

  transition(step, status, details = {}) {
    if (!STEP_STATUSES.has(status) || !TRANSITIONS[step.status].has(status)) {
      throw new TaskGraphError(`Invalid step transition ${step.status} → ${status} for ${step.id}`, 'TASK_GRAPH_TRANSITION')
    }
    const previous = step.status
    step.status = status
    Object.assign(step, details)
    const event = {
      sequence: ++this.sequence,
      step_id: step.id,
      from: previous,
      to: status,
      outputs: clone(step.resolved_outputs),
      error: step.error,
    }
    this.history.push(event)
    this.onTransition?.(clone(event), this.snapshot())
  }

  async executeStep(step, signal) {
    let parameters
    try {
      parameters = resolveParameters(step.parameters, this.layerAliases)
    } catch (error) {
      this.transition(step, 'failed', { error: error instanceof Error ? error.message : String(error) })
      return
    }
    this.transition(step, 'running', { resolved_parameters: clone(parameters), error: null })
    try {
      const result = await this.executor({
        id: step.id,
        tool: step.tool,
        parameters,
        signal,
      })
      if (!plainObject(result) || result.success !== true) {
        const summary = plainObject(result) && typeof result.summary === 'string' ? result.summary : 'Tool returned an unsuccessful result'
        this.transition(step, 'failed', { result: clone(result), error: summary })
        return
      }
      const outputIds = Array.isArray(result.outputs) ? result.outputs : []
      if (outputIds.length !== step.outputs.length) {
        this.transition(step, 'failed', {
          result: clone(result),
          error: `Tool returned ${outputIds.length} output layers; ${step.outputs.length} required`,
        })
        return
      }
      const resolvedOutputs = step.outputs.map((alias, index) => ({ alias, layer_id: outputIds[index] }))
      for (const output of resolvedOutputs) this.layerAliases.set(output.alias, output.layer_id)
      this.transition(step, 'success', { result: clone(result), resolved_outputs: resolvedOutputs, error: null })
    } catch (error) {
      this.transition(step, 'failed', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  async run(options = {}) {
    if (this.active) throw new TaskGraphError('Task Graph execution is already running', 'TASK_GRAPH_RUNNING')
    this.active = true
    const scheduledSteps = [...this.steps.values()].filter(step => step.status === 'pending').map(step => step.id)
    const reusedSteps = [...this.steps.values()].filter(step => step.status === 'success').map(step => step.id)
    try {
      while ([...this.steps.values()].some(step => step.status === 'pending')) {
        let progressed = false
        for (const step of this.steps.values()) {
          if (step.status !== 'pending') continue
          const dependencies = step.dependencies.map(id => this.steps.get(id))
          const failed = dependencies.filter(item => item.status === 'failed').map(item => item.id)
          if (failed.length > 0) {
            this.transition(step, 'failed', { error: `Blocked by failed dependencies: ${failed.join(', ')}` })
            progressed = true
            continue
          }
          if (!dependencies.every(item => item.status === 'success')) continue
          await this.executeStep(step, options.signal)
          progressed = true
        }
        if (!progressed) throw new TaskGraphError('Task Graph made no progress', 'TASK_GRAPH_STALLED')
      }
      if (scheduledSteps.length > 0) {
        const status = this.snapshot().status
        this.runHistory.push({
          run: this.runHistory.length + 1,
          kind: this.pendingRevision === null ? 'initial' : 'revision',
          reason: this.pendingRevision?.reason ?? null,
          parameter_changes: clone(this.pendingRevision?.parameter_changes ?? []),
          executed_steps: scheduledSteps,
          reused_steps: reusedSteps,
          status,
        })
        this.pendingRevision = null
      }
      return this.snapshot()
    } finally {
      this.active = false
    }
  }

  reviseFrom(stepId, parameterPatch, reason) {
    if (this.active) throw new TaskGraphError('Cannot revise a running Task Graph', 'TASK_GRAPH_RUNNING')
    if ([...this.steps.values()].some(step => step.status === 'pending' || step.status === 'running')) {
      throw new TaskGraphError('Task Graph must finish before revision', 'TASK_GRAPH_NOT_COMPLETE')
    }
    if (!plainObject(parameterPatch)) throw new TaskGraphError('Revision parameters must be an object', 'TASK_GRAPH_REVISION_INVALID')
    const target = this.steps.get(stepId)
    if (target === undefined) throw new TaskGraphError(`Unknown revision step: ${stepId}`, 'TASK_GRAPH_REVISION_INVALID')
    const affected = new Set([stepId])
    let changed = true
    while (changed) {
      changed = false
      for (const step of this.steps.values()) {
        if (!affected.has(step.id) && step.dependencies.some(dependency => affected.has(dependency))) {
          affected.add(step.id)
          changed = true
        }
      }
    }
    const before = clone(target.parameters)
    target.parameters = { ...target.parameters, ...clone(parameterPatch) }
    const invalidatedOutputs = []
    for (const step of this.steps.values()) {
      if (!affected.has(step.id)) continue
      invalidatedOutputs.push(...step.resolved_outputs.map(output => clone(output)))
      for (const output of step.resolved_outputs) {
        if (this.layerAliases.get(output.alias) === output.layer_id) this.layerAliases.delete(output.alias)
      }
      this.transition(step, 'pending', {
        resolved_parameters: null,
        resolved_outputs: [],
        result: null,
        error: null,
      })
    }
    const parameterChanges = [{ step_id: stepId, before, after: clone(target.parameters) }]
    this.pendingRevision = {
      reason: typeof reason === 'string' && reason.trim() !== '' ? reason.trim() : null,
      parameter_changes: parameterChanges,
      affected_steps: [...affected],
      invalidated_outputs: invalidatedOutputs,
    }
    return clone(this.pendingRevision)
  }

  snapshot() {
    const steps = [...this.steps.values()].map(step => clone(step))
    const status = steps.some(step => step.status === 'running')
      ? 'running'
      : steps.some(step => step.status === 'failed')
        ? 'failed'
        : steps.every(step => step.status === 'success')
          ? 'success'
          : 'pending'
    return {
      schema_version: this.definition.schema_version ?? '1.0',
      scenario_id: this.definition.scenario_id ?? null,
      goal: this.definition.goal,
      status,
      steps,
      layers: Object.fromEntries(this.layerAliases),
      initial_layers: [...this.initialLayerAliases],
      history: clone(this.history),
      run_history: clone(this.runHistory),
    }
  }
}

/** Harness service that loads and executes the independent Scenario DAGs through ctx.geo. */
export class TaskGraphRuntime extends Service {
  constructor(ctx, options) {
    super(ctx, 'taskGraph')
    this.scenarioRoot = resolve(options.scenarioRoot)
    this.runs = new Map()
    this.verifications = new Map()
  }

  async loadDefinition(scenarioId) {
    const root = resolve(this.scenarioRoot, scenarioId)
    if (root !== this.scenarioRoot && !root.startsWith(`${this.scenarioRoot}${sep}`)) {
      throw new TaskGraphError(`Unsafe Scenario id: ${scenarioId}`, 'TASK_GRAPH_SCENARIO_INVALID')
    }
    const definition = JSON.parse(await readFile(resolve(root, 'task-graph.json'), 'utf8'))
    if (definition.scenario_id !== scenarioId) {
      throw new TaskGraphError(`Task Graph Scenario mismatch: ${scenarioId}`, 'TASK_GRAPH_SCENARIO_INVALID')
    }
    return validateDefinition(definition)
  }

  async runScenario({ scenarioId, workspaceKey = 'direct', signal, onTransition }) {
    const definition = await this.loadDefinition(scenarioId)
    const loaded = await this.ctx.geo.execute({ action: 'load_scenario', scenarioId, workspaceKey }, signal)
    const initialLayers = Object.fromEntries(loaded.layers.map(layer => [layer.name, layer.layer_id]))
    const execution = new TaskGraphExecution(definition, {
      initialLayers,
      onTransition,
      executor: step => this.ctx.geo.execute({
        action: 'tool',
        workspaceKey,
        tool: step.tool,
        step_id: step.id,
        parameters: step.parameters,
      }, step.signal),
    })
    const key = `${workspaceKey}:${scenarioId}`
    this.runs.set(key, execution)
    const snapshot = await execution.run({ signal })
    const mapVerification = await this.buildMapVerification(snapshot, workspaceKey, signal)
    this.verifications.set(key, mapVerification)
    return { ...snapshot, map_verification: mapVerification }
  }

  async reviseScenario({ scenarioId, workspaceKey = 'direct', stepId, parameterPatch, reason, signal }) {
    const key = `${workspaceKey}:${scenarioId}`
    const execution = this.runs.get(key)
    if (execution === undefined) {
      throw new TaskGraphError(`No completed Task Graph to revise for ${scenarioId}`, 'TASK_GRAPH_RUN_MISSING')
    }
    const revision = execution.reviseFrom(stepId, parameterPatch, reason)
    const snapshot = await execution.run({ signal })
    const mapVerification = await this.buildMapVerification(snapshot, workspaceKey, signal)
    this.verifications.set(key, mapVerification)
    return { ...snapshot, map_verification: mapVerification, revision }
  }

  latest(workspaceKey, scenarioId) {
    const key = `${workspaceKey}:${scenarioId}`
    const snapshot = this.runs.get(key)?.snapshot()
    return snapshot === undefined ? null : {
      ...snapshot,
      map_verification: this.verifications.get(key) ?? null,
    }
  }

  async buildMapVerification(snapshot, workspaceKey, signal) {
    const projection = await this.ctx.geo.execute({ action: 'projection', workspaceKey }, signal)
    const stepById = new Map(snapshot.steps.map(step => [step.id, step]))
    const aliasesByLayer = new Map()
    for (const [alias, layerId] of Object.entries(snapshot.layers)) {
      const aliases = aliasesByLayer.get(layerId) ?? []
      aliases.push(alias)
      aliasesByLayer.set(layerId, aliases)
    }
    const metadataById = new Map(projection.map(item => [item.metadata.layer_id, item.metadata]))
    const historicalOutputIds = new Set(snapshot.history
      .filter(event => event.to === 'success')
      .flatMap(event => event.outputs.map(output => output.layer_id)))
    const issues = []
    const mapLayers = projection.map(item => {
      const metadata = item.metadata
      const featureCountMatches = item.geojson?.type === 'FeatureCollection'
        && Array.isArray(item.geojson.features)
        && item.geojson.features.length === metadata.feature_count
      if (!featureCountMatches) issues.push(`Feature count mismatch for ${metadata.layer_id}`)
      const parentsPresent = metadata.parents.every(parent => metadataById.has(parent))
      if (!parentsPresent) issues.push(`Missing parent Layer for ${metadata.layer_id}`)
      let lineageMatches = true
      const aliases = aliasesByLayer.get(metadata.layer_id) ?? []
      const active = metadata.source !== 'derived' || aliases.length > 0
      if (metadata.generated_by !== null) {
        const step = stepById.get(metadata.generated_by)
        lineageMatches = active
          ? step?.status === 'success' && step.resolved_outputs.some(output => output.layer_id === metadata.layer_id)
          : historicalOutputIds.has(metadata.layer_id)
        if (!lineageMatches) issues.push(`Step lineage mismatch for ${metadata.layer_id}`)
      }
      return {
        layer_id: metadata.layer_id,
        aliases,
        active,
        step_id: metadata.generated_by,
        metadata,
        geojson: item.geojson,
        checks: { feature_count_matches: featureCountMatches, parents_present: parentsPresent, lineage_matches: lineageMatches },
      }
    })
    const layerById = new Map(mapLayers.map(layer => [layer.layer_id, layer]))
    const stepBindings = snapshot.steps.map(step => {
      const outputs = step.resolved_outputs.map(output => ({
        alias: output.alias,
        layer_id: output.layer_id,
        map_layer_present: layerById.has(output.layer_id),
      }))
      if (step.status === 'success' && outputs.some(output => !output.map_layer_present)) {
        issues.push(`Map Layer missing for successful step ${step.id}`)
      }
      return { step_id: step.id, status: step.status, outputs }
    })
    const checks = {
      all_step_outputs_linked: stepBindings.every(binding => binding.status !== 'success'
        || binding.outputs.every(output => output.map_layer_present)),
      feature_counts_match: mapLayers.every(layer => layer.checks.feature_count_matches),
      lineage_matches: mapLayers.every(layer => layer.checks.lineage_matches),
      parent_layers_present: mapLayers.every(layer => layer.checks.parents_present),
    }
    return {
      status: issues.length === 0 && Object.values(checks).every(Boolean) ? 'ready' : 'failed',
      scenario_id: snapshot.scenario_id,
      checks,
      issues,
      step_bindings: stepBindings,
      map_layers: mapLayers,
    }
  }
}

export default TaskGraphRuntime

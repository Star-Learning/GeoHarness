import { jsx as _jsx } from 'react/jsx-runtime'
import * as React from 'react'

declare const __GE0HARNESS_CSS__: string

const PACKAGE_NAME = '@geoharness/harness-plugin'

type SlotName = 'conversation.view' | 'shell.overlay'

interface SlotRegistration {
  name: SlotName
  id: string
  order?: number
  label?: string
}

interface SlotService {
  inject(name: SlotName, setup: () => void | (() => void)): () => void
  register(options: SlotRegistration, component: React.ComponentType): () => void
}

interface ClientContext {
  slots: SlotService
}

interface ScenarioPreview {
  id: string
  number: string
  title: string
  prompt: string
}

const SCENARIOS: readonly ScenarioPreview[] = [
  {
    id: '01-building-data-inspection',
    number: '01',
    title: 'Understand Building Data',
    prompt: '帮我看看这个建筑数据有什么特点。',
  },
  {
    id: '02-river-building-query',
    number: '02',
    title: 'Buildings Near Rivers',
    prompt: '找出距离 Hudson River 和 East River 500 米以内的建筑，并告诉我一共有多少栋。',
  },
  {
    id: '03-building-statistics-by-district',
    number: '03',
    title: 'Buildings by District',
    prompt: '按 Community District 统计建筑数量和建筑总面积。',
  },
  {
    id: '04-road-accessibility',
    number: '04',
    title: 'Road Accessibility',
    prompt: '找出距离主要道路 300 米以内的建筑，并按 Community District 统计数量。',
  },
  {
    id: '05-parameter-revision',
    number: '05',
    title: 'Revise a Spatial Query',
    prompt: '找出距离主要道路 500 米以内的建筑。',
  },
  {
    id: '06-multi-constraint-selection',
    number: '06',
    title: 'Multi-Constraint Selection',
    prompt: '找出距离主要道路 300 米以内，同时距离 Hudson River 和 East River 至少 800 米的建筑。',
  },
]

function installStyles() {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin=${JSON.stringify(PACKAGE_NAME)}]`) !== null) return
  const style = document.createElement('style')
  style.dataset.plugin = PACKAGE_NAME
  style.textContent = __GE0HARNESS_CSS__
  document.head.appendChild(style)
}

function BrandMark({ small = false }: { small?: boolean }) {
  return (
    <span className={small ? 'gh-brand-mark gh-brand-mark--small' : 'gh-brand-mark'} aria-hidden="true">
      <span className="gh-brand-mark__orbit" />
      <span className="gh-brand-mark__pin" />
    </span>
  )
}

function GeoHarnessShell() {
  const [selectedId, setSelectedId] = React.useState(SCENARIOS[1].id)
  const selected = React.useMemo(
    () => SCENARIOS.find(scenario => scenario.id === selectedId) ?? SCENARIOS[0],
    [selectedId],
  )
  const [prompt, setPrompt] = React.useState(selected.prompt)
  const [goal, setGoal] = React.useState(selected.prompt)
  const [stagedFile, setStagedFile] = React.useState<string | null>(null)

  const selectScenario = (id: string) => {
    const next = SCENARIOS.find(scenario => scenario.id === id)
    if (next === undefined) return
    setSelectedId(id)
    setPrompt(next.prompt)
    setGoal(next.prompt)
  }

  const submitGoal = (event: React.FormEvent) => {
    event.preventDefault()
    const value = prompt.trim()
    if (value !== '') setGoal(value)
  }

  return (
    <main className="gh-shell" data-geoharness-phase="1">
      <header className="gh-topbar">
        <div className="gh-brand">
          <BrandMark />
          <span>
            <strong>GeoHarness</strong>
            <small>Agentic GIS Workspace</small>
          </span>
        </div>
        <div className="gh-launcher">
          <label htmlFor="gh-scenario">Scenario</label>
          <select
            id="gh-scenario"
            value={selectedId}
            onChange={event => selectScenario(event.currentTarget.value)}
            aria-label="Choose a GeoHarness scenario"
          >
            {SCENARIOS.map(scenario => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.number} · {scenario.title}
              </option>
            ))}
          </select>
          <span className="gh-status"><i /> Shell ready</span>
        </div>
      </header>

      <section className="gh-workspace">
        <aside className="gh-panel gh-layers" aria-label="Layer panel">
          <div className="gh-panel-heading">
            <span><b>Layers</b><small>Data workspace</small></span>
            <label className="gh-icon-button" title="Stage a vector file">
              <input
                type="file"
                accept=".geojson,.json,.zip,.gpkg,.csv"
                onChange={event => setStagedFile(event.currentTarget.files?.[0]?.name ?? null)}
              />
              +
            </label>
          </div>
          <div className="gh-layer-section-label">Scenario inputs</div>
          <div className="gh-layer-empty">
            <span className="gh-layer-empty__glyph">◇</span>
            <strong>{stagedFile ?? 'No layers loaded'}</strong>
            <p>{stagedFile === null
              ? 'Choose a Scenario or stage a vector file.'
              : 'File staged. Reading and registration arrive in Phase 3.'}</p>
          </div>
          <div className="gh-layer-footer">
            <span>0 visible</span><span>EPSG —</span>
          </div>
        </aside>

        <section className="gh-map" aria-label="Map workspace">
          <div className="gh-map-toolbar" aria-label="Map controls">
            <button type="button" disabled aria-label="Zoom in">+</button>
            <button type="button" disabled aria-label="Zoom out">−</button>
            <button type="button" disabled aria-label="Fit bounds">⌖</button>
          </div>
          <div className="gh-map-label"><span>MANHATTAN</span><small>40.7831° N · 73.9712° W</small></div>
          <svg className="gh-map-preview" viewBox="0 0 720 620" role="img" aria-label="Stylized Manhattan map workspace preview">
            <path className="gh-river gh-river--west" d="M135,-20 C98,130 143,248 93,397 C66,478 78,559 26,650" />
            <path className="gh-river gh-river--east" d="M582,-20 C628,107 584,243 635,366 C676,467 634,561 704,650" />
            <path className="gh-island" d="M335,36 C378,76 398,142 423,217 C453,307 468,400 440,491 C422,548 390,585 350,603 C328,552 288,514 279,448 C266,355 290,274 288,193 C286,128 298,75 335,36 Z" />
            <g className="gh-streets">
              <path d="M329 87L383 545" /><path d="M304 141L421 470" /><path d="M294 221L443 389" />
              <path d="M289 307L448 309" /><path d="M281 390L433 236" /><path d="M296 475L406 150" />
            </g>
            <circle className="gh-map-focus" cx="373" cy="314" r="22" />
          </svg>
          <div className="gh-map-empty-card">
            <span className="gh-eyebrow">MAP WORKSPACE</span>
            <strong>Spatial canvas is ready</strong>
            <p>Layer rendering, inspection and map interaction are connected in Phase 3.</p>
          </div>
          <div className="gh-map-scale"><span /> 2 km</div>
        </section>

        <aside className="gh-panel gh-agent" aria-label="Agent workspace">
          <div className="gh-panel-heading">
            <span><b>Agent</b><small>Goal → Plan → Result</small></span>
            <span className="gh-agent-state">Ready</span>
          </div>
          <div className="gh-agent-scroll">
            <section className="gh-agent-block">
              <span className="gh-eyebrow">GOAL</span>
              <p>{goal}</p>
            </section>
            <section className="gh-agent-block">
              <span className="gh-eyebrow">PLAN PREVIEW</span>
              <ol className="gh-plan-list">
                <li className="is-active"><i>1</i><span><b>Understand goal</b><small>Scenario context selected</small></span></li>
                <li><i>2</i><span><b>Plan GIS workflow</b><small>Awaiting Harness integration</small></span></li>
                <li><i>3</i><span><b>Execute Geo Tools</b><small>No tools called</small></span></li>
                <li><i>4</i><span><b>Verify on map</b><small>No output layers</small></span></li>
              </ol>
            </section>
            <section className="gh-agent-block gh-current-step">
              <span className="gh-eyebrow">CURRENT STEP</span>
              <div><span>Phase</span><b>UI Shell</b></div>
              <div><span>Scenario</span><b>{selected.number}</b></div>
              <div><span>Status</span><b className="is-teal">Ready</b></div>
            </section>
          </div>
        </aside>
      </section>

      <form className="gh-composer" onSubmit={submitGoal}>
        <BrandMark small />
        <textarea
          value={prompt}
          onChange={event => setPrompt(event.currentTarget.value)}
          rows={1}
          aria-label="Describe your spatial goal"
          placeholder="描述你想解决的空间问题……"
        />
        <button type="submit" disabled={prompt.trim() === ''}>Set goal <span>↗</span></button>
      </form>
    </main>
  )
}

function GeoHarnessBadge() {
  return <div className="gh-shell-badge" data-geoharness-plugin="loaded"><BrandMark small /> GeoHarness</div>
}

export const inject = ['slots'] as const

export function apply(ctx: ClientContext) {
  installStyles()
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'geoharness',
    order: 20,
    label: 'GeoHarness',
  }, GeoHarnessShell))
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'geoharness-brand',
    order: 20,
  }, GeoHarnessBadge))
}

// Kept as a value reference so TypeScript preserves the jsx-runtime external
// in the generated factory even when a future compiler version rewrites JSX.
void _jsx

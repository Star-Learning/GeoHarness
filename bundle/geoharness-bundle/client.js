/*
 * Prebuilt Phase 0 browser entry in DeepSeek Harness's current lazy-CJS
 * client-module format. Phase 1 will replace this deliberately small artifact
 * with the repository's typed client build once the real UI domains exist.
 */
window.__ModuleLoader__.load({
  id: '@geoharness/harness-plugin',
  factory: (require) => {
    const React = require('react')
    const { createElement } = React
    const pluginId = '@geoharness/harness-plugin'

    if (typeof document !== 'undefined'
      && document.querySelector(`style[data-plugin=${JSON.stringify(pluginId)}]`) === null) {
      const style = document.createElement('style')
      style.dataset.plugin = pluginId
      style.textContent = `
.geoharness-phase0-view {
  box-sizing: border-box;
  display: grid;
  min-height: 100%;
  place-items: center;
  padding: 32px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: var(--dsw-font-family);
}
.geoharness-phase0-card {
  width: min(560px, 100%);
  padding: 24px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 16px;
  background: var(--dsw-alias-bg-layer-1);
}
.geoharness-phase0-card h2 {
  margin: 0 0 12px;
  font: var(--dsw-font-l-20);
}
.geoharness-phase0-card p {
  margin: 0;
  color: var(--dsw-alias-label-secondary);
  line-height: 1.6;
}
.geoharness-phase0-marker {
  position: fixed;
  right: 16px;
  bottom: 16px;
  padding: 6px 10px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: 999px;
  background: var(--dsw-alias-bg-overlay);
  color: var(--dsw-alias-label-secondary);
  font: var(--dsw-font-markdown-small);
  pointer-events: none;
}
`
      document.head.appendChild(style)
    }

    function GeoHarnessPhase0View() {
      return createElement(
        'main',
        { className: 'geoharness-phase0-view', 'data-geoharness-phase': '0' },
        createElement(
          'section',
          { className: 'geoharness-phase0-card' },
          createElement('h2', null, 'GeoHarness 集成基线'),
          createElement(
            'p',
            null,
            'Phase 0 客户端插件已通过 DeepSeek Harness 的 client module 与 Slot 系统加载。地图、图层、Geo Tools 和场景工作流尚未开始实现。',
          ),
        ),
      )
    }

    function GeoHarnessPhase0Marker() {
      return createElement(
        'div',
        { className: 'geoharness-phase0-marker', 'data-geoharness-plugin': 'loaded' },
        'GeoHarness · Phase 0',
      )
    }

    const inject = ['slots']

    function apply(ctx) {
      ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view',
        id: 'geoharness',
        order: 20,
        label: 'GeoHarness',
      }, GeoHarnessPhase0View))

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'geoharness-phase0',
        order: 20,
      }, GeoHarnessPhase0Marker))
    }

    return { apply, inject }
  },
})

# GeoHarness Blockers

## Phase 0

没有阻止 Phase 0 完成的活跃问题。最小 Bundle 已被当前上游构建产物成功安装、
组合和服务。

## 已解决

### GeoHarness 客户端构建链

Phase 1 已在本仓库建立 TypeScript/React 构建链，并为生成的 lazy-CJS factory、
Harness externals、CSS 注入和产物新鲜度增加测试。GeoHarness 不依赖上游仓库内部的
`packages/client/tsdown.client.ts`。

### 三栏 UI Shell 的 Slot 适配性

真实 Harness Web 验证确认，Phase 1 三栏工作区可以通过 `conversation.view` 完整
呈现，`shell.overlay` 可以承载轻量品牌状态；无需注册会遮蔽 AppFrame 的 `root`。

## 活跃风险与后续门禁

### 1. 上游源码 CLI 在当前 Node 24 环境中的运行问题

在 Windows、Node.js `v24.19.0` 下，当前提交的源码入口通过 `tsx/esm` 启动
profile 时失败：`apps/cli/src/profile-boot.ts` 从 `@deepseek-ai/cordis` 请求
运行时导出 `FiberState`，但它是被编译内联的 `const enum`，运行时包不导出
该名称。上游构建后的 `apps/cli/lib/bin.js` 工作正常，已用它完成全部真实验证。

GeoHarness 不应直接修改 `../deepseek-harness` 规避此问题。若后续开发必须使用
上游源码 CLI/HMR，应先跟进上游修复或确定稳定的已发布/已构建 CLI 工作流。

### 2. 真实地图能力尚未验证

Phase 1 的 Map Workspace 是产品 Shell，不包含地图引擎。真实图层渲染、交互和
`Task Step ↔ Layer ↔ Map` 绑定属于 Phase 3 和 Phase 7，必须继续在
`conversation.view` 中验证布局、资源加载和事件生命周期。

### 3. 上游版本升级门禁

骨架精确对齐 DeepSeek Harness `0.1.1-rc.2` 与 Cordis `4.0.1`。升级上游时
必须重新核对 `dsh.bundle`、`dsh.client`、客户端产物协议、Slot 名称和
Service/Tool API，并重跑隔离 profile 验证。

### 4. Demo 数据性质

Phase 2 采用项目自有、CC0-1.0 的确定性 Manhattan-scale 合成 fixture，以保证
离线、快速、可精确回归。它们不是 NYC 官方地籍、道路或水系数据，README 已明确
披露。该选择不阻塞 v1.0 的工作流实现与空间正确性测试；如未来替换为生产级官方
数据，必须重新生成固定统计并更新 Scenario 期望，不能静默替换。

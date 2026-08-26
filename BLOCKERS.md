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

### 真实矢量地图的 Slot 适配性

Phase 3 已在真实 Harness Web 中验证：六个 Scenario 数据可嵌入客户端，三栏视图
可在 `conversation.view` 中加载、渲染 SVG 矢量地图并执行显隐、缩放、切换和要素
检查。720p 容器高度问题已通过视口约束修复，无需独立 Web surface。

### Task Step 与地图绑定

Phase 7 已通过官方 Connection RPC 将真实 Task Graph execution、Layer Registry metadata
与 canonical map GeoJSON 绑定。Scenario 02 的 lineage、parents、feature count、step
outputs 和浏览器 Layer 高亮均已验证；不再是活跃集成阻塞。

### 六 Scenario 自动回归

Phase 8 已用六个独立 workspace 自动运行全部 Scenario，并通过 capability、required
layers、独立空间 oracle 和 expected statistics 四道门禁。Scenario 05 的修订字段是
Phase 9 的明确阶段边界，不是 Phase 8 阻塞。

### Scenario 05 会话修订

Phase 9 已实现完成图上的局部失效、上游复用、下游重跑、run history、旧 Layer lineage
保留和 active map projection。完整 Harness Web 连续 RPC 验证从 500 m / 4 个候选更新到
1 km / 8 个候选，只有两项下游 step 重跑；不再是活跃阻塞。

## 活跃风险与后续门禁

### 1. 上游源码 CLI 在当前 Node 24 环境中的运行问题

在 Windows、Node.js `v24.19.0` 下，当前提交的源码入口通过 `tsx/esm` 启动
profile 时失败：`apps/cli/src/profile-boot.ts` 从 `@deepseek-ai/cordis` 请求
运行时导出 `FiberState`，但它是被编译内联的 `const enum`，运行时包不导出
该名称。上游构建后的 `apps/cli/lib/bin.js` 工作正常，已用它完成全部真实验证。

GeoHarness 不应直接修改 `../deepseek-harness` 规避此问题。若后续开发必须使用
上游源码 CLI/HMR，应先跟进上游修复或确定稳定的已发布/已构建 CLI 工作流。

### 2. 上游版本升级门禁

骨架精确对齐 DeepSeek Harness `0.1.1-rc.2` 与 Cordis `4.0.1`。升级上游时
必须重新核对 `dsh.bundle`、`dsh.client`、客户端产物协议、Slot 名称和
Service/Tool API，并重跑隔离 profile 验证。

### 3. Demo 数据性质

Phase 2 采用项目自有、CC0-1.0 的确定性 Manhattan-scale 合成 fixture，以保证
离线、快速、可精确回归。它们不是 NYC 官方地籍、道路或水系数据，README 已明确
披露。该选择不阻塞 v1.0 的工作流实现与空间正确性测试；如未来替换为生产级官方
数据，必须重新生成固定统计并更新 Scenario 期望，不能静默替换。

### 4. Python Geo runtime 门禁

Phase 4 已在 Python 3.11、FastAPI 0.135.3、GeoPandas 1.1.4、Shapely 2.1.2、
PyProj 3.7.2 和 Pyogrio 环境中通过测试，没有当前依赖阻塞。其他环境安装时必须满足
`backend/geo-service/pyproject.toml` 的版本范围并重跑全部空间测试，尤其不能只用
mock 替代 GEOS/PROJ 运算。

### 5. 外部模型凭据

Phase 5 隔离 profile 未配置 DeepSeek API Key，因而没有执行会产生外部请求的自然语言
Agent 对话。该条件不阻塞本地 v1.0 开发：当前官方 `SystemPrompt + ToolRuntime` 已真实
注册、校验并执行模型可见 Tool 调用链，完整 Harness Web 也已成功激活 Host 插件。
未来配置凭据后可补充模型规划质量 smoke test，但空间正确性仍必须由确定性 Scenario
回归测试判定，不能依赖模型措辞。

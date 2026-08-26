# GeoHarness Blockers

## Phase 0

没有阻止 Phase 0 完成的活跃问题。最小 Bundle 已被当前上游构建产物成功安装、
组合和服务。

## 后续阶段前需要处理

### 1. GeoHarness 客户端构建链

Phase 0 的 `client.js` 是手工保持最小的预构建 lazy-CJS factory。上游的
`packages/client/tsdown.client.ts` 是仓库内部构建设施，不是已确认的外部公共
构建 API。开始正式 UI 前，需要在本仓库建立类型化构建、externals 校验、
source map、watch 和产物测试。这是进入 Phase 1 的工程门槛。

### 2. 上游源码 CLI 在当前 Node 24 环境中的运行问题

在 Windows、Node.js `v24.19.0` 下，当前提交的源码入口通过 `tsx/esm` 启动
profile 时失败：`apps/cli/src/profile-boot.ts` 从 `@deepseek-ai/cordis` 请求
运行时导出 `FiberState`，但它是被编译内联的 `const enum`，运行时包不导出
该名称。上游构建后的 `apps/cli/lib/bin.js` 工作正常，已用它完成全部真实验证。

GeoHarness 不应直接修改 `../deepseek-harness` 规避此问题。若后续开发必须使用
上游源码 CLI/HMR，应先跟进上游修复或确定稳定的已发布/已构建 CLI 工作流。

### 3. 完整 GIS Workspace 的 Slot 适配性

`conversation.view` 与 `shell.overlay` 已确认是安全加法型扩展点，但尚未验证
方案中的完整三栏地图工作区是否能只靠当前 Slot 实现。这个判断必须在后续阶段
以真实地图组件做原型后得出；不能注册到 `root`，因为会遮蔽 Harness AppFrame。

### 4. 上游版本升级门禁

骨架精确对齐 DeepSeek Harness `0.1.1-rc.2` 与 Cordis `4.0.1`。升级上游时
必须重新核对 `dsh.bundle`、`dsh.client`、客户端产物协议、Slot 名称和
Service/Tool API，并重跑隔离 profile 验证。

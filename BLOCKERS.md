# GeoHarness Blockers

## 当前状态

代码实现没有活跃阻塞。Phase 0–10、Native Agent 改造和完整 Agent Stream 均已实现。此前
模型 E2E 的 `Connection error` 已确认是旧 Harness 服务进程的出站网络权限问题，不是 API Key
未配置；服务已在允许联网的进程中重启。尚待下一次真实 Prompt 由 Provider 验证凭据本身并
完成 planning smoke test，详见下方“外部模型连接”。

GIS Agent 平台 v1.0 的 Platform Phase 0–5 已完成，没有活跃代码阻塞。Session Workspace、
四种用户矢量格式导入、canonical 数据/Layer 工作台、Native Session Run Manifest、五类
对话式修订、Result Center 与安全导出已经通过真实格式、边界、安全、恢复和 GeoPandas 验证。
下一阶段是 Tool / Dataset 扩展契约；若 GitHub Actions 远端环境暴露平台差异，按普通 CI
兼容问题修复。

## Phase 0

没有阻止 Phase 0 完成的活跃问题。最小 Bundle 已被当前上游构建产物成功安装、
组合和服务。

## 已解决

### GeoHarness 客户端构建链

Phase 1 已在本仓库建立 TypeScript/React 构建链，并为生成的 lazy-CJS factory、
Harness externals、CSS 注入和产物新鲜度增加测试。GeoHarness 不依赖上游仓库内部的
`packages/client/tsdown.client.ts`。

### 三栏 UI Shell 的 Slot 适配性

当前 Harness 源码确认 `ui-layout` 把完整 AppFrame 注册到公开的 `root` single Slot；其中
才声明 `sidebar`、`conversation`、`details` 和 `shell.overlay` 子槽。旧版 GeoHarness 只接管
`conversation`，所以仍显示会话/项目侧栏。本轮按产品要求改用 `root`、priority `-100` 成为
winner，直接显示 GeoHarness 全页；不再注册上述子槽，也没有修改上游源码。

### 真实矢量地图的 Slot 适配性

Phase 3 曾用嵌入式 Scenario 数据验证地图交互；正式客户端现已移除这些 fixture，改为
`agent/workspace` RPC 的 Registry projection。Layer 显隐、连续透明度、缩放、平移和要素
检查仍由同一地图组件承担，客户端产物测试禁止再次嵌入 Scenario ID/GeoJSON。

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
保留和 active map projection。真实 RPC + TaskGraph + Python/GeoPandas 验证从
500 m / 329 个候选更新到 200 m / 205 个候选，只有两项下游 step 重跑；距离不是预设
枚举，明确数值在合法范围内可由同一链路重算，不再是活跃阻塞。

### 输入驱动的非预设距离

`goal/run` 已将显式距离注入首次 Task Graph execution，而不是先运行 Scenario 默认值。
真实 275 m 用例只生成一轮 initial history，官方 Broadway 数据返回 241 栋，独立 UTM 18N
oracle 确认全部候选位于 275.5 m 容差内；再修订为 200 m 仍只重跑两个下游步骤。当前没有
“距离必须是预设值”的产品阻塞。路由仍按 v1.0 边界限制在七个已验收工作流内。

### Phase 10 真实展示素材

七个 Scenario 已在完整 DeepSeek Harness Web 中分别执行并保存真实截图；由这些截图生成
的 GIF、视频脚本、独立 README 和资产测试均已完成。最终素材测试 7/7 通过，不再有
Demo/文档收尾阻塞。

### 官方真实数据 Demo

补充 Scenario 07 已使用 NYC Open Data 的 133 个 Lower Manhattan 官方建筑轮廓完成
独立 GeoPandas oracle、完整 Harness Web 双次运行、Map Verification 和展示资产验证。
Socrata 对当前 Node fetch 返回 403 的问题通过受约束的 PowerShell 下载器加 Node
规范化流程解决；不是当前阻塞。官方数据会更新，因此刷新快照仍需人工审查统计变化。

### 全场景官方数据与透明度滑块

Scenarios 01–06 已全部改用冻结的 NYC Open Data 快照，原始响应、SHA256、固定查询和
派生脚本均已纳入仓库；Scenario 07 继续使用自己的官方建筑快照。透明度滑块白屏原因是
React 延迟状态更新读取已失效的 `event.currentTarget`，现已在回调内先捕获数值并增加
源码与实际浏览器回归。真实 Centerline 的等距最近邻也已修正为按唯一输入要素计数。

### Windows pnpm / pytest 运行目录

Phase 10 收尾期间，沙箱内 pnpm 因 store 与 ACL 不一致进入高 CPU 忙循环。终止遗留进程
后，使用同一宿主环境的本地 store 执行 `CI=true pnpm install --offline` 恢复全部依赖，
没有网络下载。后续构建和测试统一在该环境运行，问题未复现。

pytest 默认用户临时目录及旧 `.pytest_cache` 也曾因 Windows ACL 导致 7 项测试在 setup
阶段失败。`test:python` 现显式使用仓库内、被忽略的 `.tmp/pytest` 与
根级 `.tmp/pytest-cache`；修复后旧版 Python 7/7、Node 41/41 以及官方数据扩展后的
Python 9/9、Node 45/45 均通过。

本轮 pnpm 在非交互终端首次执行 workspace script 时再次请求确认 modules purge；没有
修改依赖版本或联网绕过。直接使用仓库现有 TypeScript/build 入口完成同一构建与类型检查，
并以 `CI=true pnpm peers check` 验证 peer graph；Node 45/45 和 Python 9/9 随后全部通过。
这是非交互终端提示，不是产品或测试阻塞。

### 动态任务进度与地图交互

当前无代码阻塞。正式 UI 的步骤和 Agent Result 来自原生 Harness Session 的 tool/message/turn
事件，Layer 来自当前 Agent workspace Registry；旧 TaskGraph/partial Map Verification 只保留
为确定性回归。Session history 与 workspace Registry 分属 Harness/GeoHarness 的现有本地运行
模型，持久化分布式任务队列不在 v1.0 范围内。

## 非阻塞限制与后续门禁

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

### 3. Demo 数据更新门禁

七个 Scenario 都使用冻结、带日期的 NYC Open Data 快照。Scenarios 01–06 的未改动下载
响应集中在 `data/official-sources/nyc/`，但各 Scenario 仍保留自己的独立数据副本。
官方数据会更新；刷新时必须重新下载、核对 SHA256/feature count、生成派生数据、运行
独立 GeoPandas oracle 并人工审查固定统计，不能静默接受变化。

### 4. Python Geo runtime 门禁

Phase 4 已在 Python 3.11、FastAPI 0.135.3、GeoPandas 1.1.4、Shapely 2.1.2、
PyProj 3.7.2 和 Pyogrio 环境中通过测试，没有当前依赖阻塞。其他环境安装时必须满足
`backend/geo-service/pyproject.toml` 的版本范围并重跑全部空间测试，尤其不能只用
mock 替代 GEOS/PROJ 运算。

### 5. 外部模型连接

预览实际使用 `.tmp/dsh-home-preview`。Harness 原生设置与 profile 均确认当前 route 是
`ustc / deepseek-v4-flash-ascend1`，所引用的 `USTC_API_KEY` credential 已配置；排查过程中没有
读取、回显或复制密钥值。失败 Session 连续记录六次 `TRANSPORT / Connection error`（五次
retry），而不是 `MISSING_CREDENTIAL`、HTTP 401 或认证失败。

旧服务运行环境中的 Node `fetch` 直接复现 socket `EACCES`。允许出站网络后，PowerShell 与
Node 均能到达相同 Provider Base URL；无凭据请求按预期返回 HTTP 401，证明 DNS、TLS 和 HTTP
路径可用。根因因此收敛为旧 Harness 进程的网络限制。旧进程已停止，并使用相同 profile、
DSH_HOME 与 credential store 在允许联网的进程中重启 31994 服务。

尚未主动代用户产生一次可能计费的模型调用，所以不能仅凭“已配置”断言 Provider 已接受该
API Key。下一次由用户提交真实 Prompt 后，应确认没有新的 `TRANSPORT`/认证错误，并观察模型
自主产生 Geo Tool Call；该验收不能用固定 Scenario fallback 替代。空间正确性仍以确定性
Scenario/oracle 为准，不能依赖模型措辞。

### 6. 左下角原生 Harness 设置入口

已解决，不是活跃阻塞。GeoHarness 不再接管 `root`，也不再通过 Connection API 自制设置页。
当前页面保留 `AppFrame → SidebarRoot → sidebar.settings → SettingsRoot` 的原生装配，真实浏览器
确认左下角“设置”可打开上游完整的通用设置、模型、插件和 Agent 预设页面。GeoHarness 没有
重新声明 `sidebar.settings`，因此不存在重复 Slot 或跨所有权渲染；密钥仍完全由 Harness
credential store 管理。当前外部模型问题继续按上一项单独保留。

### 7. Agent 测试 Prompt 与页面字体

已解决，不是活跃阻塞。测试输入已集中到 `docs/testing/agent-test-prompts.md`，并通过自动门禁确认
不会向 Agent 注入内部 Scenario/Layer 标识。全局字号提高后，1170×912 浏览器验收确认页面
尺寸与 viewport 一致、凭据弹窗在视口内，未出现三栏溢出、地图白屏或输入区截断。

### 8. 右侧原生输入框与模型切换

已解决，不是活跃阻塞。右侧 Agent workspace 底部显示的是上游
`ConversationRoot → conversation.composer.bar/InputBar → conversation.input.model/ModelSelect`，
不是 GeoHarness 仿制组件。GeoHarness 只通过上游稳定的 `data-composer-*` DOM 标记调整 seat
位置。真实浏览器确认输入框、访问模式、模型按钮、发送按钮都位于右栏，模型菜单可打开；
GeoHarness 源码不再调用 `sessions.prompt/models/selectModel`。是否能完成外部推理仍取决于上一项
外部 Provider/网络条件，不能由“菜单可用”推断模型调用成功。最终回归已通过 client build、
typecheck、peer、51/51 Node、9/9 Python 和 `git diff --check`。空会话阶段额外出现的上游
“探索未至之境 / 预览版”Hero 遮挡已通过 `data-phase="hero"` 精确作用域解决，不影响普通会话
或任何原生 composer 控件。

### 9. 项目与历史会话导航

已解决，不是活跃阻塞。此前 GeoHarness 注册 `sidebar.workspaces` 后，左侧只显示 Layers，导致
点击“新建会话”后没有入口返回同一项目中的旧会话。当前插件不再注册该 Slot，项目选择、会话
创建和历史切换恢复为 Harness 原生实现；Layers 已迁移到地图内可收起面板，仍按 Session ID
隔离，不需要在“历史导航”和“GIS 图层控制”之间二选一。

### 10. GIF 中间关键视图与实时步骤录制

多关键帧 GIF 已完成，不是活跃代码阻塞。当前 25/41 帧 GIF 的底图全部来自各 Scenario 已保存的
真实 Harness execution 截图，并通过局部放大、标签和过渡依次展示输入、Plan、Layers、Map 与
Result。内置浏览器的本地 URL 安全策略仍阻止自动重放并重新截取 `127.0.0.1` 的逐 Tool 瞬时
状态，因此本轮没有把裁切视图伪装成新的实时执行截图。构建器已支持 storyboard；未来获得真实
中间截图后只需把 `step-*.jpg` 加入对应 storyboard，无需重做 GIF 管线。

### 11. Platform Phase 2 自动浏览器视觉验收

Phase 2 的预览 Harness 已从当前源码 Bundle 成功启动在 `127.0.0.1:31994`，Host 进程未报告
插件激活错误。按浏览器测试技能连接现有应用内标签页后，刷新该 localhost URL 被当前 Browser
Use URL 安全策略明确拒绝；规则禁止改用其他浏览器自动化或原始 CDP 绕过，所以没有伪造视觉
验收结果。

这是非阻塞的环境限制：导入 UI 已通过 TypeScript、可复现 client build、源码/样式契约测试；
四格式 Python、loopback RPC 与 275 米真实空间 E2E 均通过。用户可在已打开的本地标签页手动
刷新检查布局；后续若 URL 策略允许，再补一轮文件选择器与 1280×720 截图回归。

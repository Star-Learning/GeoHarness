# Native Agent Run Manifest

> 状态：Platform Phase 4 已实现并由官方 SessionStore、Host/Python 与真实 GIS 修订测试验证
>
> Schema：`1.0`

GeoHarness 不建立第二套聊天、Planner 或 LLM 运行时。Host 订阅当前 DeepSeek Harness
`SessionStore` 的 append-only `session/event`，把真实用户轮次投影成可恢复的 Run Manifest：

```text
user/message(source.kind=user)
→ turn/start
→ request/header / request/context
→ tool/call ↔ tool/result
→ assistant/message
→ llm/retry / turn/end
→ runs/run-turn-NNNN.json
→ workspace.json runs[]
```

正式页面的流式文本仍直接来自 Connection `sessions.history`；Run Manifest 只保存结构化执行摘要，
不替代原生 Session，也不保存 `assistant/chunk` 中的隐藏 reasoning。

## Schema

每个真实 user turn 对应一个稳定的 `run-turn-0001` 文件，至少包含：

- `session_id`、`turn`、`user_goal`、对应 event seq 和开始/结束时间；
- `provider` / `model`，来自 `request/header.config` 或 `request/context`，不含 credential；
- 每个 Tool 的 call ID、name、状态、arguments、输入/输出 canonical Layer ID、summary、warnings
  和经过 Tool output schema 校验的结构化 `result_data`；
- 本轮所有 input/output Layer、外部复用 Layer 和本轮新 output Layer；
- 最终 `assistant/message` 的 event seq 与可见文本；
- Provider、Tool、Data 三类 error，以及 Harness retry 摘要；
- `max_event_seq`，用于页面判断持久投影是否追上实时 Session。

`request/header` 在 Harness 中只有初次、resume 或模型变更时写入，因此 projector 会继承当前有效
route 到后续 turn。它不会臆造模型状态，也不会把 API Key、环境变量或系统 Prompt 写入 Run 文件。

Platform Phase 5 以 `result_data` 和 canonical Registry 构建结构化 Result Center；完整权威来源、
terminal Layer 判定与安全下载契约见 [`result-center.md`](result-center.md)。

## 持久化与恢复

GeoHarness Bundle 现在显式依赖当前 Harness 的 `sessions` Service。projector 监听
`session/event`，在 Tool、最终回答、retry 和 turn 结束时异步写入；`session/flush` 会等待当前
Workspace 的投影队列，因此原生 Session durability checkpoint 与 GIS Run 文件不会脱节。

Python `AgentRunManifest` schema 在落盘前再次校验版本、Session 身份、字符串边界、状态、错误分类
和 event seq。`agent/runs` RPC 只读取当前 Session Workspace 下通过 schema 的 Run；Phase 1 遗留
的通用测试 Run 仍可保留在资产索引中，但不会伪装成 Native Agent Run。

页面在 Agent workspace 中显示最近三个 Run 的 `Executed / Reused / New outputs`、Tool 状态和错误
分类。刷新或重新打开会话后这些摘要从 `runs/` 恢复，地图和 Layer 仍以 Registry projection 为准。

## 并发一致性

Run 投影和 GIS Tool 都会写 `workspace.json`。Platform Phase 4 的真实并发测试曾捕获两个 Python
进程并发更新导致 export index 丢失，因此 `LocalPythonGeoProvider` 现在按 Workspace 建立请求队列：

- 同一 Session 的 Tool、Run、Import、Export 和 Projection 串行；
- 不同 Session 继续并行；
- 等待期间收到 AbortSignal 的请求会在轮到执行前 fail closed。

该规则避免原子替换只能防“半文件”、却不能防“完整旧快照覆盖完整新快照”的丢更新问题。

## 五类真实修订验收

同一 Native Harness Session 通过用户上传路径导入冻结的 NYC Buildings、Roads、Rivers，没有激活
Dataset/Scenario router，并逐轮调用真实 GIS Tools：

| 修订 | 可核查 Tool 参数/结果 |
| --- | --- |
| 距离 275 m → 200 m | `create_buffer.distance=200`；`within` 建筑 228 → 188 |
| 谓词 `within` → `intersects` | `spatial_filter.predicate=intersects`；188 → 205 |
| 属性值修改 | `road_class=other_four_plus_lane`；真实筛出 242 条道路 |
| 输出 GeoJSON → CSV | 两个 export asset 都存在且 CSV 为 205 行 |
| 追加河流排除条件 | 复用 205 个道路候选，新增 800 m river buffer + `disjoint`；结果 14 |

独立 Python GeoPandas oracle 使用原始官方快照直接计算同样的 `within`、`intersects`、属性相等与
`disjoint`，不读取 Agent 文本或 Tool Result 作为期望值。每一轮的新 output ID 都必须存在于最终
canonical Registry projection；Run Manifest 明确区分复用输入与本轮输出。

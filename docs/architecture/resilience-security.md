# 稳定性、安全与性能边界

本文记录 GeoHarness Platform Phase 7 已实现并由自动化验证的运行边界。它描述当前代码事实，
不是未来设计草案。

## 1. Session Workspace 隔离

Host 只接受 1–120 个字符的 Session ID（字母、数字、`:`、`.`、`_`、`-`，并拒绝 `.` 与
`..`）。已经是安全文件名的 ID 保持原值；包含 `:` 等允许但不适合作目录等价映射的 ID 会使用
`安全前缀--SHA256前12位`。因此 `browser:alpha` 与 `browser-alpha` 不会再映射到同一目录。

Provider 在解析后的 Workspace 根目录上再次做父子路径检查。Python `workspace.json` 同时保存
`workspace_id` 与原始 `session_id`，身份不匹配时拒绝加载。相同 Workspace 的请求串行执行，
不同 Session 使用独立队列并可并发运行。

## 2. 文件、ZIP 与 Layer 限制

| 边界 | 默认值 | 硬上限/行为 |
| --- | ---: | --- |
| 浏览器上传 | 20 MB | 最多配置为 100 MB；Base64 解码前后均检查 |
| ZIP 条目 | 512 | 拒绝空包、路径穿越、绝对路径、盘符、符号链接和非 Shapefile 文件 |
| ZIP 压缩比 | 200:1/单文件 | 解压总量同时受上传大小与 200 MB 上限约束 |
| 单 Layer 要素 | 100,000 | 最多配置为 2,000,000；写盘前拒绝 |
| 单 Layer canonical GPKG | 256 MB | 最多配置为 1 GB；临时快照超限即删除 |
| 单 Workspace Layer | 128 | 达到上限后拒绝注册 |
| 属性页 | 100 行、200 字段 | 支持 `offset`；单个文本值截断到 500 字符 |
| 单 GeoJSON 页 | 10,000 要素、2 MB | 最多请求 100,000 要素/8 MB；地图 RPC 固定为 2 MB |
| 地图 Workspace 投影 | 3 MB | 在当前 Layer 间分配预算，返回有界预览而非整库复制 |
| Result 下载 | 20 MB | 必须是当前 Workspace 已索引资产，并校验大小与 SHA256 |

上传先进入 `imports/.<asset>.staging`。只有格式、CRS、几何和大小校验完成后才原子迁移到正式
目录并注册 Layer；任何异常都会删除 staging、正式导入目录和已注册 metadata。导出同样先写
`exports/.<name>.<uuid>.tmp.<ext>`，成功后才由 `os.replace` 替换最终文件。

## 3. 分页 GeoJSON 契约

`LayerRegistry.geojson(layer_id, offset, limit, max_bytes)` 仍返回标准 `FeatureCollection`，并增加
一个不会影响普通 GeoJSON 消费者的 `geoharness` 成员：

```json
{
  "schema_version": "1.0",
  "offset": 0,
  "limit": 10000,
  "returned_features": 360,
  "total_features": 360,
  "truncated": false,
  "next_offset": null,
  "byte_limit": 2097152,
  "size_bytes": 123456,
  "bbox": [-74.0, 40.7, -73.9, 40.8],
  "skipped_oversize_feature": false
}
```

Host 的 `layer/geojson` RPC 接受安全的 `offset` 与 `limit`。地图投影用 `total_features` 对照
Registry metadata，并用 `returned_features` 对照本页 `features.length`；截断不再被误判为数据
损坏。完整分析和统计始终读取 canonical GPKG，预览截断不会改变 Tool 结果。

## 4. Tool 幂等与失败回滚

语义 `step_id` 只用于 Layer lineage；幂等键使用本次 Harness `callId`，确定性 Task Graph 则为
每次执行尝试生成唯一 `request_id`。Python 在 `tool-executions.json` 中原子保存请求 SHA256 与
`ToolResult@1.0`：

- 同一 request ID、同一 Tool 和参数会直接重放结果，不创建第二个 Layer；
- 同一 request ID 的 Tool 或参数变化会以 idempotency conflict 拒绝；
- 对话修订保留语义 step lineage，但使用新 request ID，因此 500 米改 200 米可正常重算；
- 索引最多保存 1,000 次执行，Workspace reset 会一并清除。

Runner 在 Tool 边界前记录现有 Layer ID。若 Tool 返回失败或边界内抛出异常，本次新出现的
canonical snapshot 与 registry metadata 会被回滚，随后重新同步 `workspace.json`。Layer 注册、
Registry JSON、Workspace JSON、Run JSON和导出都使用临时文件加原子替换。

## 5. 超时、取消与进程退出

每个 Python 请求使用独立子进程。Provider 默认 120 秒超时，可在 100–600,000 ms 范围配置；
Harness Tool catalog 仍声明各 Tool 自己的 120 秒超时。以下情况都会终止子进程、移除
Abort listener/timer，并从 active process 集合释放：

- `AbortSignal` 取消；
- Provider 独立超时；
- stdout/stderr 合计输出越过 4M 字符边界；
- Python 非零退出、无效 JSON或结构化 backend error；
- stdin/spawn 错误。

相同 Workspace 的失败 Promise 不会阻塞后续队列项；独立 Session 不受该失败影响。

## 6. 结构化诊断导出

右侧 Agent Workspace 的“导出结构化诊断”调用 loopback-only `diagnostics/export`。返回的 JSON
包含 Node 平台、Workspace 资产计数、Provider 可用性、配置限制和最近 200 次请求中的本 Session
记录。每条记录只保存 request ID、Workspace ID、action、时间、耗时、状态、退出码、输出长度和
最多 1,000 字符的错误；不会保存 Prompt、API Key、上传 Base64、Tool 参数、绝对 Workspace
路径或 stdout 正文。下载同时返回字节数与 SHA256。

## 7. 验证

Phase 7 的 Node 测试真实启动可睡眠/异常退出的 Python fixture，验证 timeout、AbortSignal、
进程回收、Session 映射、同 Session 串行和跨 Session 并发。Python 测试使用真实 GeoPandas/
Pyogrio 验证 Layer 数量/存储限制、属性/GeoJSON 分页、恶意 ZIP、失败导出、半成品 Layer 回滚和
重复 Tool 重放。全量既有 Scenario 和独立 GeoPandas oracle 仍须同时通过。

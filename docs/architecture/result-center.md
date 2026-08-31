# Result Center 与安全导出

> 状态：Platform Phase 5 已实现并由 Native Session、Host RPC 与 GeoPandas 自动测试验证
>
> Schema：`1.0`

Result Center 是现有 Agent Stream 的结构化结果视图，不是第二套 Agent 回答生成器。它只消费
已经持久化的 Native Run Manifest、canonical Layer Registry 和 Workspace 资产索引；浏览器不从
自然语言提取数字，也不能提交服务器文件路径。

## 数据链路

```text
Geo ToolResult
  ├── summary / warnings / structured data
  └── inputs / outputs
        ↓ presentationMeta
Native Harness tool/result event
        ↓ Run Manifest projector
runs/run-turn-xxxx.json
        ↓ Python result projection
Registry metadata + Workspace imports/exports
        ↓ loopback result/center RPC
Result Center UI
```

`assistant/chunk` reasoning 不进入 Run Manifest 或 Result Center。最终回答来自
`assistant/message`；Tool 数量、统计、CRS、单位、来源、Layer 和下载资产分别来自下表中的权威
数据源。

| 展示项 | 权威来源 |
| --- | --- |
| 最终回答 | Run Manifest `final_answer` |
| Tool 成功/失败/运行中数量 | Run Manifest `tool_calls[].status` |
| 关键统计 | `tool/result` presentation metadata 中的真实 `ToolResult.data` |
| 输入与最终输出 Layer | Run Tool lineage + Layer Registry metadata |
| CRS | 本轮引用和生成的 canonical Layer metadata |
| 单位 | 真实 Tool arguments 中的 `unit` / `*_m` 参数 |
| 数据来源 | Workspace import index、active Dataset/Scenario、derived lineage |
| 警告 | Tool Result warnings 与 canonical Layer quality checks |
| 导出文件 | Workspace `exports[]` 索引 |
| 可复现记录 | Workspace `runs[]` 索引中的当前 Run Manifest |

## 最终输出判定

Run 中生成但又被后续 Tool 消费的 Layer 视为中间 Layer。没有再被后续分析 Tool 消费的输出是
terminal output；成功 `export_layer` 的输入也作为最终输出展示。该判定只使用 Tool Call 的真实
input/output Layer ID，不声称推断了模型内部计划。

如果历史 Run 引用的 Layer 后来已被安全移除，Result Center 不伪造 metadata，而是显示
`Referenced Layer is no longer available` warning。页面中的 Layer 项可以打开现有 canonical 数据
工作台，继续检查属性和质量。

## 结构化统计

GeoHarness 的 13 个 Tool 已有统一 `ToolResult`。Phase 5 将 `warnings` 与 `data` 加入 Harness
`presentationMeta`，Run projector 原样保存结构化 JSON。Result Center 最多把前 40 个叶子值展开
为只读统计表；统计值不经过 LLM 文本解析。

当前真实回归包括：

- 用户上传建筑数据按 `use=feature_code_2100` 筛选，Tool Result 和 Result Center 均为 357 栋；
- 官方冻结河流/建筑数据做 500 米 `intersects`，独立 Python 结果为 132 栋；
- `height_m` 分布统计直接读取 `analyze_distribution.data.statistics`；
- GeoJSON、GeoPackage、CSV 的实际要素/行数均与 132 或 357 的运行结果一致。

## 安全下载

客户端只发送：

```json
{
  "workspace_key": "current-harness-session",
  "asset_type": "export | run",
  "asset_id": "indexed-safe-id"
}
```

Host 先校验 Session、类型和受限 ID；Python 再从当前 Workspace manifest 查找资产，并验证解析后的
路径仍位于 `exports/` 或 `runs/`。未索引 ID、`../`、其他 Session 的 ID、缺失文件、导出文件
大小与索引不一致都会拒绝。浏览器不能下载 imports、Layer storage 或任意服务器路径。

当前 generic Connection RPC 的单资产下载上限为 20 MB。Result Center 对更大资产显示 `limit`，
Host/Python 不返回其 base64 内容。成功响应包含真实 MIME、字节数和 SHA256；客户端在创建本地
Blob 前再次核对解码字节数。Phase 7 会继续验证全局大小、超时和诊断边界。

## RPC 与恢复

| endpoint | 用途 |
| --- | --- |
| `result/center` | 返回指定 `run_id` 或当前最新 Run 的版本化结果投影 |
| `result/download` | 读取当前 Workspace 中一个已索引、大小受限的 export/run 资产 |

Python runner 对应 `workspace_result` 与 `workspace_download`。Result Center 不写派生状态，刷新页面
或重建 Provider 后会从磁盘 Run、Registry 和 Workspace manifest 重新生成，因此最终回答、统计、
来源、Layer 与导出列表都可恢复。

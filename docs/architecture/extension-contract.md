# Tool / Dataset 扩展契约

> 状态：Platform Phase 6 已实现并由内置 catalog、第三方 fixture Tool 和冲突门禁验证
>
> Schema：`1.0`

GeoHarness v1.0 提供版本化扩展契约，但不实现 Marketplace。目标是让 Dataset/Tool 的能力声明与
Native Harness、Agent Stream、Layer 工作台和 Result Center 解耦：新增符合契约的 Tool 时，不需
在客户端为 Tool 名称增加分支。

## Dataset Catalog

Schema 位于 `bundle/geoharness-bundle/catalog/schemas/dataset-catalog.schema.json`。每个部署
Dataset 使用一个 `<dataset-root>/<dataset-id>/dataset.json`，至少声明：

- `schema_version=1.0`、安全 `id`；
- title、description、region、CRS、license；
- 可选 snapshot date、publisher 与 source audit；
- 1–200 个具备唯一 name、受限相对 path 和 description 的 Layer。

Host `loadDatasetCatalogs()` 读取并校验 catalog，`discover_datasets` 只向模型公开数据能力，不公开
服务器 path。`list_layers.dataset_id.enum` 也从同一组已验证 catalog 生成。Python
`DatasetCatalog` 在真正读取数据前再次校验 schema、未知字段和目录/id 一致性；Layer path 仍必须
解析在受限 examples root 内。

当前 `nyc-core-official` 继续是唯一内置 Dataset。它的原始 `dataset.json` 是注册和文档清单的
共同来源，没有新增预设分析步骤。

## Tool Manifest

Schema 位于 `bundle/geoharness-bundle/catalog/schemas/tool-manifest.schema.json`。一个 catalog
包含版本化 Tool 条目：

```json
{
  "name": "create_buffer",
  "version": "1.0.0",
  "capability": "vector.buffer",
  "description": "...",
  "parameters": {},
  "output": { "contract": "ToolResult@1.0", "creates_layer": true },
  "timeout_ms": 120000,
  "map_effect": "add-layer"
}
```

`map_effect` 只能是 `none`、`add-layer` 或 `export`。Host 用同一 manifest 构造 Harness
`defineTool` 的 name、description、parameters、timeout 和 presentation metadata。内置 13 个 Tool
不再在 `tools.js` 复制一份参数表；其实际 Python 实现名称另有自动 parity test。

完整自动生成清单见 [`catalog-reference.md`](catalog-reference.md)。修改 catalog 后必须运行：

```sh
pnpm run build:catalogs
pnpm run check:catalogs
```

## 第三方 executor

另一个 Host 插件可以读取自己的 manifest，并在同一 Cordis context 调用：

```js
registerGeoTools(ctx, {
  datasetRoot,
  toolCatalogs: [externalCatalog],
  executors: {
    external_tool: async (args, runtime) => ({
      success: true,
      tool: 'external_tool',
      step_id: runtime.stepId,
      inputs: [],
      parameters: args,
      outputs: [],
      summary: 'Verified external result.',
      warnings: [],
      data: { verified: true }
    })
  }
})
```

executor 必须返回 `ToolResult@1.0`。Harness output schema 继续校验 success、inputs、parameters、
outputs、summary、warnings 和 data。extension wrapper 固定最终 `tool` 为 manifest name，并补齐
稳定 step ID；它不能绕过 Tool Runtime 的 timeout、AbortSignal 或 presentation contract。

`tests/fixtures/extensions/fixture-tool-catalog.json` 的 `fixture_layer_note@1.2.0` 已通过真实 Harness
ToolRuntime 执行。Run projector 无需认识该名字就能保存其参数和结构化数据；Agent Stream 仍按
通用 `tool/call` / `tool/result` 展示，Result Center 仍按通用 statistics/output Layer 字段展示。
客户端源码测试明确确认没有写入 fixture Tool 名称。

## 缺失能力与冲突

- Tool catalog schema 不是 `1.0`：激活失败；
- Dataset schema 不是 `1.0`：Host/Python 均拒绝；
- 同名 Tool 不同 semver：报 `Tool version conflict`，不静默覆盖；
- 同名同版本重复：报 duplicate，避免注册顺序决定结果；
- 第三方 manifest 已声明但没有 executor：该 Tool 不注册给模型，进入 `unavailable` 诊断；
- System Prompt 明确列出 unavailable capability 并要求 Agent 告知用户“未安装”，不能编造图层或统计。

这是一套本地扩展契约，不包含远程下载、签名分发、权限审核、自动安装或 Marketplace UI；这些均
不在 v1.0 范围内。

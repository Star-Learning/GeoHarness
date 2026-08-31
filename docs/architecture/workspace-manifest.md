# Workspace Manifest

> 状态：Platform Phase 1 已实现并由 Host/Python 自动测试验证
>
> Schema：`1.0`

GeoHarness 将一个真实 Harness Session 映射为一个持久化 GIS Workspace。Dataset 和 Scenario
只是 Workspace 中当前激活的数据来源，不再参与目录寻址，也不再依赖 Provider 内存状态。

## 目录契约

默认目录为：

```text
.geoharness/workspaces/<safe-session-id>/
├── workspace.json
├── registry.json
├── imports/
├── layers/
├── exports/
└── runs/
```

Host 的 `LocalPythonGeoProvider.workspaceFor(sessionId)` 只使用 Session ID 解析这一级目录。
`load_dataset`、`load_scenario`、后续 Tool、Projection 和 Manifest 请求全部使用同一路径。
Provider 销毁和重建不会改变映射。

安全目录名由 Host 对 Session ID 做字符收敛得到；`workspace.json` 同时保存未经路径化的真实
`session_id`。如果两个输入被收敛成同一个目录，Python 端会核对身份并拒绝第二个 Session，
不会返回第一个 Session 的图层或资产。

## `workspace.json`

Manifest 至少包含：

```json
{
  "schema_version": "1.0",
  "workspace_id": "project-session-id",
  "session_id": "project:session-id",
  "created_at": "2026-08-31T00:00:00+00:00",
  "updated_at": "2026-08-31T00:00:00+00:00",
  "active_dataset": null,
  "active_scenario": null,
  "input_layers": [],
  "derived_layers": [],
  "exports": [],
  "runs": []
}
```

- `input_layers` 索引 Scenario、Dataset 或用户上传形成的 canonical Layer；
- `derived_layers` 索引真实 GIS Tool 生成且带 lineage 的 Layer；
- `exports` 只接受 `exports/` 下已经存在的 GeoJSON、GeoPackage 或 CSV；
- `runs` 只指向 `runs/<safe-run-id>.json`；Platform Phase 4 会用 Native Session 事件填充正式
  Run Manifest；
- `registry.json` 仍是 Layer metadata 权威来源，`workspace.json` 是跨资产索引，不复制矢量内容。

Manifest 使用同目录临时文件、`fsync` 和原子替换写入，调用方不会读取到半段 JSON。每次 Layer
注册、导出、运行记录和数据包激活后同步索引；只读恢复会校验 Pydantic schema 和 Workspace
身份。

## Runner / Host 动作

除已有 `layers`、`projection` 和 `tool` 外，Python runner 提供：

| action | 用途 |
| --- | --- |
| `workspace_manifest` | 恢复并返回当前版本化资产索引 |
| `workspace_record_run` | 将一个受限 Run ID 的 JSON 写入 `runs/` 并建立索引 |
| `workspace_reset` | 清空当前 Workspace 的 canonical Layer、导出、导入和 Run 资产 |

HTTP 开发入口同步暴露只读 `/workspace`。正式 Harness 页面仍经 loopback Connection RPC 和
Provider 访问，不允许浏览器提交任意服务器 Workspace 路径。

## Reset 与隔离

确定性 Scenario 回归仍可使用 `reset: true`，但 reset 只清理已经解析出的当前 Session 目录中的
`layers/`、`exports/`、`imports/`、`runs/` 和 Layer Registry manifest；`workspace.json` 在原位
清空资产索引，不删除 Workspace 根目录或父目录。清理后保留 Workspace 身份与 `created_at`，
再加载新的数据并更新激活来源。

自动测试覆盖：

- Provider 重建后的 Layer、Export 和 Run 恢复；
- Dataset/Scenario 切换不改变 Workspace 根目录；
- 两个 Session 的完全隔离；
- 路径收敛碰撞时 fail closed；
- Manifest 原子写入无临时残留；
- reset 不触碰相邻 Session 的 sentinel 文件。

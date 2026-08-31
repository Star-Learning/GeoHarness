# 数据与 Layer 工作台

> 状态：Platform Phase 3 已实现并由 Python、Host RPC 与客户端契约测试验证
>
> Schema：`1.0`

数据与 Layer 工作台让用户在运行 Agent 之前检查自己导入的数据，也让分析结束后的派生结果能够回到
同一套 canonical Layer 上核查。浏览器只负责展示和交互；metadata、字段、记录、质量统计与图层变更
全部以 Python `LayerRegistry` 和 `workspace.json` 为权威来源。

## 入口与数据流

用户在地图内的 Layers 面板点击任一图层名称后，页面通过已有 loopback-only `/geoharness` channel
读取数据工作台：

```text
Layer row / map feature
→ layer/details RPC
→ LocalPythonGeoProvider
→ LayerRegistry.details(layer_id, limit=100)
→ metadata + fields + rows + quality + warnings
→ Data Workbench
```

没有新建 Web server，也没有把浏览器中的 GeoJSON 临时对象当作属性权威。地图点击会打开对应 Layer
并选中真实 feature index；属性表点击会把同一 index 的 canonical map feature 设为高亮对象。

## 详情响应

`layer/details` 返回：

- Registry metadata：Layer ID、名称、来源、几何类型、CRS、feature count、lineage 与 storage path；
- 最多 200 个非 geometry 字段的名称、dtype 和全表空值数；
- 前 100 条属性记录，每条附加仅供联动的 `__row_index`；
- 总行数、总字段数以及行/字段是否截断；
- null、empty、invalid geometry 数量和 CRS 状态；
- 导入阶段与实时检查阶段合并去重后的 warning。

为避免异常属性拖垮页面，单个字符串预览最多 500 字符；超出内容以 `…` 标记。表格只做有界预览，
不会把“前 100 行”误报成完整数据。空间分析仍读取完整 canonical GeoPackage。

## Layer 变更 RPC

| endpoint | 真实行为 | 约束 |
| --- | --- | --- |
| `layer/rename` | 修改 `registry.json` metadata 并同步 Workspace Layer index | 1–120 个可打印字符；Layer ID 不变 |
| `layer/remove` | 删除没有 downstream dependent 的 canonical Layer，并清理对应上传资产和显示偏好 | 有派生 Layer 引用时 fail closed |
| `layer/preference` | 将 `visible` / `opacity` 合并写入 `workspace.json` | opacity 必须在 0–1；至少提供一个字段 |

Host 对 Workspace key 和 `layer_0001` 形式的 canonical ID 做边界校验。重命名、删除和显示偏好失败都会
返回有界错误，不在浏览器内伪造成功。删除只允许叶子 Layer；如果其他 Layer 的 `parents` 引用了目标，
用户必须先移除 downstream Layer，这样 lineage 不会悬空。

## 显示偏好恢复

`agent/workspace` 会并行读取 Registry projection 与 Workspace manifest，只返回当前仍存在 Layer 的偏好：

```json
{
  "preferences": {
    "layer_0001": { "visible": false, "opacity": 0.3 }
  }
}
```

浏览器投影时优先使用持久化偏好，其次才使用当前页面状态和默认值。Provider 重建、页面刷新或重新打开
同一 Session 后，显隐与透明度都会恢复；另一个 Session 无法读取这些值。

## 已验证边界

- 150 行真实 GeoPackage 只返回前 100 行，同时保留真实总数；
- 205 个属性字段只返回前 200 个，并显式 warning；
- 900 字符属性截断为 500 字符预览；
- null、empty、自相交 invalid geometry 分别计数并提示；
- 重命名在 Registry 重建后恢复；显示偏好在 Provider 重建后恢复；
- 有 dependent Layer 时拒绝删除，移除叶子后 projection 与 manifest 无残留；
- 使用真实 NYC Buildings 上传数据读取 360 个要素、前 100 行和字段，并完成上述完整 RPC 生命周期。

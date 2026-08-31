# 用户矢量数据导入

> 状态：Platform Phase 2 已实现并通过真实格式与空间 E2E 验证
>
> Import schema：`1.0`

GeoHarness 的正式用户数据入口属于现有 `conversation.session`，不创建独立网页，也不把浏览器
内存 GeoJSON 冒充 canonical Layer。导入完成后，同一 Native Harness Agent 通过现有
`list_layers` 发现 Layer ID，并继续调用真实 Geo Tools。

## 真实链路

```text
Browser File picker
→ FileReader + 格式参数 + 读取进度
→ loopback-only /geoharness data/import RPC
→ Host 名称、Session 与请求体上限检查
→ Python import_upload
→ workspace/imports/.staging-*
→ 格式与安全校验 / GeoPandas 读取
→ canonical layers/layer_*.gpkg
→ registry.json + workspace.json
→ agent/workspace projection + Map
→ Native Agent list_layers
```

浏览器只发送文件名、base64 内容与格式选项，不接受或发送任意服务器路径。RPC 继承 Harness
Connection 的 `loopback` authority；Host 将真实 Session ID 注入 Provider，用户不能用上传参数
选择另一个 Workspace。

## 支持格式

| 格式 | 实现行为 |
| --- | --- |
| GeoJSON / JSON | 用 Pyogrio/GeoPandas 读取 FeatureCollection，保留源 CRS 与属性 |
| Shapefile ZIP | 安全解压 sidecar 文件；单 `.shp` 自动选择，多图层用 `source_layer` 指定 |
| GeoPackage | 单图层自动选择，多图层必须用 `source_layer` 指定真实 layer name |
| CSV lon/lat | 指定经度、纬度字段和源 CRS；默认 UI 值为 `longitude`、`latitude`、`EPSG:4326` |

CSV 会把经纬度解析为数值并拒绝无有效坐标的数据。部分坏行被丢弃时，返回真实数量和 warning；
不会静默把 `999` 等越界经度注册为要素。

成功结果返回：

- canonical `LayerMetadata`（ID、名称、CRS、几何、数量、bbox、storage path）；
- 字段名与真实 dtype；
- 选择的 GeoPackage/Shapefile source layer；
- 几何、坐标行与格式 warning；
- `workspace.json` 中对应的 import asset。

## 大小与 ZIP 安全

- 默认单文件上限 20 MB；Bundle `uploadMaxBytes` 可调；硬上限 100 MB；
- Host 在进入 Python 前拒绝超过硬上限的 base64 envelope；Python 以 Provider 配置再次按解码
  字节数校验；
- ZIP 最多 512 个 entry，解压总量受限，单 entry 压缩比不得超过 200；
- 拒绝绝对路径、`..`、Windows drive path、符号链接和非 Shapefile sidecar 文件；
- 每个 extraction target 再次解析并确认仍位于当前 staging 目录；
- 文件名拒绝 `/`、`\\`、控制字符、Windows 保留设备名和不支持的扩展名。

## 原子性与失败清理

导入先写当前 Workspace 的唯一 staging 目录，格式与 CRS 通过后才移动为正式 import asset。
Layer Registry 先写唯一临时 GeoPackage，再原子替换 canonical 文件；`registry.json` 写入失败会
回滚 metadata 与文件。如果 import asset 索引失败，已注册 Layer 会通过受限 `remove` 回滚。
所有失败路径最终删除 staging/final import 目录，因此坏 GeoJSON、超限文件、恶意 ZIP、缺少
CRS 或多图层未选择都不会留下半成品 Layer。

## UI 行为

顶部“导入数据”按钮使用 Harness 现有主题 token。格式相关表单只在需要时出现：

- GeoPackage/ZIP：可填写源图层；
- CSV：填写经度字段、纬度字段和源 CRS；
- 全格式：可修改 canonical Layer 名称。

界面依次显示读取、上传/校验、完成或失败状态。成功后立即重新调用 `agent/workspace`，打开地图
Layers drawer；无需先发一轮对话。上传本身不调用模型，也不读取 Harness API Key。

## 真实验收

Python 测试实际生成并读取 GeoJSON、Shapefile ZIP、双图层 GeoPackage 和带坏坐标行的 CSV，
然后重新打开 Registry/Manifest 核对 canonical 数据。安全测试覆盖路径穿越、ZIP symlink、大小、
坏 GeoJSON与多图层未选择，失败后 Layer 和 import 目录均为空。

Host E2E 把两份真实 NYC Buildings/Roads GeoJSON 作为用户文件传入一个没有 Dataset/Scenario 的
Session。`list_layers` 只发现两个 `source=upload` Layer；随后真实执行 major road filter、UTM 18N
转换、275 米 buffer 和 intersects filter，得到 241 栋建筑。该结果与既有独立空间 oracle 一致，
证明上传链路不依赖预设距离或 Scenario router。

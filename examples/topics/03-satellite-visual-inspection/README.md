# Topic 03：卫星影像视觉巡检 Agent

这个 Topic 可读取 GeoHarness 当前地图视野，或由 Agent 将用户给出的地名交给 Esri World Geocoding
解析候选位置，并由 OpenStreetMap Nominatim 获取可审计的行政区 Polygon/MultiPolygon，再读取对应的
Esri World Imagery RGB 显示瓦片；整个过程不依赖 Workspace 矢量数据。
Native Harness Agent 自主调用 `inspect_satellite_view`，后端最多读取 16 张瓦片，将当前视野裁剪到不超过
768 像素，并以可复现的颜色优势和边缘规则初筛 water、vegetation、built_up、bare_ground。
分析当前定位视野时，用户必须先点击地图工具栏的 `AI` 按钮显式授权；用户在 Prompt 中直接指定地区时，
Agent 会把原始地名作为 `place_name` 交给 Esri 实时解析。若 Nominatim 返回行政边界，GeoHarness 使用
该边界 bbox 获取有界瓦片，并把分类、像素分母和最终 Overlay 严格裁剪到多边形内部；地图以
“缩小当前区域 → 移动 → 放大目标区域”的动画到达边界。若没有可用 Polygon，系统会显式退回有界
Esri 候选视野并报告限制，不会把矩形描述为行政区。

## 真实执行链

```text
当前 Map viewport
→ Session-scoped imagery/view
→ Esri candidate + OSM administrative boundary
→ bounded Esri RGB tiles
→ preview crop
→ Web Mercator boundary rasterization
→ in-boundary pixel classification
→ session Raster Overlay Layer + structured statistics
→ Map + Tool Trace + Result Center
```

原始预览、Overlay 和结构化记录只保存在当前 `.geoharness/workspaces/<session>/imagery`。蒙版作为
会话级 Raster Overlay Layer 出现在 Layers 面板中，支持显隐和透明度并可恢复，但不会伪装成 canonical
矢量 Layer 或进入矢量空间运算。仓库中的 `data/source.json` 记录真实来源、抓取边界和解释限制。
仓库 Demo `media/final.png` 使用公开的纽约视野并隐藏全部矢量显示；本机定位视野的截图、bbox 和
运行影像不会提交到仓库。

## 洪山区真实 Agent 演示

录制输入保持为一句话：

```text
请巡检武汉市洪山区卫星影像，只报告结果，不解释原因。
```

Agent 将地名交给 Esri 实时解析，再取得 OSM relation `3080399` 的 702 点 MultiPolygon，地图从
当前定位区域经过缩小、移动、放大到达 `[114.1669704, 30.3805998, 114.6358804, 30.6957241]`。
Tool 读取 12 张真实 World Imagery 瓦片，将 683×533 RGB 影像裁剪为 108,502 个界内像素；93.8619%
获得初筛类别。最终蒙版 Layer 可显隐和调透明度，录制将它从 72% 调到 62%。原生 1920×1080 源帧
编码为 60 fps H.264 MP4：`media/hongshan-boundary-agent-flow-1080p60.mp4`；审计信息见同名
`manifest.json`，生成视频不进入 Git 历史。

## 解释边界

- 这是 RGB 底图视觉初筛，不是传感器原始产品或科学遥感分析。
- Esri 拼接底图可能混合日期和传感器；不能用于多时相变化结论。
- 结果是显示像素比例，不能换算为真实地表面积。
- 未使用 NIR/SWIR/热红外，不能计算 NDVI、NDWI、NBR 或地表温度。
- 行政区裁剪边界来自 OpenStreetMap 社区数据并遵循 ODbL，不是法定或官方边界来源；正式用途仍需与
  主管部门数据核对。

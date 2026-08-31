# UI 与可视化联动

> 状态：已实现并通过真实 Harness Session 浏览器验收（2026-08-31）

GeoHarness 的界面仍挂载在 DeepSeek Harness 原生 `conversation.session` 内。项目/会话历史、设置、模型
选择和 composer 继续由 Harness 管理；本轮只增强 GeoHarness 自己拥有的地图、Layer、Result Center 与
数据工作台，没有建立第二套 Chat 页面。

## 状态真相源

```text
Native Session events
→ Agent stream / Tool step / Run status
→ canonical Session Workspace
→ Layer Registry metadata + display GeoJSON
→ Step / Layer / Map focus
→ Run Manifest + Result Center
→ verified statistics / provenance / downloads
```

- 运行步骤来自真实 `tool/call` 与 `tool/result`，不是预设 Plan。
- 图层、feature count、CRS、lineage 和属性来自 canonical Layer Registry。
- 结果图和数值条只读取 Result Center 的结构化 Layer/Tool 数据，不从 Agent 文本提取数字。
- 用户选择 Tool step、Layer、结果图层或属性行时，共享同一 Layer ID / feature index 完成高亮。

## 已实现界面

- 顶部与地图内执行状态条同步显示 ready/running/success/failed、当前 Tool 和完成比例。
- Layers 按真实 lineage 分为 Workspace inputs、Intermediate layers 和 Final result layers；lineage 叶子
  才属于最终结果，不依赖图层名称或 Scenario 规则。
- Result Center 提供有界的 Layer feature flow 与结构化数值条形图；超过八个 flow 节点时保留输入和
  最近输出并明确说明省略数量。
- 地图支持鼠标滚轮/按钮缩放、平移、Fit bounds、网格/纯色画布切换、动态 Legend、近似真实距离比例尺、
  CRS/中心坐标、要素检查和运行结果动态框选。
- Layer 面板支持显隐、持久化透明度以及当前页面内的颜色、线宽和语义样式重置。颜色/线宽不写回
  canonical 数据，也不改变空间结果。
- 属性工作台支持前 100 行的本地筛选、字段排序与 map-linked selection；打开工作台时自动收起 Layers，
  并缩窄 Agent 栏为地图表格留出空间。
- CSV 导入在上传前读取有界头部预览，识别逗号/分号/TAB、引号字段和常见经纬度字段；最终校验和注册
  仍由 Host/Python canonical importer 完成。
- “演示模式”通过浏览器 Fullscreen API 放大包含原生 composer 的 Harness conversation surface，退出后
  保持原会话与地图状态。

## 恢复与性能

页面启动时先独立恢复 canonical Workspace，再读取导入能力、Run 和 Result Center。这样已经完成且没有
新 Session 事件的会话在服务重启后仍会恢复地图。常规轮询按 Session event revision 增量刷新，不会每
400 ms 重复生成完整地图投影。

真实“曼哈顿历史建筑更新优先区”会话的浏览器验收结果：

- 约 3.1 秒恢复 15 个 Layer、951 个 registry features 和 847 个实际 SVG display features；
- Legend 显示 7 个最近可见图层并明确提示其余 8 个；
- `bldg_final_district` 的 11 行属性以 `101` 筛为 6 行，点击后表格和地图各高亮一个对应要素；
- Result Center 恢复最终报告与可下载 Run Manifest；拥有结构化 statistics/output layers 的新 Run 会额外
  显示数值图和 feature flow。

## 明确边界

- 当前地图是本地矢量 canvas，不请求外部瓦片；网格/纯色切换不是在线底图服务。
- `visible` 与 `opacity` 写入 Workspace；颜色和线宽仅保留在当前浏览器 Session 的 Layer 投影中。
- 历史 Run 没有结构化 statistics/output layer 时不伪造图表，只展示其真实 final answer 与资产。
- 属性表仍是最多 100 行的有界预览；空间 Tool 始终读取完整 canonical GeoPackage。

## 自动验证

`tests/ui-visualization-polish.test.mjs` 覆盖 feature flow、结构化数值模型、lineage 分组、CSV 预览、比例尺、
样式边界和正式 UI 接线。最终全量门禁为 Node 91/91、Python 37/37，并通过 TypeScript、文档链接、Catalog、
六 Scenario freshness 与 `git diff --check`。

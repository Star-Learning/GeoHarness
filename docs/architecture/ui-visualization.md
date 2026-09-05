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
- Named-place Tool 完成 Esri/OSM 目标解析后，会先原子写入 `imagery/target` 进度快照；客户端不等待
  瓦片获取、像素分类和最终 Tool Result，就从当前显示区域执行“缩小 → 平移 → 放大”的三段式
  3.3 秒动画。到达后先绘制行政区边界，并用阶段进度条/加载动画展示“获取影像 → 区内像素巡检
  → 生成蒙版”；最终结果到达后才替换为 Raster Overlay 与统计卡。
- 默认布局以地图为主视区，Agent 栏保持完整流式输出和原生 composer 所需宽度；会话恢复时 Layers
  drawer 与 Legend 默认收起，避免浮层遮挡底图。输入、中间、最终和当前步骤图层分别使用 32%、
  42%、68% 和 82% 的显示强度乘数，再叠加用户保存的主透明度；该规则只影响浏览器显示，不修改
  canonical Layer 或空间结果。
- Layer 面板支持显隐、持久化透明度以及当前页面内的颜色、线宽和语义样式重置。颜色/线宽不写回
  canonical 数据，也不改变空间结果。
- `inspect_satellite_view` 产生的视觉筛查蒙版作为独立 Raster Overlay Layer 进入同一 Layers 面板。
  它拥有稳定 `layer_id`、来源 Tool、像素尺寸、显隐和 0–100% 透明度；滑条、±10% 按钮和百分比
  读数操作同一主透明度。Host 将其显示设置写入当前 Session Workspace，页面刷新后恢复，地图中的
  Overlay 实际 opacity 与面板读数保持一致。
- Named-place 属于行政区且 Nominatim 返回 Polygon/MultiPolygon 时，地图绘制白色行政区边界并压暗
  区外底图；后端用同一边界生成抗锯齿像素 Mask，区外像素既不会着色，也不会进入类别比例分母。
- 属性工作台支持前 100 行的本地筛选、字段排序与 map-linked selection；打开工作台时自动收起 Layers，
  并缩窄 Agent 栏为地图表格留出空间。
- CSV 导入在上传前读取有界头部预览，识别逗号/分号/TAB、引号字段和常见经纬度字段；最终校验和注册
  仍由 Host/Python canonical importer 完成。
- “演示模式”通过浏览器 Fullscreen API 放大包含原生 composer 的 Harness conversation surface，退出后
  保持原会话与地图状态。

## Agent Markdown 输出

Agent Stream 不再把模型文本作为带 `white-space: pre-wrap` 的普通段落直接显示。客户端将标题、段落、
有序/无序列表、粗体、斜体、行内代码、代码块、引用、安全链接和 Markdown 表格解析为 React 元素；
因此 `#`、`**`、反引号与表格竖线不会在完整消息中作为格式源码残留。解析器不使用
`dangerouslySetInnerHTML`，模型输出中的 HTML 始终被 React 转义，链接只接受显式 Markdown 中的
`http(s)` 或 `mailto`。流式消息尚未闭合的标记可能短暂以文本出现，block 完成后会立即收敛为格式化结果。

## 空会话定位

- 只有在 canonical Workspace 已恢复完成且确认没有 Layer 时，地图才会请求浏览器定位；已有分析图层的
  历史会话不会被电脑位置覆盖。
- 权限为 `granted` 或首次 `prompt` 时，新会话会自动发起一次高精度定位请求，最长等待 30 秒；拒绝、
  不可用和超时都会显示可重试的明确状态。
- 定位成功只在当前浏览器内保存坐标、精度圆和视野，不写入 Session Workspace、Layer Registry、RPC
  或 Agent 输入；当真实分析 Layer 到达时，地图自动切换到数据范围。
- Windows 桌面环境还必须在“隐私和安全性 → 位置”开启系统位置与桌面应用访问权限。应用只诊断并提示，
  不会修改操作系统隐私设置。

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

- 地图默认按当前视野请求 Esri World Imagery 在线卫星瓦片，并以同一 Web Mercator 投影叠加 canonical
  GeoJSON；用户可以切换为不请求网络的网格或纯色画布。卫星影像只作为显示底图，不进入 Layer
  Registry、空间 Tool 或结果统计；网络失败时本地画布仍可用。
- RGB 视觉巡检蒙版是 Session 级 Raster Overlay Layer，而不是底图也不是 canonical 矢量 Layer；它
  参与地图显示和 Layer 计数，但不参与矢量空间运算、feature count 或测地面积统计。
- 行政区边界来自 OpenStreetMap Nominatim，带 OSM attribution 与 ODbL 链接；它是真实社区维护边界，
  不是法定/官方边界数据，正式用途必须与主管部门数据核对。服务无 Polygon 或请求失败时明确退回
  有界 Esri 候选视野，不会把矩形标成行政边界。
- canonical Layer 与 Raster Overlay Layer 的 `visible`、`opacity` 都写入 Workspace；矢量颜色和线宽
  仅保留在当前浏览器 Session 的 Layer 投影中。
- 上述 role-aware 显示强度是地图合成规则；Layer 面板中的 `opacity` 仍是持久化的主透明度。
- 历史 Run 没有结构化 statistics/output layer 时不伪造图表，只展示其真实 final answer 与资产。
- 属性表仍是最多 100 行的有界预览；空间 Tool 始终读取完整 canonical GeoPackage。

## 自动验证

`tests/ui-visualization-polish.test.mjs` 覆盖 Markdown 结构/HTML 转义边界、feature flow、结构化数值模型、
lineage 分组、CSV 预览、比例尺、样式边界和正式 UI 接线；`tests/browser-location.test.mjs` 覆盖权限决策、
高精度请求、视野边界、错误分类与客户端隐私边界；`tests/satellite-visual-inspection-topic.test.mjs` 覆盖
渐进 target 快照、并发只读 RPC、蒙版图层、地名解析和地图接线。真实洪山区会话已观察到加载卡，
随后恢复 OSM 边界、Raster Overlay 和结构化统计；历史含 Markdown 表格的 Agent 输出渲染为真实 `<table>`。

## 2026-09-05：布局与洪山区发布版

- 地图、Agent 工作区、原生 composer 共用实测列宽；图像画布与底部统计卡分区，不再互相覆盖。
  报告滚动区按原生 composer 实际高度预留空间。保留原生模型选择、项目、历史会话和设置入口。
- Agent 输出提升字号并跟随流式内容；用户向上阅读时暂停自动跟随。结果下载、诊断与历史默认折叠。
- 演示模式改用 CSS 布局，不依赖浏览器 fullscreen；禁止外层滚动，避免输入焦点把标题推到画面外。
  空会话演示使用公开纽约起始视野，隐藏电脑定位。普通模式定位行为不变。
- 低分辨率全球概览瓦片作为飞行动画的底层，避免详细瓦片换级时短暂出现空地图；它不参与分析。
- 地名解析后立即发布 target；行政区 bbox 更新不再取消正在进行的三段飞行。
- 关键修复：canonical Run/Result/Workspace 读取不再被 native history 轮询 `await`。
  它们独立刷新并避免工具运行期间主动排队，影像 target 的只读并发路径保持畅通。
  最终实录已观察到工具仍 running、地图已到达且显示 30% 真实处理进度。
- 会话可显式导入 `imagery/place-cache.json`。精确地名匹配、来源/时间/几何校验通过后才使用；
  不扫描其他会话，不复用影像或分类，不对未命中的地名套用缓存。UI、Tool warnings 和结果记录均披露缓存。
  `scripts/export-imagery-place-cache.mjs` 只从指定真实历史记录提取地名与边界；缓存分发仍需核对源数据许可。

1920×1080 演示验收：地图画布底部 y=893，统计卡顶部 y=910；Agent 滚动区底部 y=911，
composer 顶部 y=930。普通 1280×800 窗口亦核查了面板和输入区布局。原生模型菜单、蒙版显隐、
滑条键盘调整、52% 不透明度和最终表格均通过真实页面验证。

发布包见 [洪山区 2026-09-05 实录](../../examples/topics/03-satellite-visual-inspection/media/hongshan-publish-20260905.md)。

## 2026-09-05：连续地图飞行

- 相机在 Web Mercator 空间插值中心，并按对数比例插值缩放；五次缓动让起落速度和加速度归零。
  平移与两端缩放重叠，中间不再经过三次独立启停。距离和缩放跨度决定 2.8–7.6 秒航程；已到达
  或很近的目标只做 0.9 秒直接调整，不绕行。动画仍由 `requestAnimationFrame` 驱动。
- 出发时把当前 pan/zoom 换算为等效相机，避免先重置再飞。地名候选范围到真实行政边界的微调
  使用 850 ms 平滑过渡；减少动态效果设置下直接定位。会话切换/卸载会取消动画与后续计时器。
- 详细瓦片按稳定 source key 保留最近最多 128 张，旧瓦片与全球概览继续铺底；新瓦片加载后
  320 ms 淡入。保留瓦片每帧重新投影，不携带旧屏幕坐标；内存上限不随飞行距离累积。
- 飞行到达提示只淡出，不再带改变位置的 transform。边界未展示时不逐帧生成其复杂 SVG 路径。
- 回归使用真实洪山区 OSM 702 点边界，覆盖三种航程、60 Hz 时间采样的中心位移/缩放变化、
  接段速度连续性、pan/zoom 等效、边界微调、极区相机以及瓦片坐标与缓存上限。
  这些是算法/集成测试，不是浏览器实际帧率实测；旧 8 fps 素材导出的 MP4 未重新录制。

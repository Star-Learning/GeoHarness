# GeoHarness 七个独立 Agent 视频 Prompt

> **文档状态**：录屏输入与素材生产约定，不属于运行时技术契约。

每个 Scenario 的录制输入保存在各自的 `media/agent-video-prompt.md` 中。录制遵守：

```text
一个示例 = 一个独立 Harness 会话 = 一套真实数据 = 一次真实 Agent 执行 = 一个 1920×1080 MP4
```

| Scenario | Prompt | 会话轮数 |
| --- | --- | ---: |
| 01 Building Data Inspection | [Prompt](../../examples/scenarios/01-building-data-inspection/media/agent-video-prompt.md) | 1 |
| 02 River Building Query | [Prompt](../../examples/scenarios/02-river-building-query/media/agent-video-prompt.md) | 1 |
| 03 Statistics by District | [Prompt](../../examples/scenarios/03-building-statistics-by-district/media/agent-video-prompt.md) | 1 |
| 04 Road Accessibility | [Prompt](../../examples/scenarios/04-road-accessibility/media/agent-video-prompt.md) | 1 |
| 05 Parameter Revision | [Prompts](../../examples/scenarios/05-parameter-revision/media/agent-video-prompt.md) | 2（同一会话） |
| 06 Multi-Constraint Selection | [Prompt](../../examples/scenarios/06-multi-constraint-selection/media/agent-video-prompt.md) | 1 |
| 07 Official NYC Building Inspection | [Prompt](../../examples/scenarios/07-official-nyc-building-inspection/media/agent-video-prompt.md) | 1 |

这些 Prompt 只描述用户目标、验收输出和必须保留的动态参数，不包含 expected-result 数字、
内部 Layer ID、Tool 调用顺序或 Task Graph。Agent 必须自主发现数据并根据真实 Tool Result 作答。

## 统一录像节奏

1. 以空会话和空地图开场，展示模型选择与完整 Prompt；
2. 发送后保留右侧 Agent Stream、Reasoning、retry 和 Tool Trace 的真实动态变化；
3. 每个 Tool Result 产生图层时，展示左侧 Layer、中央地图与右侧成功状态同步更新；
4. 关键派生图层出现后使用地图 fit、滚轮缩放和必要的平移/要素检查；
5. 结束时停留在最终 Agent 回答、全部 Tool 状态与地图结果，便于核对数量、单位和 CRS；
6. Scenario 05 在同一会话完成 500 米到 200 米的第二轮修订，其他 Scenario 各用一个全新会话。

视频输出约定为各 Scenario 的 `media/agent-demo-1080p.mp4`，H.264、1920×1080、30 fps、
`yuv420p`，同时保留录制 manifest 记录会话、Prompt、起止时间、帧数和最终状态。

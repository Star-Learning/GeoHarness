# GeoHarness 开发文档

本目录把“规划目标”“当前实现事实”“测试验收”和“发布素材”分开存放，避免早期方案中的示意接口与当前 DeepSeek Harness 实现混淆。

## 推荐阅读顺序

1. [GIS Agent 平台 v1.0 开发文档](planning/geoharness-platform-v1.0.md)：当前主开发计划、平台范围、Phase 和验收矩阵。
2. [GeoHarness 最初产品与实施方案](planning/GeoHarness_Agentic_GIS_方案_v1.0.md)：理解初始目标、Scenario 原则和已完成的原始 Phase 规划。
3. [DeepSeek Harness 真实集成方式](architecture/harness-integration.md)：查看当前上游版本、Bundle、Slot、Service、Tool、Session 与 Web 的真实接入方式。
4. [Workspace Manifest](architecture/workspace-manifest.md)：查看 Session 持久化目录、资产索引、恢复与安全清理契约。
5. [用户矢量数据导入](architecture/user-data-import.md)：查看四种格式、loopback 上传、大小限制、ZIP 安全和 canonical 注册契约。
6. [数据与 Layer 工作台](architecture/data-layer-workbench.md)：查看 canonical metadata、属性预览、质量检查、选择联动和 Layer 生命周期。
7. [Geo Tool 契约](architecture/tool-spec.md)：查看 Geo Backend、Layer Registry、工具输入输出与 CRS 规则。
8. [Native Agent Run Manifest](architecture/run-manifest.md)：查看 Session 事件投影、运行恢复、错误分类和五类通用修订。
9. [Result Center 与安全导出](architecture/result-center.md)：查看权威统计、来源、最终 Layer、三格式导出与受限下载。
10. [Tool / Dataset 扩展契约](architecture/extension-contract.md)与[自动生成 Catalog 清单](architecture/catalog-reference.md)：查看 schema、第三方 executor、缺失能力和版本冲突门禁。
11. [稳定性、安全与性能边界](architecture/resilience-security.md)：查看文件/Layer 上限、分页、幂等、回滚、进程退出和诊断导出。
12. [Task Graph](architecture/task-graph.md)、[地图验证](architecture/map-verification.md)和[对话式修订](architecture/conversational-revision.md)：理解确定性回归 DAG、Step/Layer/Map 绑定和局部重算。
13. [Scenario 回归门禁](testing/scenario-regressions.md)与[Agent 测试 Prompt](testing/agent-test-prompts.md)：执行自动化和人工端到端验收。

安装与普通使用请先看仓库根目录的 [README](../README.md)；当前开发进度和已知问题分别记录在 [PROGRESS](../PROGRESS.md) 与 [BLOCKERS](../BLOCKERS.md)。

## 目录职责

| 目录 | 内容 | 权威性 |
| --- | --- | --- |
| `planning/` | 产品方案、版本范围、Phase 计划和历史设计基线 | 表达目标；不作为当前 Harness API 依据 |
| `architecture/` | 已由源码、运行时和测试确认的集成方式与技术契约 | 当前技术参考；升级上游后需要重新验证 |
| `testing/` | 自动回归说明、人工 Agent 验收输入与测试规则 | 当前验收参考 |
| `media/` | 录屏 Prompt、视频方案和社交媒体文案 | 发布素材；不作为开发规范 |

## 文档事实优先级

遇到描述不一致时，按以下顺序判断：

1. 当前代码、自动化测试和真实运行结果；
2. `architecture/` 中标注为当前实现的文档；
3. `planning/` 中的版本目标与原始方案；
4. `media/` 中为传播而简化的说明。

`PROGRESS.md` 与 `BLOCKERS.md` 是开发流水记录，保留在仓库根目录，便于每个 Phase 更新和审阅；它们不替代稳定的架构文档。

## 新文档放置规则

- 新的版本方案或尚未落地的设计放入 `planning/`。
- 已经实现并验证的系统边界、接口和数据契约放入 `architecture/`。
- 测试矩阵、回归门禁、验收输入和验证方法放入 `testing/`。
- 宣传文章、视频脚本、录屏 Prompt 和平台文案放入 `media/`。
- 只属于某个 Scenario 的 Prompt、数据来源、预期结果和素材继续放在 `examples/scenarios/<id>/` 内，不搬到这里。
- 只属于某个代码包的使用说明保留在对应包内，例如 `backend/geo-service/README.md` 和 `bundle/geoharness-bundle/README.md`。

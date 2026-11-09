# 按需知识抽取与发布

## 流程

1. `POST /api/knowledge/tasks` 请求体必须包含 `documentId` 与 `confirmCost: true`；可选 `maxChunks`（默认 4，最大 8）。接口只接受当前 viewer 可见且 `status=parsed` 的文档。
2. 后端按 `chunk_index` 取真实 `document_chunks`，发送 `chunkId/page/text` 给 OpenAI 兼容 Qwen 接口，要求严格 JSON 输出。
3. 校验器拒绝非对象 JSON、未知/缺失字段、空名称/类型/关系、非法 group、非 0–1 置信度、重复实体/关系、未指向已输出实体的关系以及不属于本次输入的 `evidenceChunkId`。
4. 校验成功前全部数据留在事务内；失败任务只保存任务状态与错误信息，绝不产生可查询的 published 图数据。
5. owner 通过 `GET /api/knowledge/tasks/:id` 审阅实体、关系与逐条证据，再调用 `POST /api/knowledge/tasks/:id/publish` 人工发布。失败任务可调用 `POST /api/knowledge/tasks/:id/retry`，同样必须 `confirmCost: true`。
6. `GET /api/knowledge/graph` 返回 published 图；匿名仅能读取 public，登录用户读取 public/own/team，管理员默认不读取他人 private。

## API

- `GET /api/knowledge/tasks?status=draft|published|failed`：当前 owner 任务。
- `POST /api/knowledge/tasks`：按需抽取，禁止批量调用。
- `GET /api/knowledge/tasks/:id`：owner 审阅草稿、失败原因和证据。
- `POST /api/knowledge/tasks/:id/publish`：确认发布。
- `POST /api/knowledge/tasks/:id/retry`：失败后重试。
- `GET /api/knowledge/graph`：按文档可见性读取真实图谱。

## 存储

- `knowledge_extraction_tasks`：任务、owner、`draft/published/failed`、模型、最大 chunk 数、尝试次数与错误。
- `knowledge_entities`：实体、归一化名称、类型、分组、摘要、置信度及 document/chunk/page 来源。
- `knowledge_relations`：关系、置信度及 document/chunk/page 来源。
- `knowledge_evidence`：实体/关系与 chunk 原文的追溯记录。

表结构由本模块的 `openDatabase()` 使用 `CREATE TABLE IF NOT EXISTS` 初始化，不修改共享迁移。

## 前端与验收边界

- 文档详情的“知识抽取与发布”面板复用上述 API。只有勾选本次在线模型调用与费用确认后才能提交；切换文档或账号会清空页面内任务状态。
- 草稿展示模型、分块数、尝试次数、实体、关系、置信度和原文证据，必须点击“核对无误，发布到星图”后才进入真实图谱。
- 知识星图默认请求 `/api/knowledge/graph`；“交互演示”是显式独立数据源，不会在真实请求失败或为空时自动替换演示数据。
- 本轮浏览器验收只确认费用确认门槛和界面状态，没有调用在线抽取模型。严格 JSON、证据、发布和权限回收由模型替身的 Vitest 覆盖，不能据此宣称真实 Qwen 抽取已经验收。

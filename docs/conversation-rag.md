# 会话式 RAG 与流式回答

## 账号隔离

- 会话保存在 `conversations`，通过 `owner_id` 关联当前用户；消息保存在 `conversation_messages`，通过会话外键级联删除。
- 创建、列表、详情、重命名、删除和读取消息都以 `getCurrentViewer()` 的账号 ID 过滤。跨账号访问统一返回 404，不泄露会话是否存在。
- 表结构由会话模块在首次打开数据库时 `CREATE TABLE IF NOT EXISTS` 幂等初始化，不修改共享迁移。
- 列表最多 100 个会话；每个会话一次最多返回 50 条消息；问题、标题、回答和来源原文均按固定上限截断，来源最多保存 12 条。

## 会话 API

- `GET /api/conversations`：返回 `{ conversations: ConversationSummary[] }`。
- `POST /api/conversations`：JSON `{ title?: string }`，返回 201 和 `{ conversation }`；空标题会创建“新会话”，标题压缩空白并截断到 120 字符。
- `GET /api/conversations/:id`：返回本人会话摘要。
- `PATCH /api/conversations/:id`：JSON `{ title: string }`，重命名本人会话。
- `DELETE /api/conversations/:id`：删除本人会话和级联消息，返回 `{ deleted: true }`。
- `GET /api/conversations/:id/messages?limit=1..50`：按时间正序返回最近 N 条消息。
- 未登录返回 401；所有写接口保持既有同源校验。

## 问答 API

`POST /api/corpus/ask` 保持 JSON 兼容：

```json
{ "question": "…", "conversationId": "optional-conversation-id" }
```

返回 `{ answer, sources, model, usage, grounded, messageId }`。未传 `conversationId` 时保持旧行为：仍检索并回答，但本次结果不落入会话历史，因此无 `messageId`。传他人会话 ID 返回 404。无证据时直接返回固定拒答文案，不请求模型。

带 `Accept: text/event-stream` 时，请求体相同，服务端以 `stream: true` 调 OpenAI 兼容 `/chat/completions`，并转发以下事件：

- `meta`：`{ type, messageId, conversationId }`
- `sources`：`{ type, sources }`
- `delta`：`{ type, text }`
- `done`：`{ type, messageId, status, model, answer, sources }`
- `error`：`{ type, code, detail, messageId }`

SSE 错误不会伪装成功。上游 HTTP 错误、空回答保存为 `failed`；客户端中断或超时保存为 `incomplete`。中断时请求 `AbortSignal` 会级联到上游 fetch；若已有部分文本，则保存该部分并把状态置为 `incomplete`。

## 历史与来源安全

消息保存问题、回答、来源 JSON、模型、grounded、状态、错误、创建和完成时间。读取历史时重新计算当前用户可见文档；仍可见的来源返回标题、URL、页码、命中词和原文；不再可见的来源仅保留 `documentId/chunkId/available:false/accessDenied:true`，标题、URL、机构和原文置空。旧回答本身仍保留，用于审计与个人上下文，但不会重新返回不可见来源原文。

## 取消与重试语义

- 取消：客户端中断 SSE 或 JSON 请求的 `AbortSignal`；服务端同步中断上游模型请求并持久化 `incomplete`。
- 重试：重新调用 ask 并传入相同 `conversationId`，生成一条新的消息记录；历史中失败/未完成记录会保留，客户端可根据 `status` 与 `error` 提示重试。
- 中断恢复：读取历史时，超过 100 秒仍为 `pending` 的消息会标记为 `incomplete`，避免服务重启后永久显示“回答中”。90 秒上游超时通常会更早结束请求。

## 前端工作区

- 完整研究助手提供账号隔离的历史列表、新建、重命名、删除和最近 50 条消息恢复；首页紧凑助手复用同一真实问答与持久化逻辑。
- 提问时先创建会话，再以 `Accept: text/event-stream` 请求回答。客户端同时兼容无证据时返回的 JSON，支持 LF 与 CRLF SSE 分帧。
- 流式界面显示部分回答、来源、模型、失败和未完成状态；停止按钮中止 fetch，重试会保留旧记录并新建消息。
- 来源权限被回收后只显示“原文访问权限已收回”，不渲染历史来源标题、链接或原文。
- 切换账号、会话或文档时会取消当前流并使旧请求失效，防止晚到的响应写入新会话。
- 本机 Edge 验收使用隔离数据库和模拟 SSE 上游，验证了完整回答、无证据 JSON、取消、重试、重命名、刷新恢复、CRLF 事件和 390px 布局；未调用外部模型，不能据此宣称真实 Qwen SSE 已验收。

# 登录上传与持久解析流水线

## API

- `POST /api/ingestion/upload`：multipart/form-data。字段 `file`（必须，PDF/DOCX，不超过 30 MiB）、`visibility`（`private` 默认 / `team` / `public`）、`teamId`、`sourceUrl`（可选 HTTP(S)）、`licenseNote`。请求会同步等待解析，成功返回 `{ task }`；同账号同 SHA-256 重复上传返回已有任务。
- `GET /api/ingestion/tasks`：当前 active 用户拥有的最近 100 条任务。
- `GET /api/ingestion/tasks/:id`：任务详情；读取时会把超过 10 分钟的遗留 `processing` 标为 `incomplete`。
- `POST /api/ingestion/tasks/:id/retry`：仅所有者可重试 `failed` / `incomplete` 任务。
- `DELETE /api/ingestion/tasks/:id`：仅所有者可删除任务、文档、派生数据和受限上传目录内对应文件。

所有接口均要求会话有效且账号 active；`public` 仅 admin，`team` 必须是 `team_members` 成员。任务字段包含 `id/documentId/status/progress/attempts/errorMessage/sha256/visibility/teamId/sourceUrl/licenseNote` 与时间戳。

## 存储

上传文件写入 `<data>/uploads/<ownerId>/<documentId>/source.<ext>`。`ownerId`、`documentId` 均为服务端 UUID，文件名只清洗为标题，不参与路径拼接。Node 会检查 PDF/DOCX 魔数、DOCX ZIP 中央目录与必需部件，再计算 SHA-256 并在 SQLite 中先持久化 `documents` 与 `upload_tasks`。`upload_tasks` 以 `(owner_id, sha256)` 唯一约束实现幂等。

Node 使用 `python -I scripts/process_upload.py` 的参数数组调用解析进程，不 shell 执行文档内容；调用有 120 秒超时和 64 KiB 输出上限。该脚本复用 `import_public_corpus.py` 的 `parse_document/clean_text/split_sections/chunk_pages`，在同一 SQLite 事务中写入 pages/sections/chunks 并完成任务，失败会真实记录到任务与文档。解析成功的文档沿用现有 `documents` 访问边界，因此 private 仅 owner、team 供成员、public 供所有人读取。

可配置 `CORPUS_PYTHON`（Python 可执行文件）、`CORPUS_INGESTION_SCRIPT`（测试替换脚本）、`CORPUS_DB_PATH` 与 `CORPUS_UPLOAD_DIR`。生产默认分别使用仓库 `data/lab-galaxy.db` 与 `data/uploads`。

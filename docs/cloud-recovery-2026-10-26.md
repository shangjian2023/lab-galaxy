# 腾讯云运行版本恢复与 GitHub 差异（2026-10-26）

## 结论

GitHub 的 `lab-galaxy` 明显落后于腾讯云正在运行的版本，不能直接把当前 `master` 当作线上源码继续开发或部署。

- GitHub 仓库：<https://github.com/shangjian2023/lab-galaxy>
- GitHub `master`：`f967930669c819ace290a0fea9f1e06b461f825f`，提交时间 `2026-07-14T06:59:24Z`，提交说明为“Update README: 添加项目简介、快速开始与技术栈说明”。
- 腾讯云连接：`tencent`（SSH 配置中的主机别名）。
- 线上域名：<https://graph.mazhuoran.cloud/>。
- 检查时间：2026-10-26。首页、`/graph`、`/team` 均返回 HTTP 200；后端 `/health` 返回 HTTP 200。

## 正在运行的版本

Kubernetes 命名空间为 `kg-platform`，检查当日各应用 Pod 均为 Running/Ready。

| 组件 | 运行镜像 | 镜像 ID |
| --- | --- | --- |
| 后端 | `kg-backend:release-20261018-r13` | `sha256:564aa2bb15cd4939aee7a0decb3a7fab0d89ae311e19f8d8eca0c4b5d0575c71` |
| AI 服务 | `kg-ai-service:release-20261018-r3` | `sha256:f62e6a9fa9846574eebe6cb68b34b0e17264c6a558328b46d1d30e5e69f4b65a` |
| 前端 | `kg-frontend:release-20261019-r19` | `sha256:8b327653009205d42729057448ae635d8174a5c67f95b5560c856be2b95a87a4` |

后端镜像只包含 Rust 可执行文件 `/usr/local/bin/app`，不包含 Rust 工作区。`/home/ubuntu/kg-platform/backend` 的 Python 文件及 `kg-platform-backend.service` 是旧版残留，不是当前运行后端。

## 云端领先内容

根据服务器保留的发布清单和镜像元数据，可以确认以下云端改动未在 GitHub `master` 中：

- `r6`–`r12`：图谱界面、图谱布局参数、布局 Worker 和 WASM 布局持续调整。
- `r13`：知识库相关后端与前端功能；清单包含 `crates/kg-api` 下 13 个 Rust 源文件、知识库迁移 `migrations/0007_knowledge_libraries.sql` 及多个页面/组件。
- `r14`：固定边的渐进张力，修改布局 Worker 与 `graph-layout.wasm`。
- `r15`：多页面视觉重设计，包含模板、器材、成长、论坛、管理等页面。
- `r16`：图谱页导航自动隐藏修复及构建并发限制。
- `r17`：团队大厅、聊天室界面改版。
- `r18`、`r19`：全局油画风格氛围与非聊天页面的暖色调统一。

各发布清单中出现的路径去重后约为 100 个，其中 13 个 Rust 文件、77 个前端路径。这是历史发布清单的统计，不是对当前源码与 GitHub 逐个文件比较后的精确差异数量。

`r13` 清单中的基线 `6b4499493d58dd22b7c6486a36ba074dfab8e338` 不在本次取得的 GitHub `master` 历史中，GitHub API 查询也返回 422；不能把它描述为当前 GitHub 仓库的已知祖先。

## 源码恢复结果与限制

已恢复：

1. GitHub 的完整 `master` 历史及工作树，位于当前项目目录。
2. 腾讯云旧版 Python/TypeScript 源码，已排除 `.env`、依赖、构建产物、用户文档和 AI 数据，作为独立归档保存；它不是当前运行版本的源码。
3. 运行版本发布清单、迁移脚本、部署前后元数据和 `VERIFIED` 标记。
4. 当前运行镜像的归档，传输完成后以同目录 `SHA256SUMS` 为准。

未恢复到：

- 可直接编辑、构建当前线上 Rust 后端的完整工作区（含 `Cargo.toml`、源码、迁移和构建脚本）。
- 与线上 `r19` 完全一致的前端 TypeScript 源码及资源构建源目录。
- 可确认的历史待办清单或“最后一次未完成开发”的原始上下文。

服务器没有 `kg-platform` Git 工作区，发布镜像为裁剪后的运行镜像，没有原始源码/source map。服务器没有可恢复的 Codex 会话；本机任务索引和恢复包也没有该项目。原工作区名 `lab-galaxy-rs` 来自本机《活跃项目清单》（2026-10-23），该清单在 2026-10-24 记录用户决定放弃该目录备份；公开 GitHub 仓库列表也没有同名仓库。

因此，本次没有将旧源码覆盖到线上、没有改动 Kubernetes 配置、没有重启服务、没有推送 GitHub。不能把反编译产物或旧 Python 工程冒充为已恢复的当前源码。

## 本地文件

- 开发目录：`C:\Data\projects\创新实验知识图谱平台`
- 云端归档：`C:\Data\archive\lab-galaxy-cloud-20261026`
- `legacy-source-20261026.tar.gz`：旧版源码参考归档，不含凭据和业务数据。
- `release-metadata.tar.gz`：发布清单、部署记录与迁移参考。
- `library-r13.tar.gz`：后端 `r13` 和前端 `r13` 的 OCI 镜像归档。
- `frontend-r19.tar.gz`：当前前端 `r19` 的 OCI 镜像归档。
- `SHA256SUMS`：上述归档校验值。

镜像、数据库备份和用户文档不加入 Git；服务器原有的数据库与对象存储备份仍保留在原发布目录。

## 接续开发前置条件

优先找回原始 `lab-galaxy-rs` 工作区、其备份或最后一次开发会话，再与当前运行镜像及发布清单校验。取得后应建立 `cloud-baseline` 提交，并将 GitHub 旧版差异与云端源码逐项审查。

在没有取得原始工作区之前，不应：

- 用当前 GitHub `master` 构建并覆盖线上服务；
- 把旧版 `backend/` Python 服务当作现行后端；
- 根据“VERIFIED”猜测一项尚未完成的功能并直接发布；
- 将 `.env.prod`、Kubernetes Secret、业务数据或镜像二进制推送到公开仓库。

`r19` 有 `VERIFIED` 标记，没有足够证据把它称为“未完成的开发”。

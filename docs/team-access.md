# 团队访问与成员边界

团队功能使用现有 `users`、`teams`、`team_members` 表，并在团队模块首次打开数据库时幂等创建 `team_invites`。邀请令牌由 32 字节随机数生成，只在创建响应中返回一次；数据库只保存 SHA-256 哈希、状态、创建者、过期时间和使用计数。

## REST API

除加入接口外，路径中的 `id` 均为团队 ID。所有接口要求 active 登录会话；非成员访问已存在或不存在的团队均得到 `404 TEAM_NOT_FOUND`，避免泄漏团队信息。团队与成员对象同时提供 `ownerId/createdAt/userId/joinedAt` 及旧前端的 `owner_id/created_at/user_id/joined_at` 字段。写接口均使用同源检查，成员、邀请和角色变更均在 `BEGIN IMMEDIATE` 事务中执行。

- `GET /api/teams`：返回当前用户所属团队。
- `POST /api/teams`：`{"name":"2-80 字符"}`，创建者自动成为 owner。
- `GET /api/teams/:id`：仅成员可读取团队与成员列表。
- `POST /api/teams/:id/invites`：owner only，`{"expiresInHours":1-168}`，默认 24；响应令牌只出现一次且 `Cache-Control: no-store`。
- `POST /api/teams/join`：`{"token":"一次性邀请令牌"}`；令牌缺失、已使用、已撤销或过期均返回 `404 INVITE_INVALID`。已是成员的加入者会幂等返回当前团队。
- `DELETE /api/teams/:id`：当前成员退出；最后一个 owner 返回 `409 LAST_TEAM_OWNER`。
- `DELETE /api/teams/:id/members/:userId`：owner 移除其他成员；被移除者若是最后一个 owner 返回 `409`，owner 自己应走退出接口。
- `PATCH /api/teams/:id/members/:userId`：owner only，`{"role":"owner"|"member"}`；不允许降级最后一个 owner。

团队角色可有多名 owner。为兼容 `teams.owner_id` 的创建者记录，owner 离开、被移除或被降级后会按加入时间选取剩余最早 owner 更新该字段；不影响成员角色本身。`documents.visibility = 'team'` 的 corpus 查询实时联查 `team_members`，因此成员退出或被移除后立即失去团队文档可见性。

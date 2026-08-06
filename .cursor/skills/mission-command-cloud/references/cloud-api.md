# Cursor Cloud Agents API 映射

官方文档：https://cursor.com/docs/cloud-agent/api/endpoints

Base URL：`https://api.cursor.com`

认证：Basic（`-u API_KEY:`）或 Bearer（`Authorization: Bearer API_KEY`）。

本技能脚本读取环境变量（按优先级）：

1. `MISSION_COMMAND_API_KEY`
2. `CURSOR_API_KEY`

## 身份

| 变量 | 含义 |
| --- | --- |
| `CURSOR_CONVERSATION_ID` | 当前 Cloud 会话的 `bc-...`（参谋长常用） |
| `MISSION_COMMAND_COS_AGENT_ID` | 参谋长 agent id（注入给分队） |
| `MISSION_COMMAND_UNIT_ID` | 分队编号 |
| `MISSION_COMMAND_ACTION_CODE` | 行动代号 |
| `MISSION_COMMAND_ECHELON` | `CHIEF-OF-STAFF` / `TASK-UNIT` / `INSPECTOR` |

也可用 MCP `cursor-cloud` → `run-info` 读取当前 `bcId` 与 URL。注意：该 MCP **不能创建** Agent；创建必须走 HTTP API。

## 端点用法

### 创建分队 — `POST /v1/agents`

```json
{
  "name": "[CODE][分队] 成果名",
  "prompt": { "text": "<OPORD 全文，含回报协议>" },
  "repos": [
    { "url": "https://github.com/org/repo", "startingRef": "main" }
  ],
  "workOnCurrentBranch": false,
  "autoCreatePR": false,
  "envVars": {
    "MISSION_COMMAND_API_KEY": "<key>",
    "MISSION_COMMAND_COS_AGENT_ID": "bc-...",
    "MISSION_COMMAND_ECHELON": "TASK-UNIT",
    "MISSION_COMMAND_UNIT_ID": "U1",
    "MISSION_COMMAND_ACTION_CODE": "CODE"
  }
}
```

约束：

- `envVars` 键名**不能**以 `CURSOR_` 开头；最多 50 条，键名 ≤255 字节，值 ≤4096 字节。
- `envVars` **不能与客户端自供 `agentId` 同时使用**：需要注入密钥时略去 `agentId`，由服务器分配 id。
- `envVars` 为 Beta：若账户未启用，可能被静默忽略。创建后分队应自检 `MISSION_COMMAND_COS_AGENT_ID`；缺失则在最终回复写明，并依赖参谋长拉取 `result`。
- `repos` 与命名 `env` 云环境互斥；两者都省略则启动无仓库 Agent（适合纯参谋/情报分队）。`repos` 最多 20 个。
- `repos[].prUrl`：直接指向待审 PR（此时 `startingRef` 被忽略，`url` 仍必填）——**督察分队首选**。
- `mode: "plan"`：先探索出方案再动手（Plan mode）——适合 WARNORD/COA 推演阶段；默认 `agent` 直接实施。
- 响应含 `agent.id`、`agent.url`、`run.id`。

### 发令 / 战报 — `POST /v1/agents/{id}/runs`

```json
{ "prompt": { "text": "<FRAGORD 或 [MISSION-COMMAND REPORT]...>" } }
```

- 同一 agent 同时只能有一个活动 run。
- `409 agent_busy`：等待后重试（建议指数退避：2s、4s、8s…上限 60s，总时长可到数分钟）。
- `409 agent_archived`：目标已归档，重试无效；需先 `POST /v1/agents/{id}/unarchive` 或改拉取兜底。
- `429 rate_limit_exceeded`：同样退避重试；不要对其他 4xx 盲重试。
- 这是双向通道：参谋长→分队、分队→参谋长都用它。

### 查终态 — `GET /v1/agents/{id}/runs/{runId}`

终态字段：`status`（`FINISHED` / `ERROR` / `CANCELLED` / `EXPIRED`）、`result`（助手最终文本）、`durationMs`、`git`（已推分支与 PR，按 agent 维度）。

### 列出历史 run — `GET /v1/agents/{id}/runs`

按时间倒序列出某 agent 的全部 run（`limit`/`cursor` 分页）。**拉取兜底的正式通道**：参谋长不知道分队最新 `runId` 时，用它找到最新 run 再读 `result`，不依赖分队推送成功。脚本：`scripts/list-runs.sh <agentId>`。

### 流式 — `GET /v1/agents/{id}/runs/{runId}/stream`

SSE；适合参谋长盯主攻。断线用 `Last-Event-ID` 恢复。过期后改拉 GET run。

### 取消 — `POST /v1/agents/{id}/runs/{runId}/cancel`

取消后不可恢复；继续工作需新 run。

### 列表 / 元数据

- `GET /v1/agents`（分页：`nextCursor` 缺失即无下一页）
- `GET /v1/agents/{id}`

### 证据与保障类端点

- **制成品（督察证据链）**：分队把截图、测试报告、日志写入工作区 `artifacts/` 目录；参谋长/督察用 `GET /v1/agents/{id}/artifacts` 列出，`GET /v1/agents/{id}/artifacts/download?path=...` 获取 15 分钟预签名 URL（脚本：`scripts/artifacts.sh`）。战报中的 `EVIDENCE` 应优先引用 artifacts 路径而非口头声称。
- **费用监控（J8）**：`GET /v1/agents/{id}/usage`（可按 `runId` 过滤）返回每个 run 的 token 用量；用于执行 OPORD 中的时间/费用上限（脚本：`scripts/usage.sh`）。早期功能：未启用返回 `403 feature_unavailable`，降级为人工估计。
- **归档/复员**：`POST /v1/agents/{id}/archive`（AAR 后经统帅批准归档，可 `unarchive` 召回；脚本：`scripts/archive-agent.sh`）。归档后可读不可发令。
- **能力自检**：`GET /v1/me` 验证 Key 有效性；`GET /v1/models` 获取可用模型 id（传给 `model.id`）。
- `GET /v1/repositories`：限流极严（1 次/分钟），只在筹划期调一次并缓存。

## 推荐通信节奏

```text
统帅 → 参谋长（本会话用户消息）
参谋长 → 分队（create 或 send-prompt）
分队执行…
分队 → 参谋长（report-to-cos，前缀 [MISSION-COMMAND REPORT]）
参谋长拉取备份（wait-run）以防推送失败
参谋长 → 统帅（态势战报 / 决策简报）
```

推送优先、拉取兜底。不要假设分队一定能打进参谋长会话。

## 安全

- 勿把 API Key 写进仓库、PR、战报正文或 commit。
- 分队 `envVars` 仅注入完成任务所需最小密钥。
- 督察分队默认只读意图：OPORD 中明确禁止改代码（除非统帅授权修复）。
- 归档/删除 Agent 须统帅命令；技能默认不自动删。

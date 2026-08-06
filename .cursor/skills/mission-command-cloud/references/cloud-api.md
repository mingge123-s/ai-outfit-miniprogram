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

- `envVars` 键名**不能**以 `CURSOR_` 开头。
- `envVars` 为 Beta：若账户未启用，可能被静默忽略。创建后分队应自检 `MISSION_COMMAND_COS_AGENT_ID`；缺失则在最终回复写明，并依赖参谋长拉取 `result`。
- 与命名 `env` 云环境互斥时，按文档选择其一。
- 响应含 `agent.id`、`agent.url`、`run.id`。

### 发令 / 战报 — `POST /v1/agents/{id}/runs`

```json
{ "prompt": { "text": "<FRAGORD 或 [MISSION-COMMAND REPORT]...>" } }
```

- 同一 agent 同时只能有一个活动 run。
- `409 agent_busy`：等待后重试（建议指数退避：2s、4s、8s…上限 60s，总时长可到数分钟）。
- 这是双向通道：参谋长→分队、分队→参谋长都用它。

### 查终态 — `GET /v1/agents/{id}/runs/{runId}`

终态字段：`status`（`FINISHED` / `ERROR` / `CANCELLED` / `EXPIRED`）、`result`（助手最终文本）、`durationMs`、`git`。

### 流式 — `GET /v1/agents/{id}/runs/{runId}/stream`

SSE；适合参谋长盯主攻。断线用 `Last-Event-ID` 恢复。过期后改拉 GET run。

### 取消 — `POST /v1/agents/{id}/runs/{runId}/cancel`

取消后不可恢复；继续工作需新 run。

### 列表 / 元数据

- `GET /v1/agents`
- `GET /v1/agents/{id}`

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

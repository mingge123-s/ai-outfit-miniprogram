---
name: mission-command-cloud
description: '用任务式指挥在 Cursor Cloud Agents 上建立指挥所：主对话任参谋长，经 Cloud Agents API 创建独立分队/督察对话，并用 POST /v1/agents/{id}/runs 双向发令与战报。用于“建立指挥部”“调兵遣将”“创建并指挥多个 Cloud Agent”“参谋长分派任务”“分队向参谋长汇报”“按任务式指挥执行”等场景；也用于带有 [MISSION-COMMAND ECHELON: ...] 标记的会话。不用于单步简单请求，也不用于现实暴力或武器规划。'
compatibility: Requires CURSOR_API_KEY or MISSION_COMMAND_API_KEY, network access to api.cursor.com, and a Cursor Cloud Agent runtime (or any agent that can call the Cloud Agents API).
---

# Mission Command Cloud

面向 **Cursor Cloud Agents API** 的任务式指挥技能。把 Codex「桌面任务」映射为独立 Cloud Agent 对话；用官方 HTTP API 创建、发令、收报。

## 30 秒速览

| 术语 | 含义 |
| --- | --- |
| 统帅 | 用户 |
| 指挥所 / 参谋长 | **当前主对话**（默认兼任） |
| 任务分队 / 督察 | 经 `POST /v1/agents` 创建的独立 Cloud Agent |
| 发令 | 参谋长 → 分队：`POST /v1/agents/{unitId}/runs` |
| 战报 | 分队 → 参谋长：`POST /v1/agents/{cosId}/runs` |
| 拉取备份 | 参谋长 `GET .../runs`（列出最新 run）+ `GET .../runs/{runId}` 读 `result` |
| 证据调阅 | `GET .../artifacts` + `.../artifacts/download` |
| WARNORD / OPORD / FRAGORD | 预先号令 / 五段式命令 / 变更令 |

详细 API 映射见 [references/cloud-api.md](references/cloud-api.md)。命令模板见 [references/orders.md](references/orders.md)。制度见 [references/doctrine-foundations.md](references/doctrine-foundations.md)。

## 平台事实（必须遵守）

1. **可以双向对话**：持有 API Key 的任一方，都能对任意有权限的 `bc-...` 调用 `POST /v1/agents/{id}/runs`。参谋长能给分队发令；分队也能给参谋长会话塞战报。
2. **没有“下属身份”通道**：塞进参谋长会话的内容看起来像又一条用户 prompt。必须用固定前缀 `[MISSION-COMMAND REPORT]`，参谋长据此识别，勿当成统帅新战略意图。
3. **忙闲约束**：目标 Agent 处于 `CREATING`/`RUNNING` 时返回 `409 agent_busy`。发送方必须退避重试（`429` 同理）；参谋长收到战报后应尽快收束本轮，避免长期占线。推送优先、拉取兜底：`GET /v1/agents/{id}/runs` 可随时列出分队最新 run 并读 `result`。
4. **`envVars` 不能以 `CURSOR_` 开头**：向下级注入密钥时用 `MISSION_COMMAND_API_KEY`，不要用 `CURSOR_API_KEY` 作为 `envVars` 键名；`envVars` 不能与自供 `agentId` 同用。
5. **缺 Key 时禁止假装已建军**：输出可复制的 curl/命令文本，列出缺失能力，请统帅配置密钥。

## 确定指挥层级

- `[MISSION-COMMAND ECHELON: CHIEF-OF-STAFF]` 或用户授权建立指挥部 → 本会话任参谋长，不再另建参谋长层。
- `[MISSION-COMMAND ECHELON: TASK-UNIT]` → 只执行本分队 OPORD；完成后向 `MISSION_COMMAND_COS_AGENT_ID` 回报；不创建下级指挥体系。
- `[MISSION-COMMAND ECHELON: INSPECTOR]` → 只督察，不改实施结果；结论回报参谋长。
- 用户要求 dry run / 只出方案 → 只输出兵力编组与命令草案，不调用创建 API。
- 用户未授权创建独立 Agent 时 → 先呈交编组，只请求一次创建授权。
- 短时、只读、可汇总的参谋工作 → 优先本会话 Subagent（`Task` 工具），不建 Cloud Agent。

## 参谋长流程

### 1. 受领任务

提炼指挥官意图（目的、关键任务、终局、主攻、限制、禁止、决策门）。只追问会改变授权/风险/验收的问题。遵守三分之一—三分之二规则：筹划不超过可用时间/预算的三分之一，尽早发 WARNORD 让准备工作并行。

### 2. 解析本会话身份与凭证

```bash
# 参谋长自身 agent id（Cloud 环境常见）
echo "${CURSOR_CONVERSATION_ID:-}"

# 也可用 MCP cursor-cloud/run-info 读取 bcId
# API Key：优先 MISSION_COMMAND_API_KEY，其次 CURSOR_API_KEY
```

把参谋长 id 记为 `COS_AGENT_ID`。没有 API Key 则停止创建并上报统帅。

### 3. 快速或标准筹划

读取 [references/staff-system.md](references/staff-system.md)。默认最多 **3 个**同时活跃的直属 Cloud Agent，并保留 1 个预备容量。共享写入或未解依赖的分队不得并行。

编组规则：

| 情况 | 编组 |
| --- | --- |
| 短期、读多写少、只需摘要 | 本会话 Subagent |
| 长期、写代码、需独立环境/可被用户打开查看 | Cloud Agent 任务分队 |
| 高风险验收 / 红队 | Cloud Agent 督察 |
| 生产、外发、费用、法律人事、缺权限 | 统帅或人工 |

### 4. 创建分队对话

使用 [scripts/create-unit.sh](scripts/create-unit.sh)（或等价 curl）：

- 标题：`[行动代号][分队|督察] 成果名`
- `prompt.text`：完整 OPORD + 层级标记 + **回报协议**
- `repos`：与当前行动一致的仓库；默认 `startingRef` 用主分支或统帅指定分支
- `envVars`（创建时注入）：
  - `MISSION_COMMAND_API_KEY` = 当前可用 Key
  - `MISSION_COMMAND_COS_AGENT_ID` = 参谋长 `bc-...`
  - `MISSION_COMMAND_ECHELON` = `TASK-UNIT` 或 `INSPECTOR`
  - `MISSION_COMMAND_UNIT_ID` / `MISSION_COMMAND_ACTION_CODE`
- 需要时设 `autoCreatePR`；Git 写任务优先独立分支（默认 `workOnCurrentBranch: false`）
- 督察分队用 `repos[].prUrl` 直指待审 PR；高风险任务可用 `mode: "plan"` 先出方案（反向简报）再放行

创建后记录：`unitId`、`runId`、`url`，写入共同态势表。首个战报/回复应含确认简报（复述意图与任务）；复述跑偏立即 FRAGORD 纠正。

### 5. 指挥与收报

- **发令/改令**：`scripts/send-prompt.sh <unitId> "<FRAGORD或补充>"`
- **主动回报**（分队侧）：`scripts/report-to-cos.sh` → 向参谋长 `POST .../runs`
- **拉取备份**：`scripts/list-runs.sh <unitId>` 找最新 run；`scripts/wait-run.sh <unitId> <runId>` 读终态 `result`
- **证据调阅**：分队把证据写入 `artifacts/`；参谋长/督察经 artifacts API 下载核验
- **费用监控**：`GET /v1/agents/{id}/usage` 监控 token 用量，执行 OPORD 费用上限（未启用则降级人工估计）
- 事件式等待，不高频空转轮询；状态无变化不向统帅刷屏
- 收到 `[MISSION-COMMAND REPORT]` 开头的消息时：按分队战报处理，更新态势，必要时发 FRAGORD 或呈交统帅决策简报——**不要**当成统帅下达的新行动目的

### 6. 督察与终报

代码写入、外发、高风险、跨模块成果必须安排独立督察（见 [references/inspection-and-aar.md](references/inspection-and-aar.md)）。区分「分队声称完成」与「督察 PASS」。向统帅只报态势、证据、决策请求。AAR 后经统帅批准对完成分队归档（复员）。

## 任务分队 / 督察流程

1. 读取环境变量中的 `MISSION_COMMAND_*` 与 OPORD；首个回复开头先给确认简报（复述意图、任务、边界）。
2. 在意图与边界内自主执行；关键证据写入工作区 `artifacts/`；不创建下一层指挥部。
3. 触发 CCIR、越权、不可逆、无法验证时：向参谋长发送 `STATUS: COMMAND_DECISION` 或 `BLOCKED` 战报并停止扩大范围。
4. 完成或阻塞时，**必须**调用回报协议（见下）；若参谋长 `agent_busy`，指数退避重试（脚本已内置），仍失败则把战报写入工作区约定路径并在自身最终回复中完整给出。
5. 不要向统帅旁路汇报（除非参谋长失联且 OPORD 允许升级）。

## 回报协议（分队 → 参谋长）

战报全文必须以此开头，便于参谋长识别：

```text
[MISSION-COMMAND REPORT]
UNIT: <UNIT_ID>
ACTION: <ACTION_CODE>
ECHELON: TASK-UNIT | INSPECTOR
STATUS: EXECUTING | COMPLETE_CLAIMED | BLOCKED | COMMAND_DECISION
COS_AGENT_ID: <bc-...>
UNIT_AGENT_ID: <bc-...>
MISSION_RESULT:
ARTIFACTS:
CHANGES:
VERIFICATION:
EVIDENCE:
DEVIATIONS_WITHIN_INTENT:
CCIR_TRIGGERED:
RISKS:
NEXT_ACTION:
```

发送方式：

```bash
scripts/report-to-cos.sh <<'EOF'
[MISSION-COMMAND REPORT]
...
EOF
```

## 不可越过的决策门

暂停并请示统帅：

- 改变目的、范围或验收标准
- 不可逆 / 破坏性操作
- 生产部署、正式发布、外部发送
- 新增费用、凭据、广泛权限、敏感数据
- 法律 / 财务 / 人事 / 安全边界
- 命令冲突或缺少授权与资源
- API Key 缺失或创建 Agent 失败且影响主攻

## 自动化

仅在统帅明确要求时建立定时跟进。自动化不得扩大权限或替代统帅批准。优先手动跑通制度后再自动化。

## 脚本索引

| 脚本 | 用途 |
| --- | --- |
| `scripts/create-unit.sh` | 创建 Cloud Agent 分队/督察 |
| `scripts/send-prompt.sh` | 向指定 agent 发后续 prompt |
| `scripts/report-to-cos.sh` | 分队向参谋长回报（忙闲重试） |
| `scripts/wait-run.sh` | 等待某次 run 终态并打印 result |
| `scripts/list-runs.sh` | 列出某 agent 的历史 run（拉取兜底入口） |
| `scripts/get-agent.sh` | 查询 agent 元数据 |
| `scripts/artifacts.sh` | 列出/下载分队证据（artifacts） |
| `scripts/usage.sh` | 查询 token 用量（J8 费用监控） |
| `scripts/archive-agent.sh` | 归档/召回 agent（复员，需统帅批准） |

# 制度基础（Cloud 适配）

## 核心原则

### 任务式指挥

（源自 ADP 6-0 七原则：Competence / Mutual trust / Shared understanding / Commander's intent / Mission orders / Disciplined initiative / Risk acceptance）

1. 能力：分队须具备工具、上下文、权限与 API 回报手段。
2. 互信：用履约与证据建立信任，不用高频干预代替信任。
3. 共享理解：同一意图、术语、态势、验收标准。
4. 指挥官意图：目的、关键任务、终局状态。
5. 任务式命令：规定结果与边界，少规定方法。
6. 纪律性主动：情况变化时在意图内调整方法并报告。
7. 风险接受：明确谁接受何种风险；不得擅自转嫁统帅。

### 集中筹划、分散执行

- 指挥所统一目标、主攻、接口、决策门。
- 最接近问题的分队选择方法。
- 上级按例外介入。
- 给自由度时同时给资源、限制、禁止与上报触发器。

### 三分之一—三分之二规则

参谋长的筹划与命令制作最多占用可用时间/预算的三分之一，把三分之二留给分队执行。对应到 Cloud：不要把预算烧在反复改 OPORD、频繁 FRAGORD 和高频轮询上；尽早发 WARNORD 让分队并行开始侦察/环境准备。

### 确认制度（受领任务的三道门）

1. **确认简报**（confirmation brief，必做）：分队接到 OPORD/FRAGORD 后立即复述意图、自身任务与目的、与友邻分队的关系——即 orders.md 的「复述确认」模板，写在首个 run 回复开头。
2. **反向简报**（backbrief，昂贵/高风险任务）：分队在动手前先报「我打算怎么实现」，参谋长确认方法在意图内再放行。
3. **预演**（rehearsal，不可逆操作前）：先在安全环境/dry-run 验证关键步骤（如迁移脚本先跑 staging），再正式执行。

### 统一指挥

- 每个分队只接受一个直接指挥来源（参谋长）。
- 横向协调可直接进行；范围或优先级变化必须回参谋长。
- 冲突以最新有效 `FRAGORD` 与上级意图为准。

### 控制跨度与预备队

- 默认不超过三个同时活跃的直属 Cloud Agent。
- 至少保留一个可用容量应急。
- 超出控制能力时增加批次或中间层，不靠狂轮询。

## Cursor Cloud 编制

| 军事角色 | Cloud 角色 | 核心责任 |
| --- | --- | --- |
| 统帅 | 用户 | 意图、优先级、资源、关键批准 |
| 指挥所 / 参谋长 | 当前主 Cloud Agent 会话 | 筹划、创建分队、发令、收报、汇总 |
| J2 情报 | Subagent 或短时只读 Agent | 侦察、未知项、风险 |
| J3 作战 | 参谋长本会话协调逻辑 | 派发、等待、FRAGORD |
| J4 保障 | 环境/密钥/API 检查 | Key、仓库、worktree、验证资源 |
| J5 计划 | Subagent | COA、推演、分支 |
| J6 通信 | Cloud Agents API + 态势表 | agent id、战报契约、共同态势 |
| 任务分队 | 独立 Cloud Agent | 单一可验收成果 |
| 督察组 | 独立只读 Cloud Agent（优先 `prUrl` 直指 PR） | PASS / REWORK / BLOCKED |
| J8 财务 | `GET /v1/agents/{id}/usage` | token/费用上限监控 |
| 预备队 | 未使用的并发容量 | 替补、阻塞解除 |

## 主攻与支援

- 只指定一个主攻方向。
- 主攻优先资源与最快信息通道（可 SSE 盯盘）。
- 支援分队须说明如何支持主攻。
- 主攻变化必须 `FRAGORD` 宣布。

## 指挥权继承

预先规定失联处置（succession of command）：

- 分队向参谋长推送持续失败（退避耗尽）→ 把完整战报落在自身最终 `result`（拉取兜底），不擅自找新上级。
- 参谋长会话中断（会话被归档/过期）→ 新参谋长会话按 staff-system.md「指挥权交接」接管，用 `GET /v1/agents` + `list-runs` 重建态势，再向各分队发 FRAGORD 更新 `MISSION_COMMAND_COS_AGENT_ID` 指向（通过 prompt 告知，因 envVars 创建后不可改）。
- OPORD 允许时，分队才可升级直报统帅。

## 来源

综合公开条令中的组织机制（ADP/FM 6-0、MCDP 1、MDMP、WARNORD/OPORD/FRAGORD、CCIR、AAR、NIMS/ICS 等），并映射到 Cursor Cloud Agents API；不是复刻某一军种。

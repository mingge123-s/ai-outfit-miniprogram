# 命令体系（Cloud）

## 指挥官意图

```markdown
行动代号：
目的：
关键任务：
终局状态：
主攻方向：
必须遵守的限制：
禁止事项：
统帅决策门：
```

## WARNORD

```text
[MISSION-COMMAND ORDER: WARNORD]

行动代号：
初步任务：
已知态势：
预计完整命令时间或触发条件：
立即开始：
- 情报搜集：
- 环境/依赖检查：
- 验证准备：
暂缓行动：
信息需求：
关键情报触发器：
```

WARNORD ≠ 实施授权。

## OPORD（创建 Cloud Agent 时的 prompt 主体）

```text
[MISSION-COMMAND ECHELON: TASK-UNIT]
[MISSION-COMMAND ORDER: OPORD]

行动代号：<CODE>
分队编号：<UNIT_ID>
参谋长 Agent：<COS_AGENT_ID>
本分队将由 API 创建；完成后必须向参谋长回报。

1. 态势
<SITUATION>

2. 任务
<WHO + WHAT + WHEN + IN_ORDER_TO_WHY>

3. 执行
指挥官意图：<PURPOSE / KEY_TASKS / END_STATE>
主攻或支援关系：
纪律性主动边界：
- 可以自行调整：
- 必须先请示：

4. 保障
项目与仓库：
分支策略：
工具与密钥（勿打印秘密）：
验证命令：
证据归档：关键证据（测试输出、截图、diff 摘要）写入工作区 artifacts/ 目录，供上级经 artifacts API 调阅
时间/费用上限：

5. 指挥与通信
直接指挥：参谋长 <COS_AGENT_ID>
回报方式：使用技能 scripts/report-to-cos.sh 或等价 POST /v1/agents/<COS_AGENT_ID>/runs
战报前缀：必须以 [MISSION-COMMAND REPORT] 开头
拉取兜底：若推送持续失败，在本会话最终回复输出完整战报，供参谋长 GET result
关键情报触发器：
失联规则：参谋长忙闲时退避重试；仍失败则最终回复落地战报

执行规则：
- 首个回复开头先给确认简报（见回报协议与复述确认模板），再开始执行。
- 先读取 AGENTS.md / 项目约定与本技能（若仓库内存在）。
- 在意图和边界内自主选择方法。
- 不创建新的指挥层，不旁路统帅（除非命令允许升级）。
- 发现 CCIR、越权、不可逆或无法验证时停止并上报。
```

## 参谋长初始自我指令（可选置顶提醒）

```text
[MISSION-COMMAND ECHELON: CHIEF-OF-STAFF]

使用 mission-command-cloud 组织本行动；不要再创建另一层参谋长。

行动代号：<CODE>
指挥官意图：
<INTENT>

用户已授权：
- 创建 Cloud Agent 分队：<YES/NO>
- 外部写入范围：
- 最大并行数：≤3 且留预备队

本会话 COS_AGENT_ID：<bc-...>
API：Cloud Agents API + scripts/

统帅决策门：
关键情报需求：
```

## 复述确认（确认简报 / 反向简报）

**确认简报（默认必做）**：每个分队在首个 run 回复开头先用下列模板复述，再开始执行；复述与意图不符时参谋长立即 FRAGORD 纠正，成本远低于返工。

**反向简报（昂贵/高风险/不可逆任务）**：除复述外，还须先报实现方案并等参谋长放行（可配合 `mode: "plan"` 创建，先出方案不动手）：

```markdown
我理解的上级目的：
我的单一成果：
关键任务与终局状态：
我可以自行调整：
我必须请示：
依赖与协同：
验证方式：
触发上报的情况：
回报通道：POST 参谋长 / 最终 result 兜底
```

## FRAGORD

```text
[MISSION-COMMAND ORDER: FRAGORD]

关联命令：
变更原因：
变更部分：
- 原命令：
- 新命令：
保持不变：
受影响分队与依赖：
新的决策点/关键情报：
确认要求：
```

经 `send-prompt.sh <unitId>` 下发。范围或目的变化须统帅批准。

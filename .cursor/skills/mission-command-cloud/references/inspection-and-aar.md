# 督察与行动后复盘（Cloud）

## 督察触发

满足任一条件安排独立 Cloud Agent 督察（或本会话只读 Subagent，若范围极小且统帅同意）：

- 修改代码、配置、测试、构建或部署行为
- 对外发布、发送或正式交付
- 安全、权限、隐私、财务、合规、数据迁移
- 跨多个模块或分队
- 验收主要依赖实施分队主观判断

## 督察命令（创建 Agent 的 prompt）

```text
[MISSION-COMMAND ECHELON: INSPECTOR]
[MISSION-COMMAND ORDER: OPORD]

只进行独立督察，不修改实施（除非统帅书面授权修复）。

行动代号：
任务分队 agentId / 分支 / PR：
指挥官意图：
验收标准：
分队战报：

检查：
1. 是否实现目的、关键任务、终局状态
2. 每条标准是否有可复现证据
3. 回归、边界遗漏、共享冲突、擅自扩张
4. 测试、类型检查、lint、diff 审查
5. 安全/隐私/权限/数据/费用/发布风险
6. 方法偏离是否仍在意图内

输出并回报参谋长：
DECISION: PASS | REWORK | BLOCKED
FAILED_CRITERIA:
FINDINGS:
EVIDENCE_CHECKED:
REQUIRED_ACTIONS:
RESIDUAL_RISKS:
```

`envVars` 中 `MISSION_COMMAND_ECHELON=INSPECTOR`。

## 决策

- `PASS`：标准均有充分证据，无阻断项
- `REWORK`：授权内可修；退回原分队并重验
- `BLOCKED`：缺权限/环境/统帅决策，或修复将扩 scope

督察不得降标准换 PASS，不得改完再批自己。

## AAR

```markdown
## AAR

原定目的与标准：
实际发生：
做得好的：
需要改进的：
差异原因：
应保持的做法：
应改变的做法：
制度落点：
- AGENTS.md / Skill / 脚本 / 测试 / 文档：
责任人：
验证改进的下一次任务：
```

聚焦事实与流程；教训必须落到可执行落点，而非仅“已记录”。

# M6 · 只读群名单 · 证据

[English](m6-group-roster.md)

- 卡片：M6（群聊自 2026-11-10 进入首版范围）
- 状态：**只读群名单与群状态/日志视图已落地并在真实服务验证；消息收发是下一步**
- 记录时间：2026-11-10
- 目标服务：`192.168.2.171:9119`（v0.22.5 / `bf0203a794`）

## 实现

- `RemoteGroup` 共享类型、`groups.list` 校验 schema、`ChatManager.listGroups()` 与
  `chatListGroups()` bridge/preload/IPC。
- 渲染层把只读房间列表存入 `remote.groups`，在 Bot Chat 连接可用后拉取一次。
- 侧栏新增「群聊」分区，每个房间一行（头像、名称、成员数）。
- 点击群聊打开只读视图：房间元数据（成员数、最新序号、驱动状态）与最近 50 条日志事件类型/时间，通过 `groups.state` 与 `groups.log` 获取；暂不发送消息。

## 验证

- 命令：`node scripts/gui-groups-roster.mjs`（真实 Dashboard + 专用探针 userData）。
- 结果：2 个 hosted rooms 正确渲染，成员数匹配：
  - `Group Chat` · 4 位成员
  - `Mosbot Ui 041400、devbot` · 2 位成员
- 点击第一个房间渲染只读视图：标题 `Group Chat`、50 条日志事件、最新序号 86、驱动 `running`。
- `vitest` 176 passed；typecheck/lint/format 全绿。
- 报告（工作区忽略数据）：`docs/evidence/tmp/groups-roster-*.json`。

## 下一步

1. 群视图内的发送/接收与停止/继续。
2. 群审批与附件。
3. 语音录音/转写保持独立，直到有具备能力的部署/设备。

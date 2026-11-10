# M6 · 只读群名单 · 证据

[English](m6-group-roster.md)

- 卡片：M6（群聊自 2026-11-10 进入首版范围）
- 状态：**只读名单、状态/日志视图、创建弹层、输入框、发送、3 秒日志/状态轮询、停止、错误呈现与模拟 socket 断开恢复已在真实服务验证；审批/附件是下一步**
- 记录时间：2026-11-10
- 目标服务：`192.168.2.171:9119`（v0.22.5 / `bf0203a794`）

## 实现

- `RemoteGroup` 共享类型、`groups.list` 校验 schema、`ChatManager.listGroups()` 与
  `chatListGroups()` bridge/preload/IPC。
- 渲染层把只读房间列表存入 `remote.groups`，在 Bot Chat 连接可用后拉取一次。
- 侧栏新增「群聊」分区，每个房间一行（头像、名称、成员数）。
- 点击群聊打开视图：房间元数据（成员数、最新序号、驱动状态）、最近 50 条日志事件（有文本时显示消息）与输入框。输入框已接 `groups.send`，使用推导的 `thread_id` 与客户端事件 id。
- 侧栏「群聊」分区新增创建按钮与小型创建弹层（名称 + 2–6 个本地 profile）；创建成功后刷新名单并打开新群。
- 群视图打开时每 3 秒轮询 `groups.log` 与 `groups.state`：按 seq 去重、更新最新序号、刷新 working/blocked driver 状态、自动滚动并呈现轮询错误（后续成功轮询会清除）；reducer 覆盖在 `tests/unit/store.test.ts`。

## 验证

- 命令：`node scripts/gui-groups-roster.mjs`（真实 Dashboard + 专用探针 userData）。
- 结果：2 个 hosted rooms 正确渲染，成员数匹配：
  - `Group Chat` · 4 位成员
  - `Mosbot Ui 041400、devbot` · 2 位成员
- 点击第一个房间渲染视图：标题 `Group Chat`、50 条日志事件、最新序号 86、驱动 `running`、输入框与发送按钮存在。
- 专用群验证：`node scripts/gui-group-send.mjs` 用两个本地 profile 创建临时群，发送一条消息，在群日志中找到该消息后解散群。
- 端到端 UI 验证：`node scripts/gui-group-create-send.mjs` 从弹层创建群、在输入框发送消息、由 3 秒轮询渲染出来、点击停止（`stopped=true`）并解散房间（`created=true`、`sent=true`、`rendered=true`、`disbanded=true`）。
- 重连验证：`node scripts/gui-group-reconnect.mjs` 在群视图打开时断开 gateway socket；房间保持选中、detail/log 恢复、轮询错误清除（`recovered=true`）。重连状态太快未观察到（`sawReconnect=false`），因此这是模拟 socket 断开，不是真实断网。
- `vitest` 176 passed；typecheck/lint/format 全绿。
- 报告（工作区忽略数据）：`docs/evidence/tmp/groups-roster-*.json`。

## 下一步

1. 群审批与附件。
2. 用真实断网加固错误/重连状态。
3. 语音录音/转写保持独立，直到有具备能力的部署/设备。

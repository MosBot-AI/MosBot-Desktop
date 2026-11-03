# M1 · 真实发送、流式回复与停止 · 证据

- 卡片：M1（聊天纵切）
- 状态：**发送 / 流式 delta / 终态 / 停止 / 审批与澄清卡 / 自动重连已实现**；审批真实触发与断线回放仍待专门构造验证
- 记录时间：2026-11-04
- 数据来源：真实 Dashboard `192.168.2.171:9119`（v0.22.5 / `bf0203a794`），写入只针对本轮
  `mosbot-chat-probe-<时间戳>` 专用 profile，结束后删除
- 隐私：真实回复正文、会话 id 不进入仓库；本文件只记录状态与计数

## 实现

- 主进程 `ChatManager`：常驻 Gateway 连接（一次性 ticket）、`session.resume`/`session.create` + 标题认领、
  `prompt.submit`、`session.interrupt`、`client.capabilities {server_requests:true}`；把
  `message.start|delta|interim|complete`、`tool.*`、`error`、`request.cancel` 归一化为渲染事件，
  并通过 IPC 单向下发。
- 服务端请求：`approval`（choices: once/session/always/deny）与 `clarify`（questions/choices）
  以聊天内卡片呈现；回答经同一连接按 request id 回执。无法渲染的其它提示类型自动返回空值，
  避免代理端悬挂。
- 断线：socket 关闭后按 1/2/4/8/15 s 退避重连并 `session.resume` 同一持久会话，渲染层显示
  「连接中断，正在恢复…」；重连成功恢复实时增量。
- 渲染层：发送后本地乐观用户气泡 → 流式增量合并进单个 Bot 气泡 → 终态落定；发送中/流式中显示
  「停止」；审批/澄清卡处理后折为回执；连接异常显示横幅；`tool.*` 事件当前忽略（工作记录归组在后续卡片）。

## 验证

| 检查                                                 | 结果                                                                                                                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | 通过                                                                                                                                                                                                      |
| `pnpm test`                                          | 112 个用例通过（新增 ChatManager、事件映射、live transcript、审批/澄清卡映射）                                                                                                                            |
| `pnpm test:e2e`                                      | 10 个 fixture 用例通过                                                                                                                                                                                    |
| 真实聊天探针 `MOSBOT_PROBE_MODE=chat`                | 专用 profile：打开会话 ✅ → `prompt.submit` 接受 ✅ → 首个 `message.delta` ✅ → `message.complete status=complete` ✅ → 第二个提示 500 ms 后 `session.interrupt`，终态 `interrupted` ✅ → 删除 profile ✅ |
| 运行观察                                             | 同轮 `/api/status` 曾一次超过 10 s 超时，随后单独复测 0.7 s，判断为部署瞬时负载；探针其余步骤未受影响                                                                                                     |

## 待办

- 真实审批/澄清触发与跨端回执（需要构造会请求审批的真实命令）。
- 断线回放（`session.events.since`）与后台长回复恢复。
- 工作记录（tool.* 归组）、Markdown 完整渲染（M1 后续）。
- 用户实际操作验收：在应用内发送一条消息并观察流式与停止。

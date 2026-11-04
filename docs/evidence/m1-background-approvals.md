# M1 · 后台审批发现与通知 · 证据

- 卡片：M1（未打开 Bot 的待处理请求、系统通知）
- 状态：**后台发现、应用内提醒与系统通知已实现并通过单测；真实审批触发与系统通知展示待自然条件复验**
- 记录时间：2026-11-04
- 数据来源：真实 Dashboard `192.168.2.171:9119`（v0.22.5 / `bf0203a794`），只读订阅，不写入

## 实现

- 主进程 `PendingWatcher`（独立 Gateway 连接，不影响当前聊天）：
  - 每 5 s 轮询 `profiles.list`（拿 canonical Bot Chat 的 stored id → profile 映射）与
    `session.active_list`；
  - 对状态为 `waiting` 且属于 canonical Bot Chat 的会话，用 `session.activate {omit_messages:true}`
    只读附加，读取 `open_requests`，把新请求转成 `add` 事件；已附加会话的后续请求直接到达；
  - `request.cancel` 或轮询发现不再 waiting 时发 `remove`；注销/退出时停止并清空；
  - 同一 request id 只通知一次。
- 系统通知（macOS `Notification`）：仅当主窗口不可见/未聚焦时发送，标题为 Bot 显示名，正文按审批/
  澄清区分中英；点击后恢复/重建主窗口并把 `open {profile}` 发给渲染层，自动选中该 Bot，聊天连接
  resume 后把请求以内联卡片重新投递。系统拒绝通知时应用内提醒仍保留。
- 渲染层：左栏「待确认 · N」在真实模式下使用后台发现计数，点击直达第一个待处理 Bot；
  切换/打开 Bot 后卡片由聊天连接投递，回答走同一 request id。

## 验证

| 检查                                                 | 结果                                                                                  |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | 通过                                                                                  |
| `pnpm test`                                          | **130 个用例通过**（新增 PendingWatcher 2 个、待处理计数/选择器测试）                 |
| `pnpm test:e2e`                                      | **11 个用例通过**（fixture 模式与持久化重启测试不受影响）                             |
| 真实 `session.active_list`                           | ✅ 通过：7 个活跃会话、`waiting=0`（当前无待处理）                                    |
| 真实通知展示 / 审批触发                              | ⏳ 未验证：部署对 `echo` 类命令自动放行，未产生人工审批；系统通知需要用户在场观察一次 |

## 已知限制

- 只监视 canonical「Bot Chat」会话；普通会话或其它客户端的审批不在本轮范围。
- 轮询 5 s，跨客户端处理后的清除最迟一个周期；`request.cancel` 到达时立即清除。
- 通知权限被拒绝、勿扰模式等只影响系统横幅，应用内计数与卡片不受影响。
- 未打开 Bot 的请求在打开后才显示完整卡片；应用内不展开未选中 Bot 的详情。

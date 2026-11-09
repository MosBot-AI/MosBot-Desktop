# M1 · 未打开 Bot 的审批发现 / 通知直达 / 跨端回执 · 证据

[English](m1-unopened-approval.md)

- 卡片：M1 / 发布候选验收「未打开或折叠分区中的 Bot 等待审批时可发现并直达；后台通知；
  跨端处理回执同步」
- 状态：**真实服务 GUI 全链路通过**（两个客户端、专用 Bot，自动清理）
- 记录时间：2026-11-04
- 数据性质：真实 Dashboard `192.168.2.171:9119`；不采集远端屏幕内容；通知横幅像素未采集

## 方法

`scripts/gui-unopened-approval.mjs`：

1. 客户端 A 创建专用 Bot 并保持其 Chat 打开，触发真实 `chmod 777` 审批（A 附着保证请求不被
   服务端自动拒绝）；
2. 客户端 B 启动后停在**另一个 Bot**（目标 Chat 未打开），随后最小化窗口；
3. B 的 pending watcher 轮询 `session.active_list`，发现 waiting 的 canonical Bot Chat 并附加，
   在无焦点窗口时请求系统通知；
4. 触发通知点击路径：B 恢复窗口、打开等待中的 Bot、重投审批卡；
5. B 拒绝 → B 显示回执；A 通过 `session.resume` 的 `open_requests` 对账，把卡片折成
   「已由另一端处理」。

## 结果

| 检查                                   | 结果                       |
| -------------------------------------- | -------------------------- |
| A 的审批 pending（A 附着会话）         | ✅                         |
| B 停留在另一个 Bot（目标 Chat 未打开） | ✅                         |
| B 窗口最小化                           | ✅                         |
| **B 的 watcher 发现未打开 Bot 的审批** | ✅ waiting session 已映射  |
| **B 请求系统通知**                     | ✅ `Bot 名 · 需要你确认`   |
| 通知点击恢复 B 窗口                    | ✅ visible & not minimised |
| 点击直达等待中的 Bot                   | ✅ 名称为专用 Bot          |
| B 收到审批卡                           | ✅                         |
| B 拒绝回执                             | ✅「已拒绝」               |
| **A 收到跨端回执**                     | ✅「已由另一端处理」       |

报告：`docs/evidence/tmp/unopened-approval-2026-11-04T10-07-50-369Z.json`。

## 限制

- macOS 通知横幅像素与真实鼠标点击未验证（本 shell 无屏幕录制权限）；本次验证的是“通知请求”
  与“点击处理路径”。
- 该场景依赖**另一个客户端保持目标会话附着**（A）；单客户端关闭目标 Chat 会让服务端自动拒绝
  请求（行为说明见 `m1-background-approvals-zh.md`）。

## 2026-11-09 复跑（跨端回执失败）

- 命令：`node scripts/gui-unopened-approval.mjs`（同一双客户端流程）。
- 通过步骤：专用 Bot、B 在另一个 Bot、B 最小化、A 审批挂起、B 请求通知、B watcher 映射会话、通知点击打开 Bot、B 收到审批卡、B 拒绝回执。
- **失败步骤：A 没有把共享请求折成「已由另一端处理」。**
- 复跑诊断：
  - A、B 使用同一存储会话 `20261109_165353_027a2b` / runtime `eb4fc695`，请求 id 也相同（`srq-...`）。
  - A 的 chat manager 连接正常、请求轮询在运行、`session.resume` 成功且无错误，但 A 的 `openRequestIds` 仍包含该请求。
  - B 拒绝后本地请求列表为空，但 gateway 给 A 的 `session.resume` 仍报告该请求打开。
- 补充诊断：在 B 上直接调用 `window.mosbot.dashboard.chatAnswer(requestId, {choice:'deny'})` 返回 `{ok:true}`（响应帧已发出），但 A 的 `session.resume` 仍报告该请求打开。这说明问题在服务端对响应的归属/路由，而不是客户端没有发送回答。
- 工作假设：通知点击后 B 的拒绝响应可能落到不拥有该请求的 gateway 进程/transport（部署为 `gateway_mode=multiplex`，且可能有多进程负载均衡），或 gateway 不会跨客户端结算共享请求。需要服务端排查；客户端无法对 gateway 仍报告为打开的请求做回执折叠。
- 报告：`docs/evidence/tmp/unopened-approval-2026-11-09T16-28-28-115Z.json`、`...16-31-23-687Z.json`、`...16-35-42-435Z.json`、`...16-42-51-197Z.json`、`...16-52-04-913Z.json`。

## 服务端分析（Issue #19）

部署源码位于 `~/.hermes/hermes-agent`（`bf0203a794`）；相关文件为 `tui_gateway/server_requests.py` 与 `tui_gateway/methods_session.py`。

- `resolve_response()` 把请求从进程内的 `_open` 注册表移除，并设置等待者的 result/event；它**不会**向同一会话的其它客户端广播 `request.cancel`。
- 客户端 `src/main/dashboard/chat.ts` 的注释已描述这一点：“gateway 不会在另一个客户端回答时推送；它只是把请求从 `session.resume` 的 `open_requests` 里去掉。”
- 这只有在回答响应到达拥有 `_open` 的同一 gateway 进程时才成立。若响应被另一个进程/transport 处理（multiplex / 多 gateway 进程），拥有者的 `_open` 不会变化，之后每次 `session.resume` 都会继续报告请求打开。
- 客户端轮询无法修复：A 的轮询在运行、`session.resume` 成功，但 gateway 仍把请求放在 `open_requests` 中。

### 可能的服务端修复

1. 把响应路由到拥有该请求的 gateway 进程/会话（粘性会话或共享请求注册表）。
2. 结算时向同会话的其它客户端广播 `request.cancel {id, method, reason: "resolved-elsewhere"}`。渲染层已把这个 reason 映射为「已由另一端处理」回执。
3. 若无法广播，提供会话级的已结算请求列表/事件，让客户端不依赖 `open_requests` 也能对账。

### 服务端改动后的复验

- 重新运行 `node scripts/gui-unopened-approval.mjs`；A 必须在一个 5 秒轮询周期内折成回执，脚本最后一步必须通过。

### 参考服务端补丁

- `docs/patches/0002-cross-client-request-settle.patch` 可干净应用到部署源码（`bf0203a794` 上 `git apply --check` 通过）。
- 它让会话事件帧到达所有已附着的可应答客户端（不再只发给会话的单一 transport），并在响应结算请求时发出 `request.cancel {reason: "resolved-elsewhere"}`。
- 客户端现在在已有本地回执时忽略重复的 `resolved-elsewhere` 取消，避免回答方自己的回执被覆盖。
- 补丁**未部署**；#19 仍阻塞，直到服务端应用并让 `scripts/gui-unopened-approval.mjs` 端到端通过。

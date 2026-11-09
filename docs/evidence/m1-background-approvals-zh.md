# M1 · 后台审批发现与通知 · 证据

[English](m1-background-approvals.md)

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

## 2026-11-04 真实审批复验（按用户授权，专用 profile 自动清理）

- **配置（只读）**：`GET /api/config` 显示 `approvals.mode=manual`、`timeout=300`；
  未修改任何配置。
- **为何之前的 echo 不触发审批**：`manual` 模式只对危险命令模式询问；`echo` / 普通
  `rm file` 不在危险模式表中，因此不会弹审批。用 `chmod 777 <专用探针文件>` 命中危险模式。
- **chat 探针结果（专用 profile，自动清理）**：
  - `审批配置（只读）` ✅ `approvals.mode=manual · timeout=300`
  - `审批请求（chmod 777 探针文件）` ✅ `request raised · choices=4`
  - `审批回执（拒绝）` ✅ 按 request id 回 `deny`
  - `拒绝后命令未执行（探针文件仍在）` ✅ 回读工作区仍存在该文件
  - `允许分支`：再次触发请求 → 回 `once` → 回合完成 ✅
  - 报告：`docs/evidence/tmp/dashboard-chat-2026-11-04T07-32-11-088Z.json`
- **GUI 复验（打包产物 + 专用 profile + 桥接登录，不输入密码）**：
  - 通过界面创建 Bot → 输入条发送危险命令 → **内联审批卡出现** ✅
  - 切到别的 Bot 后，后台 watcher 出现「待确认 · 1」并可直接看到 ✅
  - 点击待确认跳回时暴露并修复两个真实缺陷：
    1. 聊天管理器已连接同一会话时 `chat.open` 走缓存、不再重发 connection/session（renderer
       重载/窗口重开后一直显示“连接已断开”）；
    2. 跳回时远端 chat 缓存里的 `storedSessionId` 仍是 null（会话创建后未回写），导致打开新建
       空会话而非审批所在会话。
  - 另修复输入条在“已连接但会话未就绪”时可发送导致的 `session is not ready` 竞态。
  - **修复后完整 GUI 链路全绿**（`scripts/gui-approval-walkthrough.mjs`）：新建专用 Bot →
    创建探针文件 → `chmod 666` 触发**内联审批卡** → 切走 → 后台 **「待确认 · 1」** → 点击跳回 →
    **审批卡在 canonical 会话中重投** → 点「拒绝」→ **「已拒绝」回执** → 角标清除。
    截图：`screens/m5/approval-inline-real.png`、`screens/m5/approval-reopened-real.png`；
    报告：`docs/evidence/tmp/approval-gui-2026-11-04T08-11-04-079Z.json`。
  - 本轮因 GUI 复验修复的真实缺陷：事件游标跨会话未重置导致 false history-stale 清空请求；
    审批回执被 reducer 删除请求导致卡片直接消失；输入条未校验 live 会话属于当前 Bot（可能把
    消息发到上一个 Bot）；已连接会话重开不重发事件；canonical 会话 id 未回写缓存。
  - 系统通知横幅展示/点击、双客户端跨端回执仍待办。

## 2026-11-04 系统通知路径验证（程序化）

`scripts/gui-notification-walkthrough.mjs`（打包产物 + 真实服务 + 专用 Bot，`MOSBOT_DIAG=1`）：

| 步骤                                                                    | 结果                                                |
| ----------------------------------------------------------------------- | --------------------------------------------------- |
| 专用 Bot 内触发真实审批（保持聊天连接，避免无客户端时被服务端自动拒绝） | ✅ 审批 pending                                     |
| 最小化窗口（失焦）                                                      | ✅                                                  |
| 主进程请求系统通知                                                      | ✅ title=Bot 名，body=「需要你确认」，approval=true |
| 点击通知的处理路径（主进程 diag 触发 click handler）                    | ✅ 窗口恢复为可见                                   |
| 点击后打开等待中的 Bot 并重投审批卡                                     | ✅ 卡片可见                                         |
| 在该路径下拒绝并显示回执                                                | ✅「已拒绝」                                        |

报告：`docs/evidence/tmp/notification-gui-2026-11-04T09-45-55-682Z.json`。

### 限制与行为说明

- **macOS 通知横幅的实际像素与真实鼠标点击未验证**：本 shell 没有屏幕录制权限（`screencapture`
  结果为黑屏），通知中心条目也不能从这里点击。因此本条只能算“程序化验证通知请求与点击处理”，
  仍需用户在现场确认横幅展示与真实点击。
- 关键行为：审批请求只在**仍有客户端附着**该会话时保持 pending。把窗口切到别的 Bot 会让旧聊天
  连接断开，服务端在没有客户端可问时会自动拒绝该请求（agent 继续执行），因此“未打开 Bot 的
  审批”必须由另一个仍在观察该会话的客户端产生（例如手机端或另一台电脑）；单客户端靠“切走”
  无法制造 unopened 审批。这也解释了先前 GUI 测试的时序差异。

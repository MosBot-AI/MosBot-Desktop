# M1 · 双客户端（同账号）聊天与审批回执 · 证据

[English](m1-dual-client.md)

- 卡片：M1（跨客户端聊天观察、审批发现与回执同步）、M0b 第 3/5 步剩余项
- 状态：**真实服务 GUI 全链路通过**（两个独立打包实例、同一账号、专用 profile，自动清理）
- 记录时间：2026-11-04
- 数据性质：真实 Dashboard `192.168.2.171:9119`（v0.22.5 / `bf0203a794`）+ 打包产物；
  不采集远端屏幕内容

## 方法

`scripts/gui-dual-client.mjs`：

1. 客户端 A 经 Dashboard API 创建专用 profile（`mosbot-probe-dual-HHMMSS`，模型就绪继承自默认 Bot）；
2. A、B（两个独立 app 实例，各自复制 probe userData）通过搜索打开**同一个 Bot Chat**；
3. A 发送普通 prompt，两端的 transcript 都应出现真实回复；
4. A 触发危险命令 `chmod 777`，两端都应收到审批卡；A 拒绝；
5. A 显示「已拒绝」；B 通过 `session.resume` 的 `open_requests` 对账，把共享请求折成
   「已由另一端处理」回执。

## 结果

| 检查                                 | 结果                          |
| ------------------------------------ | ----------------------------- |
| 专用 profile 创建（API）             | ✅ `mosbot-probe-dual-171837` |
| 两端打开同一 Bot Chat                | ✅                            |
| A 收到自己的真实回复                 | ✅ `dual-ok`                  |
| **B 观察到同一回复（跨客户端聊天）** | ✅ `dual-ok`                  |
| A 收到审批卡                         | ✅                            |
| **B 也收到同一审批请求**             | ✅                            |
| A 拒绝后显示回执                     | ✅ `已拒绝`                   |
| **B 折成跨端回执**                   | ✅ `已由另一端处理`           |

报告：`docs/evidence/tmp/dual-client-2026-11-04T09-21-23-044Z.json`。

## 实现与修复

- 网关在另一端处理完请求后**不推送** resolution 事件；客户端在有未处理请求时每 5 s 调
  `session.resume {session_id: stored id, omit_messages:true}` 读取 `open_requests`，消失的 id
  转成 `request-cancel reason=resolved-elsewhere`。本端回答时会先把 id 从对账集合移除，避免把
  自己的回执覆盖成“另一端处理”。
- 渲染层把该事件折成 `ApprovalResolutionAction='remote'`，文案「已由另一端处理 / Handled in
  another window」，保留卡片而不是静默消失。
- **修复真实缺陷**：`search-activate` 只改 `selectedBotId`，未同步 `remote.selectedProfile`，
  导致通过搜索结果切 Bot 时 live 会话仍停留在上一个 Bot（输入条禁用/可能发错会话）。
- 测试：`tests/unit/store.test.ts` 覆盖搜索切换 remote 选中；`tests/unit/chat.test.ts` 覆盖
  远端回执折叠；单测 162、E2E 21 通过。
- 调试用状态入口：`?diag=1`（仅 `MOSBOT_DIAG=1` 时主进程追加，测试用，不影响正常启动）。

## 未覆盖

- 两端同时发送/并发回答同一请求的冲突路径；通知点击跨端；网络断开重连后的双端对账。
- 双 viewer 电脑租约争用见 `m4-attachments-and-computer.md`（M0c 服务端依赖）。

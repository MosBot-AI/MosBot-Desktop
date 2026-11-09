# M1 · 聊天纵切 · 验收汇总

[English](m1-summary.md)

- 卡片：M1（登录、已有 Bot、发送、Markdown、历史分页、审批/澄清、停止、恢复、后台提醒、草稿持久化）
- 状态：**代码实现完成并通过自动验证；macOS 通知横幅/点击已验证。剩余：真实网卡断开、修复后的真实鼠标点击、跨端审批回执（#19）。**
- 记录时间：2026-11-09（历史：2026-11-04）
- 目标服务：`192.168.2.171:9119`（v0.22.5 / `bf0203a794`）

## 对照验收项

| 验收项                                  | 状态                 | 证据                                                                                                   |
| --------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| 真实登录（系统浏览器 + PKCE）与静默恢复 | ✅                   | `m1-first-connection-zh.md`、`capabilities-zh.md`                                                      |
| 已有 Bot 名单与 Bot Chat 历史           | ✅                   | `m1-roster-and-history-zh.md`                                                                          |
| 发送、流式 delta、Markdown、停止        | ✅                   | `m1-chat-streaming-zh.md`（真实探针：delta、complete、interrupted）                                    |
| 历史分页（加载更早）                    | ✅                   | `m1-roster-and-history-zh.md`（真实：older=16、nextOffset=100）                                        |
| 审批/澄清卡与按 request id 回执         | ✅                   | 真实请求/拒绝/允许/回执见 `m1-background-approvals-zh.md`                                              |
| 断线恢复与事件回放                      | ✅ 实现 + 注入式单测 | 真实断网场景待构造                                                                                     |
| 后台未打开 Bot 的待处理发现 + 系统通知  | ✅                   | 2026-11-09 真实横幅；点击修复 + 回归 `scripts/gui-pending-open.mjs`；见 `m1-notification-visual-zh.md` |
| 草稿/选中项/右栏/偏好持久化             | ✅                   | 重启 E2E `persistence.spec.ts`                                                                         |
| 工作记录归组                            | ✅                   | `m1-chat-streaming-zh.md`                                                                              |
| 双端同时观察/停止/审批                  | ✅                   | `m1-dual-client-zh.md`、`m1-concurrency-and-crash-zh.md`；跨端回执失败见 #19                           |

## 2026-11-04 真实服务复跑

专用 profile 自动清理的 `chat` 探针重新通过：发送、首个 delta、终态、停止、附件上传与模型读取、
产物索引（含真实 `mtime`）与读取均 pass；审批仍未自然触发（部署对 terminal 工具自动放行，
`approval_mode=unknown`），列入未关闭项。报告：
`docs/evidence/tmp/dashboard-chat-2026-11-04T06-39-26-736Z.json`。

## 自动验证

- `pnpm test`：173 用例（协议、传输、PKCE、凭据、RPC、聊天、持久化、待处理 watcher、pending-open、Markdown）
- `pnpm test:e2e`：21 用例（M0a 切片 + M5 可访问性 + 重启持久化 + 升级）
- `pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `pnpm package`：通过

## 未关闭项

1. 真实网卡断开/回放：重连与 `session.events.since` 补发已用模拟 socket 断开覆盖，真实网卡断开尚未构造。
2. 通知点击修复后尚未再次做真实鼠标点击；同一 IPC 处理路径由 `scripts/gui-pending-open.mjs` 覆盖。
3. 双客户端观察/停止/审批已有专门证据（`m1-dual-client-zh.md`、`m1-concurrency-and-crash-zh.md`）。
4. **2026-11-09 复跑跨端审批回执失败**（#19，服务端响应路由）；修复并复验前 M1 保持阻塞。

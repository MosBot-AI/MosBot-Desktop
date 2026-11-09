# M1 · 首次连接与静默恢复 · 证据

[English](m1-first-connection.md)

- 卡片：M1（首次连接、登录与凭据保存）；M0b 协议基础已通过真实服务验证
- 状态：**首次连接界面与凭据持久化已完成并验证**；M1 的名单/聊天真实数据切换尚未开始
- 记录时间：2026-11-04
- 数据来源：真实 Dashboard `192.168.2.171:9119`（v0.22.5 / `bf0203a794`）；界面截图中的聊天仍是脱敏 fixture

## 已实现

- 左下连接入口：底栏显示真实账号与连接状态点（未连接时仍显示设计样例标识）。
- 首次连接弹层（`ConnectionDialog`）：Dashboard 地址输入、预检状态、登录方式选择、浏览器交接、
  连接摘要（账号/地址/会话有效期）、注销与重试；错误按类型给出中文/英文文案。
- 登录链路：`preflight → /auth/native/authorize（系统浏览器）→ loopback 回调 → /auth/native/token`
  （RFC 8252 PKCE + state 校验）；多提供方时先选择。
- 凭据保存：刷新令牌经 Electron safeStorage（Keychain）加密写入 userData 的
  `dashboard-credentials.json`；access token 只在内存；**非密钥**偏好（上次地址）写入
  `dashboard-settings.json`。
- 静默恢复：应用启动时读取上次地址并调用 `dashboard.restore`，成功则底栏显示账号，不提示输入；
  失败按 `session_expired` 等类型提示重新登录。
- 安全边界：renderer 只拿到账号快照，永远看不到 token；IPC 只接受应用自身顶层 frame。

## 验证

| 检查                                                 | 结果                                                                                    |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | 通过                                                                                    |
| `pnpm test`                                          | 96 个用例通过（含协议、传输、PKCE、凭据库、RPC、store）                                 |
| `pnpm test:e2e`                                      | 10 个用例通过，新增「打开连接弹层 → 非法地址报错 → Esc 关闭并回焦」                     |
| 真实登录                                             | 用户在系统浏览器完成一次 `basic` 登录；`/api/auth/me`、刷新轮换、ws-ticket 均通过       |
| 静默恢复                                             | 无浏览器、无输入，重启应用后底栏直接显示账号 `research`；截图 `12-connected-footer.png` |
| 凭据不落明文                                         | 凭据文件为 safeStorage 密文；renderer 无法读取 token                                    |

## 截图

- `docs/evidence/screens/m0a/12-connection.png`：首次连接弹层（未连接，地址预填测试部署）
- `docs/evidence/screens/m1/12-connected-footer.png`：重启后静默恢复，底栏显示账号
- `docs/evidence/screens/m1/13-connection-connected.png`：已连接摘要（账号/地址/会话有效期/注销）

## 待办（M1 后续）

- 用真实 `profiles.list` 替换 fixture 名单；真实 Bot Chat 历史、流式回复、停止与恢复。
- 应用内重新登录/注销后的草稿隔离、通知与窗口生命周期。
- 用户实际操作验收（当前仅自动截图与探针验证）。

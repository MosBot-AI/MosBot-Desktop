# Dashboard 能力矩阵（M0b）

- 唯一验收目标：`192.168.2.171:9119`（系统浏览器登录，RFC 8252 PKCE + loopback）
- 本地源码基线：`hermes-agent@c419cf7c86`；**部署实测：v0.22.5 / commit `bf0203a794` / release 2026.9.24**
- 版本关系：部署 commit 是本地基线的祖先（落后 3133 个提交）。凡本客户端依赖的方法以**部署实测**为准，差异与最低兼容版本在 M0c 记录。
- 记录时间：2026-11-03
- 探针：`MOSBOT_DASHBOARD_URL=http://192.168.2.171:9119 npm run test:integration`（无凭据部分可用 `MOSBOT_PROBE_MODE=preflight` 单独重跑）
- 说明：本文件只记录脱敏字段形状、状态与结论；令牌、票据、凭据、真实会话正文、账号身份值不进入证据。
- 状态：**第 1、2、3 步与第 4 步的读路径/写路径已验证**（2026-11-04 用户在系统浏览器完成一次 basic 登录，凭据经 safeStorage 保存并可静默恢复）；第 5、6 步未验证；第 4 步的部分写入（模型配置）已在专用 profile 上验证

## 部署实测摘要（只读）

| 项                      | 实测值                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/health`           | `200`，`version=0.22.5`，`commit=bf0203a794`，`auth_required=true`，耗时约 18 ms                                                                       |
| `/api/status`           | `200`，`overall=ok`，`gateway_running=true`，`gateway_state=running`，`gateway_mode=multiplex`，31 个顶层字段                                          |
| 鉴权形态                | `auth_required=true`，`auth_flows=[cookie, native_pkce]`，`auth_providers=[basic]`（Username & Password，`supports_password=true`）                    |
| 登录入口                | `/auth/native/authorize`（合法参数）→ `302 /login` 并下发 PKCE Cookie；用户在同一 Dashboard 的登录页输入账号密码后，经 loopback 回调把 code 交给桌面端 |
| Scheme / 前缀           | 明文 `http://192.168.2.171:9119`，无前缀、无反代；属于方案允许的唯一精确 origin 例外                                                                   |
| `install_id` / profiles | `install_id` 存在（值不记录）；已有多个 profile，本轮**不改动**，写入只针对带本轮标识的新测试对象                                                      |
| 证据                    | `docs/evidence/probes/preflight-*.json`（探针原始行，已脱敏）                                                                                          |

## 第 1 步 · REST 探活与认证

| 能力                                         | 本地与部署版本                                | 请求结果                                             | 必交或扩展   | 状态                | 负责人   | 依赖卡  | 关闭证据                           |
| -------------------------------------------- | --------------------------------------------- | ---------------------------------------------------- | ------------ | ------------------- | -------- | ------- | ---------------------------------- |
| `/api/health` 探活                           | 本地 c419cf7c86 / 部署待测                    | 待探针                                               | 必交         | 未验证              | 主 Agent | M0b     | `pnpm test:integration` 报告       |
| `/api/status` 部署状态与 auth_flows          | 同上                                          | 待探针                                               | 必交         | 未验证              | 主 Agent | M0b     | 同上                               |
| `/api/auth/providers` 提供方列表             | 同上                                          | 待探针                                               | 必交         | 未验证              | 主 Agent | M0b     | 同上                               |
| `GET /auth/native/authorize` + loopback 回调 | 同上                                          | 待探针                                               | 必交         | 未验证              | 主 Agent | M0b     | 登录回调 + state 校验记录          |
| `POST /auth/native/token` 换码（PKCE S256）  | 同上                                          | 待探针                                               | 必交         | 未验证              | 主 Agent | M0b     | token 形状（不含值）               |
| `/api/auth/me` 身份                          | 同上                                          | 待探针                                               | 必交         | 未验证              | 主 Agent | M0b     | 脱敏 user id / provider            |
| `POST /auth/native/refresh` 刷新与轮换       | 同上                                          | 待探针                                               | 必交         | 未验证              | 主 Agent | M0b     | 轮换成功 + 旧 RT 失效              |
| 失效刷新令牌 401 `session_expired`           | 同上                                          | 待探针                                               | 必交         | 未验证              | 主 Agent | M0b     | 探针 `refresh_invalid` 行          |
| `POST /api/auth/ws-ticket` 一次性票据        | 同上                                          | 待探针                                               | 必交         | 未验证              | 主 Agent | M0b     | ttl/长度（不记票据）               |
| 注销：本地清除凭据                           | 本地实现                                      | 待探针                                               | 必交         | 未验证              | 主 Agent | M0b     | 注销后快照断开                     |
| 服务端注销（撤销 bearer 会话）               | 源码 c419cf7c86                               | `/auth/logout` 依赖 Cookie，无可用的 bearer 撤销端点 | 必交（部分） | 缺失（待 M0c 评估） | 主 Agent | M0b/M0c | 源码核查 + 探针 `remote_logout` 行 |
| 浏览器取消登录 / 超时                        | 本地实现                                      | 待用户手动复验                                       | 必交         | 未验证              | 主 Agent | M0b     | 取消后应用回到可重试状态           |
| 代理 / 证书 / URL 前缀                       | 本地实现（Electron 网络栈 + manual redirect） | 待探针                                               | 必交         | 未验证              | 主 Agent | M0b     | 前缀地址 + 重定向拒绝记录          |

## 第 2 步 · WS 与已有 Bot

| 能力                                             | 请求结果         | 必交或扩展 | 状态   | 负责人   | 依赖卡 |
| ------------------------------------------------ | ---------------- | ---------- | ------ | -------- | ------ |
| `?ticket=` 一次性 WS 握手                        | 待实现 WS 客户端 | 必交       | 未验证 | 主 Agent | M0b    |
| ticket 过期/重复使用拒绝                         | 待验证           | 必交       | 未验证 | 主 Agent | M0b    |
| `gateway.ready`、`profiles.list`、`session.list` | 待验证           | 必交       | 未验证 | 主 Agent | M0b    |
| resume、`session.events.since`、停止             | 待验证           | 必交       | 未验证 | 主 Agent | M0b    |

## 第 3–6 步（新 Bot、工作台、文件与后台、电脑）

| 能力                                         | 状态   | 负责人   | 依赖卡  |
| -------------------------------------------- | ------ | -------- | ------- |
| 新 Bot 授权、首回复、双端标题竞争            | 未验证 | 主 Agent | M0b/M0c |
| Profiles / Sessions / Kanban REST 与 WS 游标 | 未验证 | 主 Agent | M0b/M0c |
| 文件上传、产物索引、保存与外开               | 未验证 | 主 Agent | M0b/M0c |
| 未打开 Bot 的审批发现、跨端回执、通知        | 未验证 | 主 Agent | M0b/M0c |
| 电脑状态、唤醒、预览、非抢占接管、租约       | 未验证 | 主 Agent | M0b/M0c |

## 客户端接入状态（2026-11-04）

- 登录界面与静默恢复已实现：首次连接弹层（地址 → 预检 → 选择登录方式 → 系统浏览器 → 连接摘要）、
  左下账号状态、注销；启动时用 safeStorage 中的刷新令牌静默恢复，不重复输入。
- 证据：`docs/evidence/m1-first-connection.md`、`docs/evidence/screens/m1/`；离线表单/错误路径有 E2E。
- 真实名单与 Bot Chat 历史已接入：连接后名单来自 `profiles.list`，Bot Chat 历史来自 REST 分页；
  发送、流式 delta、终态、停止、审批/澄清卡、工作记录归组与自动重连已实现并在专用 profile 上验证；
  `client.capabilities {server_requests:true}` 实测返回 16 个方法（含 approval/clarify）。真实审批请求
  因部署对 `echo` 类命令自动放行而未触发，待自然触发复验。历史分页（更早一页）与 Markdown 渲染
  （安全 HTML/链接）已实现并验证。草稿/选中项/偏好已持久化并通过重启 E2E；断线回放
  （`session.events.since` + seq 去重 + open_requests 重投）已实现，真实网络断开场景待构造。
  未打开 Bot 的待处理请求由后台 watcher 轮询 `session.active_list` 发现（只读附加 + `open_requests`），
  应用内计数与系统通知已实现；真实审批触发与通知展示待自然条件复验。
- M2 新建/外观后端已接入真实服务并验证：fresh `profiles.create`、`ui_meta['hermes-bots']` 外观 CAS、
  过期 revision 冲突、改名、`/api/model/info` 就绪回读；创建弹层真实提交与模型引导已接入。
  置顶、分区（新建/重命名/删除/移入移出/折叠）与外观/改名编辑已实现，组织状态存入本地 schema v2
  （v1 自动迁移）并重启恢复。
- M3 工作台：`/hermes` 外壳（返回保留聊天状态）与 Profiles/Sessions/Kanban 只读子页已接入真实 REST；
  真实探针验证分页（total 1791、offset 不重叠）、搜索、消息分页、看板快照与 `latest_event_id`。
  Kanban 新建任务/改状态（专用 board 验证、游标 0→2）、WS 实时事件（事件帧、cursor 3、connected）
  与模型配置写入（专用 profile 写入并回读）已通过。
- M4 第一块：附件上传（`file.attach` data URL）与真实推理读取已打通；电脑 `display.status`、
  `display.thumbnail`（休眠时无帧、不伪造）与显式唤醒入口已接入。产物索引/保存/打开、观看/接管窗口
  与租约待下一段。
  证据：`docs/evidence/m1-roster-and-history.md`、`docs/evidence/m1-chat-streaming.md`。
- 未连接时仍使用 fixture，M0a 演示不受影响。

## 已登录证据说明

- 凭据：刷新令牌经 Electron safeStorage（Keychain）加密存于应用 userData 的
  `dashboard-credentials.json`；access token 只在内存。探针使用独立 userData
  （`.tmp/userdata-probe`），因此与日常应用互不影响。
- 会话保持：探针默认**不注销**，后续运行先静默恢复再刷新；只有设置
  `MOSBOT_PROBE_SIGN_OUT=1` 时才验证注销并清除凭据。
- 重复运行：`MOSBOT_PROBE_MODE=restore` 只恢复 + 跑第 1 步；`ws` 跑第 2 步；`workbench` 跑第 4 步
  读路径；`newbot` / `kanban` / `writes` 跑第 3、4 步写入（专用对象自动清理）；`all` 跑只读全量；
  `MOSBOT_PROBE_TICKET_EXPIRY=1` 额外等待 31 s 复验过期。
- 部署源码对照：本机 `~/.hermes/hermes-agent` 正好是部署 commit `bf0203a794`，第 3/4 步的请求
  形状按它核对；本地基线 `c419cf7c86` 更新，差异在 M0c 记录。

## 关闭条件

- 第 1 步全部必交项通过后，把上表状态改为已验证并登记探针报告路径与关键字段。
- 服务端注销缺失、以及其他缺失的必交能力进入 M0c，并在 `docs/plans/03-agent-handoff.md` 的 M0c 表中登记负责人、最小兼容契约与复验条件。
- 未完成登录复验前，不把任何一项标为“已验证”。

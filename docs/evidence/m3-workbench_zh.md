# M3 · Hermes 工作台（外壳 + 三个只读子页）· 证据

- 卡片：M3（Profiles 概览/详情、Sessions 分页/搜索/历史、Kanban 看板快照、返回聊天恢复）
- 状态：**工作台外壳、三个子页、Kanban 新建/改状态与实时 WS 游标、模型配置写入均已接入并验证**
- 记录时间：2026-11-04
- 目标服务：`192.168.2.171:9119`（v0.22.5 / `bf0203a794`），只读

## 实现

- **入口与外壳**：左下菜单「Hermes 工作台」打开覆盖全窗口的 `/hermes` 表面，顶栏为「返回 Bots」、
  三个子页（Profiles / Sessions / Kanban）与当前 Dashboard 地址。聊天外壳保持挂载（隐藏），返回时
  Bot、草稿、滚动位置与详情栏原样保留。
- **Profiles**：真实 `profiles.list`（WS，经 `listBots`）列表 + 本地过滤；详情显示显示名、简介、
  model/provider、canonical Bot Chat、是否默认；选中后读 `/api/model/info` 显示就绪状态，
  「打开配置页」复用 M2 的配置入口。
- **Sessions**：`GET /api/sessions?profile&order=recent&limit&offset` 分页（加载更多），
  `GET /api/sessions/search?q&profile` 搜索，`GET /api/sessions/{id}/messages` 只读历史（更早分页）；
  可切换 profile，canonical Bot Chat 会标注；未连接时显示专用空态。
- **Kanban**：`GET /api/plugins/kanban/boards` 看板列表 + `GET /api/plugins/kanban/board?board=`
  列/任务快照（显示 `latest_event_id`）；支持新建任务（`POST /tasks`）和修改状态（`PATCH /tasks/{id}`），
  写入后重读快照回显；插件不可用或没有看板时显示专用空态，其他子页不受影响。
- **模型配置写入**：Profiles 详情可编辑 provider/model，`PUT /api/profiles/{name}/model` 后重新读取
  `/api/model/info` 与名单，回显就绪状态；失败保留输入并提示。
- **Kanban 实时事件**：主进程按 board 建立独立 WS `/api/plugins/kanban/events?board&since&ticket`；
  ticket 每次重连重新签（30 s），游标从 `latest_event_id` 起，断线按 2/4/8/15 s 退避并带旧游标续上；
  切换 board 关闭旧 watcher（旧帧不会写入新 board）；渲染层收到事件后 300 ms 防抖重读快照，
  若快照 `latest_event_id` 小于本地游标（重置/恢复）则用新游标重订阅。
- 主进程新增 `workbench.ts` 归一化层（会话/消息/看板），经 IPC 暴露给渲染层；所有参数做边界校验。

## 验证

| 检查                                         | 结果                                                                                                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 真实工作台探针 `MOSBOT_PROBE_MODE=workbench` | ✅ Profile 列表/active、模型读取（openai-codex / gpt-6-luna-900k）、Sessions 分页（returned=5 · total=1791 · 偏移不重复 overlap=0）、搜索（results=5）、历史消息分页、Kanban boards（1 个看板、7 个任务）、board 快照与 `latest_event_id` |
| 真实 Kanban 写入探针（专用 board，自动清理） | ✅ 新建 board → 新建任务（id、status=ready）→ 详情回读 → 状态写入 `done` → 游标 0→2 → 删除 board，remaining_board=false                                                                                                                   |
| 真实模型配置写入（专用 profile）             | ✅ `PUT /api/profiles/{name}/model` 写入后回读 `provider=openai-codex · model=gpt-6-luna-900k · ready=true`                                                                                                                               |
| `pnpm test`                                  | **133 个用例通过**                                                                                                                                                                                                                        |
| `pnpm test:e2e`                              | **12 个用例通过**，新增「打开工作台 → 返回 Bots → 草稿仍在」                                                                                                                                                                              |
| typecheck / lint / format / package          | 通过                                                                                                                                                                                                                                      |
| 截图                                         | `docs/evidence/screens/m0a/13-workbench.png`（未连接空态）                                                                                                                                                                                |

## 未完成 / 下一段

- 连接态工作台的真实窗口截图与用户验收（需登录后实际操作）。
- 已修复：验证时发现 `probeWorkbench` IPC handler 重复注册导致启动失败，已删除重复项并复验。

## 2026-11-04 跨客户端 Kanban 刷新（专用 board）

`scripts/gui-workbench-refresh.mjs`（隐藏窗口、两个客户端、同一账号）：
probe 创建并**保留**专用 board（`MOSBOT_PROBE_KEEP_BOARD=1`，只动 `mosbot-probe-board-*`），
客户端 A 打开工作台选中该 board，客户端 B 通过 `kanbanCreateTask` 新建任务，A 点「刷新」后看到
任务。结束后再跑一次普通 probe：启动时删除遗留的 probe board 并自建自删。

| 检查                             | 结果                      |
| -------------------------------- | ------------------------- |
| 专用 board 创建并保留            | ✅ `mosbot-probe-board-*` |
| A 打开工作台并选中该 board       | ✅                        |
| B 创建任务                       | ✅ `t_… ready`            |
| **A 刷新后看到另一客户端的任务** | ✅ `另一客户端任务-…`     |

报告：`docs/evidence/tmp/workbench-refresh-2026-11-04T11-19-10-251Z.json`。

仍未验证：插件禁用状态的真实部署证据、切换 board/profile 后迟到响应的真实双端隔离。

## 2026-11-04 切换 board 的旧响应隔离（注入延迟）

`scripts/gui-workbench-stale.mjs`：创建两个专用 probe board，给 board A 注入 2.5s 延迟；A 先选中
慢 board，随即切到快 board。旧响应晚到后不得覆盖当前 board。

| 检查                                        | 结果 |
| ------------------------------------------- | ---- |
| 两个专用 board 创建                         | ✅   |
| 另一客户端在慢 board 建任务                 | ✅   |
| 切走后旧响应被丢弃（看不到慢 board 的任务） | ✅   |
| 当前快 board 保持选中                       | ✅   |
| 再切回慢 board 能看到任务                   | ✅   |

报告：`docs/evidence/tmp/workbench-stale-2026-11-04T11-53-07-488Z.json`。

**修复**：`loadBoard` 之前无条件 `setSnapshot`，迟到的旧 board 响应会覆盖当前 board。现在响应
返回后先检查 `slug === currentBoard.current`，不是当前 board 直接丢弃；切换 board 时同步更新
`currentBoard.current`，消除 effect 更新前的竞态。延迟仅为测试 seam
（`MOSBOT_TEST_KANBAN_SLOW_BOARD`），正常启动不生效。

仍未验证：切换 profile/账号后的迟到响应隔离；插件禁用状态的部署证据。

## 2026-11-04 切换 profile 的旧 sessions 响应隔离（注入延迟）

`scripts/gui-sessions-stale.mjs`：专用空 profile 注入 2.5s 延迟；先选中它（慢），立即切到一个
已有会话的 Bot（快）。旧空列表晚到不得覆盖快 profile 的会话列表。

| 检查                                       | 结果     |
| ------------------------------------------ | -------- |
| 快 profile 基线有可见会话                  | ✅ 50 条 |
| 切走后旧 sessions 响应被丢弃（列表仍非空） | ✅ 50 条 |
| 快 profile 保持选中                        | ✅       |
| 切回空 profile 显示“还没有会话”            | ✅       |

报告：`docs/evidence/tmp/sessions-stale-2026-11-04T12-09-15-586Z.json`。

**修复**：`SessionsPage` 的 `load` / 搜索 / 打开会话 / 加载更多消息都增加“请求的 profile / query /
session 是否仍是当前值”的守卫，旧响应直接丢弃；切换 profile 时同步更新 ref。延迟仅为测试 seam
（`MOSBOT_TEST_SESSIONS_SLOW_PROFILE`）。

仍未验证：搜索输入与消息面板的同类守卫未单独做真实延迟复现；插件禁用状态。

## 2026-11-04 搜索输入切换的旧响应隔离（注入延迟）

`scripts/gui-search-stale.mjs`：先输入一个无结果的慢查询（注入 2.5s 延迟），立即改成能命中的
查询；旧空结果晚到不得清空新结果。

| 检查                                       | 结果 |
| ------------------------------------------ | ---- |
| 会话列表与可搜索的标题可用                 | ✅   |
| 旧查询的迟到结果被丢弃（新结果仍有 30 条） | ✅   |
| 输入框仍是当前查询                         | ✅   |

报告：`docs/evidence/tmp/search-stale-2026-11-04T12-15-56-630Z.json`。

延迟仅为测试 seam（`MOSBOT_TEST_SEARCH_SLOW_QUERY`）。消息面板（打开会话/加载更多）的同类守卫
已加，但未单独做延迟复现。

## 2026-11-04 消息面板切换会话的旧响应隔离（注入延迟）

`scripts/gui-messages-stale.mjs`：用默认 profile 两个真实会话（只读），给第一个会话的消息接口注入
2.5s 延迟；先打开它，随即打开第二个会话，旧消息不得覆盖新 transcript。

| 检查                             | 结果 |
| -------------------------------- | ---- |
| 找到两个内容可区分的会话（只读） | ✅   |
| 两个会话在列表中可见             | ✅   |
| 新会话 transcript 正确显示       | ✅   |
| 旧会话迟到消息被丢弃             | ✅   |

报告：`docs/evidence/tmp/messages-stale-2026-11-04T15-26-15-853Z.json`。延迟仅测试 seam
（`MOSBOT_TEST_MESSAGES_SLOW_SESSION`），正常启动不生效。至此工作台的列表 / 搜索 / 消息三类
旧响应隔离都有真实服务验证。

## 2026-11-04 插件禁用状态：Dashboard API 不可达

用授权的测试服会话直连 REST 尝试读取/切换插件：`/api/dashboard/agent-plugins` 返回 **404
`Headless backend (hermes serve): web UI disabled`**。该部署是 `hermes serve` 无头后端，没有 dashboard
插件管理路由；禁用 Kanban 需要服务端 `hermes plugins disable <key>` 并重启/重扫 gateway。因此
“插件禁用空状态”无法通过现有 API 构造，记录为服务端配置依赖，不做伪验证。

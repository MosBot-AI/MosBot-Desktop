# M3 · Hermes 工作台（外壳 + 三个只读子页）· 证据

- 卡片：M3（Profiles 概览/详情、Sessions 分页/搜索/历史、Kanban 看板快照、返回聊天恢复）
- 状态：**工作台外壳、三个子页、Kanban 新建/改状态、模型配置写入均已接入并验证；Kanban WS 实时游标待下一段**
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

- WS `/api/plugins/kanban/events?board&since` 游标订阅、断线续传与缺口重抓快照；切换 board 时旧事件
  不得更新新 board。
- 连接态工作台的真实窗口截图（需用户登录后操作）。
- 已修复：验证时发现 `probeWorkbench` IPC handler 重复注册导致启动失败，已删除重复项并复验。

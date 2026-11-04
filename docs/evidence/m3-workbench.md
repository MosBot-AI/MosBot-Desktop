# M3 · Hermes 工作台（外壳 + 三个只读子页）· 证据

- 卡片：M3（Profiles 概览/详情、Sessions 分页/搜索/历史、Kanban 看板快照、返回聊天恢复）
- 状态：**工作台外壳与三个子页的只读真实 REST 已接入并验证；Kanban 写入/WS 游标与配置写入待下一段**
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
  列/任务快照（只读，显示 `latest_event_id`）；插件不可用或没有看板时显示专用空态，其他子页不受影响。
- 主进程新增 `workbench.ts` 归一化层（会话/消息/看板），经 IPC 暴露给渲染层；所有参数做边界校验。

## 验证

| 检查                                         | 结果                                                                                                                                                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 真实工作台探针 `MOSBOT_PROBE_MODE=workbench` | ✅ Profile 列表/active、模型读取（openai-codex / gpt-6-luna-900k）、Sessions 分页（returned=5 · total=1791 · 偏移不重复 overlap=0）、搜索（results=5）、历史消息分页、Kanban boards（1 个看板、7 个任务）、board 快照与 `latest_event_id` |
| `pnpm test`                                  | **133 个用例通过**                                                                                                                                                                                                                        |
| `pnpm test:e2e`                              | **12 个用例通过**，新增「打开工作台 → 返回 Bots → 草稿仍在」                                                                                                                                                                              |
| typecheck / lint / format / package          | 通过                                                                                                                                                                                                                                      |
| 截图                                         | `docs/evidence/screens/m0a/13-workbench.png`（未连接空态）                                                                                                                                                                                |

## 未完成 / 下一段

- Kanban 新建任务、状态修改与回读；WS `/api/plugins/kanban/events?board&since` 游标订阅、断线续传与
  快照重抓（M0b 已有只读快照基础）。
- Profile 的默认模型配置写入（`PUT /api/profiles/{name}/model`）与回读，复用 M2 的就绪逻辑；
  需专用 profile 验证。
- 连接态工作台的真实窗口截图（需用户登录后操作）。
- 修复：验证时发现 `probeWorkbench` IPC handler 重复注册导致启动失败，已删除重复项并复验。

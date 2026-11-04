# M1 · 本地状态持久化与断线回放 · 证据

- 卡片：M1（草稿持久化、断线恢复）
- 状态：**草稿/选中 Bot/右栏/语言外观持久化已实现并通过重启 E2E；断线回放已实现并由单测覆盖**；
  真实网络断开后的回放尚未在活服务上构造
- 记录时间：2026-11-04

## 本地状态持久化

- 主进程单写 `userData/local-state.json`（版本 1）：按连接（`displayUrl`，fixture 用 `fixture`）保存
  `selectedProfile`、草稿、右栏（开关/页签/宽度）；全局保存主题与语言。
- 写入：临时文件 + 原子 rename；覆盖前备份为 `local-state.json.bak`；损坏文件按空处理；检测到更高
  `version` 时拒绝写入（不降级覆盖）。
- IPC：仅接受应用自身顶层 frame；校验结构、草稿数量/长度与 2 MB 上限。
- 渲染层：启动时读取并 hydrate；订阅 store 以 600 ms 防抖写盘，窗口 `beforeunload` 立即刷盘；
  切换连接时按新 key 重新 hydrate。fixture 与真实连接各自独立。

## 断线回放

- `ChatManager` 记录 `gateway.ready` 的 `replay_epoch` 与每个事件的 `seq`：
  - 重连后先 `session.resume`，再 `session.events.since {session_id,last_seen}` 回放漏掉的增量；
  - 按 `seq` 去重（重复帧不会二次应用）；`latest_seq` 推进水位；
  - `truncated` 或 `replay_epoch` 变化时发出 `history-stale`，渲染层重新拉取历史页并重置实时段；
  - 回放结果里的 `open_requests`（未回答的审批/澄清）重新投递给卡片，避免断线后问题消失；
  - `resume` 显示回合仍在运行时补发 `turn-start`，保证 Stop 可用。
- 事件按 `session_id` 过滤，避免多会话事件串台。

## 验证

| 检查                                                 | 结果                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | 通过                                                                                                     |
| `pnpm test`                                          | **127 个用例通过**（新增本地 store 4 个、持久化投影/hydrate、回放去重与 open_requests 重投）             |
| `pnpm test:e2e`                                      | **11 个用例通过**，新增 `persistence.spec.ts`：选择 Bot + 输入草稿 → 完全退出 → 重启，选中项与草稿都恢复 |
| 打包                                                 | `pnpm package` 通过                                                                                      |

## 待办

- 真实服务上构造一次网络断开（例如关闭网络接口）验证回放；当前回放由注入式网关单测覆盖。
- 未读位置、附件元数据、待确认操作 id 的持久化随 M1/M4 后续补齐。
- schema 迁移路径目前只有版本 1；引入第二版时补迁移与失败恢复测试。

## 2026-11-04 真实连接冷启动 + 草稿恢复

`scripts/gui-connected-draft.mjs`（打包产物 + 真实服务 + 专用 Bot）：

| 检查                          | 结果                           |
| ----------------------------- | ------------------------------ |
| 专用 Bot 中输入草稿（不发送） | ✅                             |
| 完整退出并重新启动            | ✅                             |
| 冷启动恢复到同一 Bot Chat     | ✅                             |
| 草稿文本原样恢复              | ✅ `真实连接下的草稿-请勿发送` |

报告：`docs/evidence/tmp/connected-draft-2026-11-04T10-12-40-182Z.json`。这补齐了此前“真实连接下
冷启动落点与草稿恢复”的缺口；跨星期的已读位置仍未验证。

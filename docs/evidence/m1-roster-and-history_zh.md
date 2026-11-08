# M1 · 真实名单与 Bot Chat 历史（只读）· 证据

- 卡片：M1（真实数据接入第一段）
- 状态：**连接后名单与历史已从真实 Dashboard 读取并渲染**；历史分页已实现；发送/流式/停止见 `m1-chat-streaming_zh.md`
- 记录时间：2026-11-04
- 数据来源：真实 Dashboard `192.168.2.171:9119`（v0.22.5 / `bf0203a794`）
- 隐私：真实名单/会话内容不进入仓库截图；本文件只记录数量与脱敏 id，原始报告在
  `docs/evidence/tmp/`（Git 忽略）。

## 实现

- 主进程新增 `listBots()` 与 `openChat(profileName)`：
  - 名单：Gateway `profiles.list {include_sessions:true}`，映射 `name/display_name/description/model/provider/is_default/canonical_session/last_session`。
  - 历史：`session.list {profile,title:"Bot Chat",include_hidden:true}` 精确查询 → `GET /api/sessions/{storedId}/messages?limit=50&order=latest&inline_images=false`。
  - 只读映射：`role=user|assistant` 且有文本的消息才进入 transcript；工具/系统行、图片 data URI 不进 UI。
- 渲染层在连接成功后自动：
  1. 拉取真实名单，替换 fixture 名单（置顶取前 6 个，分区显示为单一 `Bots`）；
  2. 默认选中 `is_default` profile，加载其 Bot Chat 历史并渲染为现有气泡；
  3. 输入条接入真实发送与流式回复（见 `m1-chat-streaming_zh.md`）；
  4. 电脑页在真实模式下不提供唤醒入口（M4 接入前）。
- 历史分页：滚动区域顶部提供「加载更早的消息」，按 offset 向更早翻页，去重后前插并保持首条可见消息位置；加载中禁用按钮并显示状态。
- 断开连接后回退到设计样例 fixture，M0a 演示不受影响。

## 验证

| 检查                                                 | 结果                                                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | 通过                                                                                                           |
| `pnpm test`                                          | 120 个用例通过（含 profile/message 映射、远端 roster、分页与 Markdown）                                        |
| `pnpm test:e2e`                                      | 10 个用例通过（fixture 模式不受影响）                                                                          |
| 真实名单探针                                         | `MOSBOT_PROBE_MODE=roster`：10 个 profile、default 存在、10 个带 canonical session、默认模型 `gpt-6-luna-900k` |
| 真实历史探针                                         | 默认 profile 的 Bot Chat：25 条可见消息、`hasMore=true`（最新页）                                              |
| 真实历史分页                                         | `loadOlderChat`（offset 50）返回更早 16 条、`hasMore=true`、`nextOffset=100`；界面按钮带滚动锚点               |
| 静默恢复                                             | 探针先恢复登录再读取，无需重新输入                                                                             |

## 待办（M1 下一段）

- 发送（`prompt.submit`）、流式 delta/工具事件、停止、审批/澄清回复、断线恢复与回放。
- 真实名单的置顶/分区/未读（M2 整理能力）、真实外观（ui_meta）。
- 真实数据截图与用户验收（需脱敏样例或用户同意后再纳入证据）。

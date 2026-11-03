# M1 · 真实名单与 Bot Chat 历史（只读）· 证据

- 卡片：M1（真实数据接入第一段）
- 状态：**连接后名单与历史已从真实 Dashboard 读取并渲染**；发送、流式回复、审批/澄清、停止与恢复仍待下一段
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
  3. 输入条切为只读预览并说明原因，不伪造发送；
  4. 电脑页在真实模式下不提供唤醒入口（M4 接入前）。
- 断开连接后回退到设计样例 fixture，M0a 演示不受影响。

## 验证

| 检查                                                 | 结果                                                                                                           |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | 通过                                                                                                           |
| `pnpm test`                                          | 106 个用例通过（新增 profile/message 映射与远端 roster selector 测试）                                         |
| `pnpm test:e2e`                                      | 10 个用例通过（fixture 模式不受影响）                                                                          |
| 真实名单探针                                         | `MOSBOT_PROBE_MODE=roster`：10 个 profile、default 存在、10 个带 canonical session、默认模型 `gpt-6-luna-900k` |
| 真实历史探针                                         | 默认 profile 的 Bot Chat：31 条可见消息、`hasMore=true`（最新页）                                              |
| 静默恢复                                             | 探针先恢复登录再读取，无需重新输入                                                                             |

## 待办（M1 下一段）

- 发送（`prompt.submit`）、流式 delta/工具事件、停止、审批/澄清回复、断线恢复与回放。
- 真实名单的置顶/分区/未读（M2 整理能力）、真实外观（ui_meta）。
- 真实数据截图与用户验收（需脱敏样例或用户同意后再纳入证据）。

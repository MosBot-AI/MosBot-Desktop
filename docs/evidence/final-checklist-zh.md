# MosBot Desktop · 最终验收清单（给用户）

[English](final-checklist.md)

- 更新：2026-11-04
- 用途：说明**哪些已经实际验证**、**还剩哪几件需要你或外部完成**，以及每件事的具体操作与复验命令。
- 对应索引：`docs/evidence/acceptance-zh.md`（逐条证据）；本文只列“需要你动手/决策”的部分。

## 一、结论

代码可自动验证的范围内，发布候选功能已全部通过真实服务、打包产物与多客户端 GUI 验证；
**当前不能宣布首版完成**，只剩下面 5 件事，其中 3 件必须由你或服务端团队完成。

## 二、范围决定（2026-11-04 已确认）

- **电脑非抢占租约移出首版范围**：客户端保留“他人控制/被踢回只读”的正确表现；服务端补丁留待后续版本。
- **首版使用内部签名**（当前默认 ad-hoc 完整签名；Apple Development 可选）：不做 Developer ID/公证，
  第二台 Mac 首次打开需右键“打开”；Gatekeeper 不接受属于已知限制。
- **7 天日用由你自行查看**，开发侧不再把它作为待办阻塞。
- **测试服务器配置授权已确认**：可直接用其配置/设置做验证（仍需避免改真实用户 Bot 的全局配置）。

## 三、需要你做的事（剩余）

| #   | 事项                                | 为什么需要你                                                                                                | 具体操作                                                                                                                                                                          | 完成后我能做的复验                                                                                                                 |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **看一眼 macOS 通知横幅并真实点击** | 本机 shell 没有屏幕录制权限（`screencapture` 黑屏），无法自动确认系统横幅像素与鼠标点击                     | 我运行 `node scripts/gui-notification-walkthrough.mjs` 时，窗口会最小化并触发真实审批通知：确认右上角出现「Bot 名 · 需要你确认」；用鼠标点它，应用应恢复窗口并打开该 Bot 的审批卡 | 把结果记入 `m1-background-approvals-zh.md`；若你愿意给 DSH“屏幕录制”权限，我可自动截图验证                                         |
| 2   | **决定电脑非抢占租约怎么办**        | 该保证必须服务端实现；你说过测试服只授权 Dashboard API，我不会去部署                                        | 二选一：<br>A. 让服务端团队应用 `docs/patches/0001-display-lease-atomic-claim.patch` 并重启 gateway；<br>B. 明确把“非抢占接管”移出首版范围（我会如实记录降级，不冒充完成）        | 选 A：我再跑 `node scripts/gui-computer-dual.mjs`，预期由 `takeover-allowed` 变成 `takeover-refused`；选 B：更新验收范围并说明风险 |
| 3   | **Developer ID 证书 / 公证凭据**    | 本机只有 Apple Development 证书（`spctl` 拒绝），没有 Developer ID，无法做 Gatekeeper 与第二台 Mac 干净安装 | 提供 Developer ID Application 证书 + notarytool 凭据（Apple ID/Team/专用密码或 API key），或明确接受“内部开发签名、用户需右键打开”的交付方式                                      | 我会重跑 `pnpm test:install`，确认 `kind=developer-id`、`codesign --verify`、`spctl` 接受与公证票据；再做本机全新用户安装          |
| 4   | **连续 7 天日用**                   | 验收项要求“连续 7 天日常使用无阻断”，只能由真实使用产生                                                     | 从今天起每天正常使用（发消息、审批、工作台、电脑、附件均可）；有问题随时发我。我会维护 `docs/evidence/dogfood-log-zh.md` 记录日期/使用项/问题                                     | 第 7 天后我汇总证据并关闭第 11 项；任何阻断问题我当天修                                                                            |
| 5   | **确认视觉基线（M0a）**             | 界面基线需用户试用后冻结                                                                                    | 打开当前构建，对照 `docs/evidence/screens/m0a/` 与录屏要点（00:42/00:46/01:04/01:24/02:03/02:14），确认字号/间距/颜色/动效基调                                                    | 冻结基线并关闭第 3 项的视觉确认部分                                                                                                |

## 四、已经实际验证（不需要你操作）

- 连接/登录：真实 OAuth + PKCE + 静默恢复；取消登录路径。
- 聊天：真实回复、流式、工具记录、停止、终态、断线重连（fixture 回放）；**双客户端共享聊天观察**。
- 审批：真实请求/拒绝/允许/回执；后台「待确认」角标；**未打开 Bot 的 watcher 发现 + 通知请求/点击直达 + 跨端回执**；**关窗 / Dock 重开 / 退出重启后审批仍重投并可处理**。
- 生命周期：真实连接冷启动恢复选中 Bot 与草稿。
- 工作台：真实 REST/WS 读取与写入回读（分页/游标/模型）；board 切换关闭旧 watcher。
- 附件/产物：真实上传 + 模型读取、产物索引/读取/保存/打开、`mtime` 排序、已删除徽标、错误文案。
- 电脑：真实唤醒/预览/观看（RFB 1440×900）、取得/归还控制、被踢自动回只读、断网提示。
- 性能：10 分钟流式门槛（p95 31.3ms / burst 473/s / 10k 历史 52.8ms）、60 分钟 soak。
- 键盘/IME/缩放/降动态/焦点顺序/可访问名称；本机解压安装、升级迁移与损坏回退；Apple Development 签名链路。

## 五、复验命令（我可以直接跑）

```bash
pnpm typecheck && pnpm test && pnpm test:e2e
pnpm bench:stream
BENCH_SOAK_SECONDS=3600 pnpm bench:soak
MOSBOT_DASHBOARD_URL=http://192.168.2.171:9119 MOSBOT_PROBE_MODE=chat pnpm test:integration
node scripts/gui-dual-client.mjs
node scripts/gui-unopened-approval.mjs
node scripts/gui-window-lifecycle.mjs
node scripts/gui-computer-walkthrough.mjs
node scripts/gui-connected-draft.mjs
node scripts/gui-chat-reconnect.mjs
node scripts/gui-concurrent-approval.mjs
node scripts/gui-concurrent-send.mjs
node scripts/gui-workbench-refresh.mjs
node scripts/gui-workbench-stale.mjs
node scripts/gui-sessions-stale.mjs
node scripts/gui-search-stale.mjs
node scripts/gui-force-quit.mjs
```

## 六、当前不能宣称“首版完成”的原因（如实）

1. 系统通知横幅的**视觉展示与真实鼠标点击**未由人确认（代码路径已验证）。
2. 电脑**非抢占租约**在指定部署仍可被后来者抢占，修复需服务端变更，当前授权不允许。
3. **Developer ID 签名/公证**与第二台 Mac 干净安装未完成（无证书）。
4. **7 天日用**尚未开始。
5. 产物来源消息依赖服务端 `/api/files` 新字段，属服务端能力缺口（可协商是否首版必须）。

以上任一项若由你决定“移出首版”，请明确说，我会更新范围与验收记录，而不会把未验证项标成完成。

# MosBot Desktop · 最终验收清单（给用户）

[English](final-checklist.md)

- 更新：2026-11-09
- 用途：说明**哪些已经实际验证**、**还剩哪几件需要你或外部完成**，以及每件事的具体操作与复验命令。
- 对应索引：`docs/evidence/acceptance-zh.md`（逐条证据）；本文只列“需要你动手/决策”的部分。

## 一、结论

代码与自动验收已收敛，M0a 视觉基线已确认，macOS 通知横幅与点击路径已验证并修复。**当前仍不能宣布首版完成**；剩余项是第二台 Mac 干净安装、连续 7 天日用记录，以及三个服务端能力缺口。

## 二、范围决定（已确认）

- **电脑非抢占租约移出首版范围**：客户端保留“他人控制/被踢回只读”的正确表现；服务端补丁留待后续版本。
- **首版使用内部签名**（默认 ad-hoc 完整签名；Apple Development 可选）：不做 Developer ID/公证，
  第二台 Mac 首次打开需右键“打开”；Gatekeeper 不接受属于已知限制。
- **7 天日用由你自行查看**，开发侧不再把它作为待办阻塞。
- **测试服务器配置授权已确认**：可直接用其配置/设置做验证（仍需避免改真实用户 Bot 的全局配置）。

## 三、需要你做的事（剩余）

| #   | 事项                                 | 为什么需要你                                                                                       | 具体操作                                                                                                                  | 完成后我能做的复验                                                          |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 1   | **第二台 Mac / 新用户干净安装**      | 本机干净安装检查通过，但真实第二台 Mac 或新建 macOS 用户尚未测试（验收第 9 项）                    | 安装 `out/make/zip/darwin/arm64/MosBot-darwin-arm64-0.1.0.zip`，首次右键“打开”，登录并发送一条消息；记录 macOS 版本与芯片 | 我更新 `m5-install-upgrade-zh.md` 的环境与结果，并关闭 Issue #12            |
| 2   | **连续 7 天日用**                    | 验收第 11 项要求真实日常使用无阻断，无法由自动化产生                                               | 从今天起每天正常使用：发消息、审批、工作台、电脑、附件、休眠恢复与重启；遇到阻断当天反馈                                  | 我维护 `dogfood-log-zh.md`，第 7 天后关闭 Issue #13；阻断问题修复后重新起算 |
| 3   | **服务端缺口：决定范围或指定负责人** | `/api/files` 无来源消息字段（#15）、插件禁用状态（#17）、未配置模型环境（#16）需要服务端能力或配置 | 决定产物来源字段是否进首版；把服务端/插件/配置工作指派给服务端团队。电脑租约补丁（#14）已移出首版范围，不需要现在处理     | 范围/负责人明确后我更新对应 Issue 与验收行；服务端改动用现有探针复验        |

## 四、已经实际验证（不需要你操作）

- 连接/登录：真实 OAuth + PKCE + 静默恢复；取消登录路径。
- 聊天：真实回复、流式、工具记录、停止、终态、断线重连/回放、强退不重发；双客户端共享同一聊天。
- 审批：真实请求/拒绝/允许/回执；后台「待确认」角标；未打开 Bot 的 watcher；**2026-11-09 已抓取真实 macOS 通知横幅**，点击路径现在会先刷新名单再打开对应 Bot（Issue #10 已关闭；回归 `scripts/gui-pending-open.mjs`）。
- M0a：**用户已于 2026-11-09 确认视觉基线**，基线冻结。
- 生命周期：真实连接冷启动恢复选中 Bot 与草稿。
- 工作台：真实 REST/WS 读取与写入回读；旧响应隔离；board 切换关闭旧 watcher。
- 附件/产物：真实上传 + 模型读取、产物索引/读取/保存/打开、`mtime` 排序、已删除徽标、错误文案。
- 电脑：真实唤醒/预览/观看（RFB 1440×900）、取得/归还控制、被踢自动回只读、断网提示。
- 性能：10 分钟流式门槛与 60 分钟 soak。
- 键盘/IME/缩放/降动态/焦点顺序/可访问名称；本机解压安装、升级迁移与损坏回退。
- 发布产物：2026-11-09 ad-hoc 签名 ZIP，SHA-256 `56a19b77aabb5e66cd5f1efd503511e49349d2aa47e2aa3b96cfcb8b444d26f9`；`codesign --verify` 通过；除预期的 Developer ID/Gatekeeper 检查外，干净安装检查全部通过。
- 自动检查：`vitest` 173 passed，`npm run test:e2e` 21 passed，typecheck/lint/format 全绿。

## 五、复验命令（我可以直接跑）

```bash
npm run typecheck && npm test && npm run test:e2e
npm run bench:stream
BENCH_SOAK_SECONDS=3600 npm run bench:soak
MOSBOT_DASHBOARD_URL=http://192.168.2.171:9119 MOSBOT_PROBE_MODE=chat npm run test:integration
node scripts/gui-pending-open.mjs
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

1. 第二台 Mac / 新建 macOS 用户的真实干净安装未测试。
2. 连续 7 天日用记录尚未开始。
3. 三个服务端缺口（#15、#16、#17）仍待范围决定或服务端实施。
4. Developer ID 签名/公证是本次发布接受的已知限制，不阻塞但必须写进发布说明。
5. 通知点击修复后尚未再次做真实鼠标点击；同一 IPC 路径已由 `scripts/gui-pending-open.mjs` 与单测覆盖。

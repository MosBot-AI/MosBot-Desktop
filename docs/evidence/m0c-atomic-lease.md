# M0c · 电脑租约原子条件认领 · 补丁与部署说明

- 状态：**补丁仅作为对照方案保存；不部署、不改测试服**（用户 2026-11-04 明确：授权范围只是使用
  Dashboard API，不包含服务端代码/部署/重启）
- 结论：M0c 的“非抢占原子认领”必须由服务端实现；在现有 API 范围内无法从客户端补齐，M4 相应
  项保持外部依赖，需用户决定是否让服务端团队实施、或调整首版范围
- 记录时间：2026-11-04
- 部署源码基线：`bf0203a794`（测试服 v0.22.5，`~/.hermes/hermes-agent` 工作树干净）
- 补丁：`docs/patches/0001-display-lease-atomic-claim.patch`

## 问题（已在指定部署实测确认）

两个 viewer 同时打开同一 profile 的电脑画面：A 取得控制后，B 直接 `display.lease.acquire`
仍然成功，A 被 RFB close(4000) 踢下线（证书：`tmp/computer-dual-2026-11-04T08-41-37-535Z.json`）。
现有 `lease.acquire` 是 Last-writer-wins；`_transition` 虽有文件锁，但 acquire 的语义本身允许
后来者覆盖，所以“先读后 acquire”的检查存在竞态且服务端没有拒绝路径。

## 补丁内容

`tools/bot_desktop/lease.py`

- 新增 `LeaseConflict(lease)`：携带权威租约，表示“另一个人类 viewer 正持有”。
- 新增 `acquire_if_free(viewer_id, reason)`：在**同一把** per-profile 文件锁内完成
  “读当前 holder → 判断冲突或写入新 holder → epoch+1”，冲突时不修改租约。
  同一 viewer 重复 acquire 幂等（不 bump epoch）。
- 原 `acquire(...)` 保留为显式强制路径，并在 docstring 注明不得作为常规 Take over 入口
  （首版客户端不使用）。

`tui_gateway/methods_display.py`

- `display.lease.acquire` 改用 `acquire_if_free`；捕获 `LeaseConflict` 后返回
  `_err(..., data={"code": "lease_conflict", "lease": public_view(conflict.lease)})`。
  客户端据此显示“其他人正在控制”，不再把失败当作断线。

## 客户端配套（已提交）

- RPC 错误现在携带 `error.data.code`（`ProtocolError.serverCode`），不再丢掉机器可读码。
- 观看窗口 acquire 收到 `lease_conflict` 时保持只读并显示「其他人正在控制，需对方先归还。」，
  不把状态置为断线；非冲突错误仍按原逻辑处理。
- 单测：`tests/unit/rpc.test.ts` 覆盖 error.data.code 透传。

## 部署步骤（需要 SSH/服务权限）

```bash
# 1. 在测试服源码目录（bf0203a794 干净工作树）应用补丁
cd ~/.hermes/hermes-agent      # 测试服上的源码路径
git apply --check /path/to/0001-display-lease-atomic-claim.patch
git apply /path/to/0001-display-lease-atomic-claim.patch

# 2. 重启 gateway/Dashboard 进程使其加载 Python 变更（按部署方式选择）
#    systemd: sudo systemctl restart hermes-dashboard   （示例，以实际 unit 名为准）
#    或 supervisorctl restart ...

# 3. 不修改全局配置；用两个客户端复验
```

## 影响与回退

- 影响范围：仅 bot-desktop 的租约 acquire 路径。普通聊天、Kanban、审批不走此代码；
  其他客户端若依赖“后来者覆盖”会被拒绝（正是本补丁目的，需同步客户端文案）。
- 回退：`git apply -R docs/patches/0001-display-lease-atomic-claim.patch` 后重启进程；
  未修改配置/数据，租约文件结构未变（仍为 `holder/viewer_id/since/reason/epoch`）。
- 兼容：新增 `acquire_if_free`，旧 `acquire` 保留，回退不影响已有调用。

## 复验条件（关闭 M0c / M4 阻塞）

1. 两 viewer：A 先 acquire 成功；B 再 acquire 返回 `lease_conflict`，**A 不被踢**，B 显示他人控制。
2. A release 后 B 可 acquire。
3. 迟到回执/关窗/断线：失去 viewer 身份不能释放他人租约；关窗释放自己的租约。
4. 记录双 viewer 脚本输出与新报告到本页，更新 `acceptance.md` 第 8 项与 `capabilities.md`。

复验脚本：`node scripts/gui-computer-dual.mjs`（当前预期输出 `takeover-allowed`；打补丁后应为
`takeover-refused`）。

## 授权范围与下一步

- 用户明确：只允许使用测试服务器的 Dashboard API（登录、发消息、审批、Kanban、display 等
  RPC/REST/WS），**不授权修改或部署服务端代码，也不授权重启服务**。
- 因此本文补丁与部署步骤仅作为“可审查的参考实现”保留，不执行。`scripts/gui-computer-dual.mjs`
  仍会在未打补丁的部署上记录 `takeover-allowed`。
- M0c 阻塞归属：服务端能力（需 Hermes 服务端团队/部署负责人实施）；客户端已完成冲突回执处理与
  被踢后自动只读恢复，API 范围内能做的到此为止。只有用户明确变更首版范围，才能把该项移出必交。

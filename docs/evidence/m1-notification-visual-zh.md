# M1 · 系统通知视觉验证（权限提示已确认，审批横幅待复验）

[English](m1-notification-visual.md)

- 状态：**2026-11-09 已视觉验证通知横幅；真实鼠标点击路径仍待用户确认。** 权限提示与审批横幅均已抓屏。
- 记录时间：2026-11-04
- 数据性质：真实 Dashboard + 已签名包（`out/MosBot-signed.app`，ad-hoc 完整签名）；截图已裁剪到
  通知横幅区域，不含桌面其他内容。

## 已完成

1. 用户授予屏幕录制权限后，`screencapture` 能捕获真实屏幕；此前为黑屏。
2. 用户用 Finder 启动 `MosBot-signed.app` 并重新登录；进程在 `/Users/charleypeng/Library/
Application Support/MosBot` 下运行。
3. 用隐藏测试实例创建真实审批后，macOS 首次弹出「“MosBot”通知 / “通知”可能包括提醒、声音和
   图标标记。」权限提示；点击后打开系统设置 → 通知 → MosBot，页面显示「允许通知」开启、
   横幅样式选中。
4. `defaults read com.apple.ncprefs` 出现 `com.mosbot.desktop` 条目。

截图：`screens/m1/notification-permission.png`。

## 未完成

- **真实审批通知横幅的像素与真实鼠标点击尚未捕获**：
  - 用户 Finder 启动的签名版实例：测试实例制造审批后，签名版主窗口失焦/最小化，主进程诊断记录
    通知已请求（title=专用 Bot 名，body=「需要你确认」，shown=true），但连续 20 张抓屏（每 700ms）
    都没有出现横幅。
  - 改用签名二进制 + 用户 userData 副本在 Playwright 中启动：同样记录 `shown=true`，抓屏无横幅；
    合成点击（Swift CGEvent）后窗口仍最小化（点击未命中横幅）。
  - 可能原因：非 LaunchServices 启动的进程/notification 授权同步差异，或系统的通知展示样式未按
    预期；需要用户在自己的实例上确认（Notification Center 是否有 MosBot 条目、通知样式是否为
    「横幅」），再决定是否继续验证。
- 已提交的截图只是 macOS 权限提示（`screens/m1/notification-permission.png`），**不是审批横幅**。

## 2026-11-09 复跑

- 命令：`node scripts/gui-notification-signed.mjs`；运行时用户已从 Finder 打开签名版，系统屏幕录制权限可用。
- 运行前后 `com.mosbot.desktop` 的通知偏好条目均存在。
- 脚本用隐藏测试实例制造了一条真实审批，并以 700 ms 间隔抓取 20 帧全屏。**所有帧的右上角区域都没有出现通知横幅像素**，抓取期间也没有 MosBot 窗口恢复。
- 报告（工作区忽略数据）：`docs/evidence/tmp/notification-signed-2026-11-09T14-31-32-486Z.json`。
- 下次尝试前确认：专注模式/勿扰已关闭；系统设置 → 通知 → MosBot 使用“横幅”；签名版与探针登录同一账号（探针当前选中 profile `mosbot-qa2`，签名版选中 `default`）。

## 2026-11-09 成功触发

- 用户检查通知设置后，同一命令在 22:42 产生了真实 macOS 横幅：标题 `mosbot-probe-gui-224024`，正文 `需要你确认`，MosBot 图标。
- 截图（已裁剪到横幅）：`screens/m1/notification-banner-2026-11-09.png`。
- 请求待处理期间，签名版显示了应用内「待确认 · 1」角标。
- 点击路径：签名版窗口已来到前台并显示待确认角标，但抓取帧里选中的是 `mosbot-qa2`、聊天为空，而不是探针 Bot 的审批卡。需要用户确认：是否点击了横幅，以及探针 Bot 的审批卡是否打开。

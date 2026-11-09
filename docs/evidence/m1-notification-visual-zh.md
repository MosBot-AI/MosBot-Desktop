# M1 · 系统通知视觉验证（权限提示已确认，审批横幅待复验）

- 状态：**部分验证**。macOS 通知权限提示已真实出现并抓屏；审批通知横幅在本次触发中未捕获（签名版
  app 被重启/窗口状态未恢复，见下）。
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

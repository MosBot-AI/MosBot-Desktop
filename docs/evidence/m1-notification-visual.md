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

- **真实审批通知横幅**（Bot 名 +「需要你确认」）的像素与真实鼠标点击尚未捕获：首次触发捕获到的
  是权限提示；授权后在调试过程中签名版被重启/窗口未显示，触发时没有可用的前台/后台窗口状态。
- 需要用户保持签名版 app 打开（窗口可见或最小化即可）后，再跑一次
  `node scripts/gui-notification-signed.mjs`：脚本会用测试实例制造审批、连续抓屏，并在横幅出现
  时尝试真实点击。

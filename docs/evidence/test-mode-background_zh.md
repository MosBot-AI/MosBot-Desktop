# 界面测试后台模式（不打扰用户）

- 目的：在所有自动化界面测试中不抢焦点、不显示窗口、不占用 Dock，让用户可以正常使用电脑。
- 变更：主进程支持 `MOSBOT_TEST_BACKGROUND=1`；E2E harness 与所有 `scripts/gui-*.mjs` 默认开启。
- 需要人观看的检查才用 `MOSBOT_TEST_FOREGROUND=1`（例如确认 macOS 通知横幅、录屏截图）。

## 实现

- 主窗口与电脑观看窗口：`show:false` 且永不 `show()`；`focusable:false`、`skipTaskbar:true`、
  `hasShadow:false`；`backgroundThrottling:false` 保证隐藏时定时器/rAF 正常。
- 启动时 `app.setActivationPolicy('accessory')` + `app.dock.hide()`：无 Dock 图标、不会激活应用。
- `ensureWindow()` / `activate` 在后台模式下只重建窗口，不 show/focus。
- 通知判定依赖“窗口不可见/无焦点”，隐藏窗口天然满足；通知请求/点击路径仍可测试。

## 验证

运行环境探针（打包产物，`MOSBOT_TEST_BACKGROUND=1`）：

```json
{
  "windows": [{ "visible": false, "focusable": false, "minimized": false }],
  "dockVisible": false,
  "active": false
}
```

隐藏模式下回归：

| 检查                                                               | 结果     |
| ------------------------------------------------------------------ | -------- |
| E2E 全量（fixture + 打包产物）                                     | ✅ 21/21 |
| 真实服务冷启动 + 草稿恢复（`gui-connected-draft`）                 | ✅       |
| 真实审批关窗/通知请求/Dock 重开/退出重启（`gui-window-lifecycle`） | ✅ 11/11 |

报告：`docs/evidence/tmp/connected-draft-2026-11-04T10-59-36-265Z.json`、
`docs/evidence/tmp/window-lifecycle-2026-11-04T11-01-27-248Z.json`。

## 仍需前台的场景

- 看 macOS 通知横幅像素、用真实鼠标点通知；
- 录屏/截图验收（`screencapture` 也需要屏幕录制权限）；
- 用户实际试用与视觉基线确认。

这些场景会先询问用户，或用 `MOSBOT_TEST_FOREGROUND=1` 显式运行并说明。

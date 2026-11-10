# M5 · 打包产物 · 证据

[English](m5-package.md)

- 状态：**当前 ad-hoc 签名 ZIP（2026-11-10，含通知点击修复与 M6 群聊核心）已构建并通过本机干净安装检查**（`codesign --verify --deep --strict` 通过）；Developer ID 签名/公证仍阻塞于证书；DMG 未做
- 记录时间：2026-11-10（历史：2026-11-04）
- 参考机：Apple M4，macOS 15.8.2，Node v26.13.0，pnpm 11.28.5
- 发布说明：[`release-notes-0.1.0-zh.md`](release-notes-0.1.0-zh.md)

## 实现

- Forge `makers` 使用 `@electron-forge/maker-zip`（darwin）；`pnpm package` 供 E2E/探针，
  `pnpm make` 产出可分发包。
- `forge.config.js` 按环境变量启用 Developer ID 签名、hardened runtime 与公证；**发布构建可选 ad-hoc
  完整签名**（`MOSBOT_ADHOC_SIGN=1 pnpm make` 时 `postPackage` 执行 `codesign --force --deep --sign -`），
  日常测试构建保持 linker-signed（否则既有 userData 的 keychain 凭据无法解密）。ad-hoc 不等于发布
  签名，`spctl` 仍拒绝；
  entitlements 见 `build/entitlements.mac.plist`（仅 `allow-jit`、`allow-unsigned-executable-memory`）。
- 打包 ignore 列表排除构建产物、文档、测试与仅开发依赖（ZIP 约 313 MB，asar 已开）。

## 结果

| 检查                                  | 结果                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm make`                           | ✅ 通过                                                                               |
| 产物                                  | `out/make/zip/darwin/arm64/MosBot-darwin-arm64-0.1.0.zip`，329,655,212 B（约 314 MB） |
| SHA-256                               | `7dbecfea52e1e4d92928d9c36805afea3477caa51d2c78ac9cb722e50adabbbc`                    |
| 签名                                  | ad-hoc，`spctl` 拒绝（Developer ID 证书未配置）                                       |
| 干净安装（解压 + 全新 userData）      | ✅ 见 `m5-install-upgrade-zh.md`                                                      |
| 覆盖升级与数据恢复（v1→v2、损坏回退） | ✅ 见 `m5-install-upgrade-zh.md`                                                      |
| DMG / 安装器                          | ⏳ 未做（当前 ZIP 解压即用）                                                          |

## 待办

- 取得 Developer ID Application 证书后：设置 `MOSBOT_MACOS_SIGN_IDENTITY` 与
  `MOSBOT_NOTARY_*` 跑 `pnpm make`，用 `pnpm test:install` 验证 `kind=developer-id` 且 Gatekeeper
  接受；随后在另一台 Mac / 新建用户下复验下载、quarantine 与安装（本机已用 Apple Development
  证书验证签名链路，见 `m5-install-upgrade-zh.md`）。
- 评估是否引入 DMG 与体积优化；用真实旧的测试版安装包做覆盖升级。

## 2026-11-04 可选 ad-hoc 签名

`MOSBOT_ADHOC_SIGN=1 pnpm make` 且未设置 `MOSBOT_MACOS_SIGN_IDENTITY` 时，`postPackage` 会对产物做
ad-hoc 完整签名：

```
Identifier=com.mosbot.desktop
Info.plist entries=31
Signature=adhoc
codesign --verify --deep --strict  → 0
```

这修复了产物 `Identifier=Electron`、Info.plist 未绑定的问题（macOS 通知注册的前提之一）；
但改动代码身份会让旧 userData 的 safeStorage 凭据失效（`vault_unavailable`），因此只作为发布
构建开关，默认测试包不签名。`spctl` 仍拒绝（无 Developer ID），第二台 Mac 需右键打开。

## 2026-11-10 重新构建

- 命令：`MOSBOT_ADHOC_SIGN=1 npm run make`（main `82282f6`，含 M6 群聊核心）。
- 产物：`out/make/zip/darwin/arm64/MosBot-darwin-arm64-0.1.0.zip`，329,655,212 B。
- SHA-256：`7dbecfea52e1e4d92928d9c36805afea3477caa51d2c78ac9cb722e50adabbbc`。
- 签名：ad-hoc；`codesign --verify --deep --strict` 退出码 0；`spctl` 仍拒绝（无 Developer ID）。
- 干净安装复验：`node scripts/verify-install.mjs` 离线首启检查全部通过；唯一预期失败是 Developer ID/Gatekeeper 检查。报告：`docs/evidence/tmp/install-verify-2026-11-10T02-52-43-157Z.json`。
- main 回归：`vitest run` 173 passed，`npm run test:e2e` 21 passed，typecheck/lint/format 全绿。

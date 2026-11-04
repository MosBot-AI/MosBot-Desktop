# M5 · 打包产物 · 证据

- 状态：**未签名（ad-hoc）macOS ZIP 可构建并通过本机干净安装检查**；Developer ID 签名/公证
  配置就绪但无证书未验证；DMG 未做
- 记录时间：2026-11-04
- 参考机：Apple M4，macOS 15.8.2，Node v26.13.0，pnpm 11.28.5

## 实现

- Forge `makers` 使用 `@electron-forge/maker-zip`（darwin）；`pnpm package` 供 E2E/探针，
  `pnpm make` 产出可分发包。
- `forge.config.js` 按环境变量启用 Developer ID 签名、hardened runtime 与公证；未配置证书时
  保持未签名 ZIP，不把 ad-hoc 伪装成发布签名。entitlements 见
  `build/entitlements.mac.plist`（仅 `allow-jit`、`allow-unsigned-executable-memory`）。
- 打包 ignore 列表排除构建产物、文档、测试与仅开发依赖（ZIP 约 313 MB，asar 已开）。

## 结果

| 检查                                  | 结果                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------- |
| `pnpm make`                           | ✅ 通过                                                                               |
| 产物                                  | `out/make/zip/darwin/arm64/MosBot-darwin-arm64-0.1.0.zip`，327,730,764 B（约 313 MB） |
| SHA-256                               | `a9f7965ca0f2fc0ca6c3be063d1c669ca114d91b7747cd3a4f35666fe04f735f`                    |
| 签名                                  | ad-hoc，`spctl` 拒绝（Developer ID 证书未配置）                                       |
| 干净安装（解压 + 全新 userData）      | ✅ 见 `m5-install-upgrade.md`                                                         |
| 覆盖升级与数据恢复（v1→v2、损坏回退） | ✅ 见 `m5-install-upgrade.md`                                                         |
| DMG / 安装器                          | ⏳ 未做（当前 ZIP 解压即用）                                                          |

## 待办

- 证书就绪后：`MOSBOT_MACOS_SIGN_IDENTITY` / `MOSBOT_NOTARY_*` + `pnpm make`，再用
  `pnpm test:install` 验证 `kind=developer-id` 且 Gatekeeper 接受；随后在另一台 Mac / 新建用户
  下复验下载、quarantine 与安装。
- 评估是否引入 DMG 与体积优化；用真实旧的测试版安装包做覆盖升级。

# M5 · 打包（第一块）· 证据

- 状态：**未签名 macOS ZIP 可构建**；签名/公证、DMG、干净安装与覆盖升级、日用验收待续
- 记录时间：2026-11-04
- 参考机：Apple Silicon（本机），Node `/opt/homebrew/bin/node` v26.13.0，pnpm 11.28.5

## 实现

- Forge `makers` 增加 `@electron-forge/maker-zip`（darwin）；新增 `pnpm make` 脚本。
- `pnpm package` 仍用于 E2E 与探针；`pnpm make` 产出可分发包。

## 结果

| 检查         | 结果                                                                   |
| ------------ | ---------------------------------------------------------------------- |
| `pnpm make`  | ✅ 通过                                                                |
| 产物         | `out/make/zip/darwin/arm64/MosBot-darwin-arm64-0.1.0.zip`（约 347 MB） |
| 签名 / 公证  | ⏳ 未做：需要 Apple Developer 证书与 notarytool 凭据                   |
| DMG / 安装器 | ⏳ 未做（当前 ZIP 解压即用）                                           |

## 待办

- 体积优化（asar 内依赖裁剪）与启动性能采样。
- 证书就绪后配置 `osxSign` / `osxNotarize`，产出 DMG，并做干净安装、覆盖升级与 userData/schema v2 恢复验证。

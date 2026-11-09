# M5 · 签名配置、干净安装与覆盖升级 · 证据

[English](m5-install-upgrade.md)

- 卡片：M5（签名公证、干净安装、覆盖升级与数据恢复；README 发布候选验收第 9、10 项）
- 状态：**当前 ad-hoc ZIP（2026-11-09）的本机干净安装通过；v1→v2 覆盖升级与损坏回退通过**；
  Developer ID 签名/公证配置已就绪但**无证书未验证**；真实干净系统/另一台 Mac 未测
- 记录时间：2026-11-09（历史：2026-11-04）
- 数据性质：打包产物（ZIP 解压 + 全新 userData）+ E2E（本地状态迁移）

## 环境

| 项          | 值                                                        |
| ----------- | --------------------------------------------------------- |
| 机型 / 系统 | Apple M4（`Mac16,10`），macOS 15.8.2（24H232），AC 供电   |
| 运行时      | Node v26.13.0；Electron 45.2.1；应用 0.1.0                |
| 产物        | `out/make/zip/darwin/arm64/MosBot-darwin-arm64-0.1.0.zip` |

## 签名与公证配置

`forge.config.js` 现在按环境变量启用签名与公证，缺省仍产出未签名 ZIP，不会把 ad-hoc 签名
当成发布签名：

| 环境变量                     | 用途                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `MOSBOT_MACOS_SIGN_IDENTITY` | Developer ID Application 证书标识，启用 `osxSign` + hardened runtime + `build/entitlements.mac.plist` |
| `MOSBOT_NOTARY_APPLE_ID`     | notarytool 的 Apple ID                                                                                |
| `MOSBOT_NOTARY_PASSWORD`     | app 专用密码                                                                                          |
| `MOSBOT_NOTARY_TEAM_ID`      | Apple Team ID                                                                                         |

`build/entitlements.mac.plist` 只保留 Electron/硬化运行所需的两项：`allow-jit`、
`allow-unsigned-executable-memory`（`@electron/osx-sign` 只识别 `optionsForFile`，顶层
`entitlements` 会被忽略——已按此修正，helper 保留各自默认 entitlements）。

### 本机证书实测（2026-11-04，用户授权使用本机证书）

本机仅有 **Apple Development** 证书（无 Developer ID Application），用它跑通了签名链路：

| 检查                                | 结果                                                                                      |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| 构建命令                            | `MOSBOT_MACOS_SIGN_IDENTITY="Apple Development: 345330319@qq.com (G5S2BZ4NZ6)" pnpm make` |
| 签名身份                            | `Authority=Apple Development: 345330319@qq.com (G5S2BZ4NZ6)`，`TeamIdentifier=8G993L24AS` |
| 硬化运行时                          | ✅ `flags=0x10000(runtime)`                                                               |
| entitlements                        | ✅ 实际签入 `allow-jit`、`allow-unsigned-executable-memory`（修正后才生效）               |
| `codesign --verify --deep --strict` | ✅ 退出码 0                                                                               |
| 签名 ZIP                            | 313 MB，SHA-256 `ad688e8a611d7b10a9e6364c50004171b05faaa72960bfd58ca2294c5d6019af`        |
| 解压 + 全新 userData 启动           | ✅ 标题/版本/bundle、fixture 名单、离线连接弹层均正常                                     |
| Gatekeeper (`spctl`)                | ❌ rejected —— Apple Development 不是 Developer ID，不能对外分发                          |
| 公证                                | ❌ 未做：notarytool 需要 Developer ID 与 Apple ID 专用密码，本机均无                      |

结论：**签名配置、硬化运行时、entitlements、签名校验与签名产物的干净启动已验证**；
对外分发所需的 Developer ID 签名 + 公证 + Gatekeeper 通过仍阻塞于证书。

## 干净安装（本机 ZIP 解压 + 全新 userData）

命令：`pnpm test:install`（`electron-forge make` → `scripts/verify-install.mjs`）

| 检查                         | 结果                                                               |
| ---------------------------- | ------------------------------------------------------------------ |
| ZIP                          | `MosBot-darwin-arm64-0.1.0.zip`，327,730,764 B（约 313 MB）        |
| SHA-256                      | `a9f7965ca0f2fc0ca6c3be063d1c669ca114d91b7747cd3a4f35666fe04f735f` |
| 解压                         | `ditto -x -k` 到临时目录，1.3 s                                    |
| 启动到 DOM ready             | 4.8 s（窗口首次出现；含解压外的启动）                              |
| 全程                         | 9.8 s                                                              |
| 窗口标题 / 版本 / bundle id  | MosBot / 0.1.0 / `com.mosbot.desktop` ✅                           |
| fixture 名单、底栏、连接弹层 | 均可见，可离线打开 ✅                                              |
| 登录前无凭据文件             | ✅（`dashboard-credentials.json` 不存在）                          |
| 签名                         | **ad-hoc，`spctl` 拒绝**（未配置 Developer ID 证书）               |

说明：本执行环境的 shell 拒绝 Chromium 自身 sandbox，脚本默认以 `--no-sandbox` 启动并在报告
中记录（`isolatedRendererSandbox:false`）；`MOSBOT_TRY_SANDBOX=1` 可在允许 sandbox 的环境尝试
隔离启动。该差异不影响打包产物本身的签名状态判断。

原始报告：`docs/evidence/tmp/install-verify-2026-11-04T05-18-53-891Z.json`。

## 覆盖升级与数据恢复

命令：`pnpm test:e2e tests/e2e/upgrade.spec.ts`（打包产物 + 模拟上一测试版的 userData）

| 场景                                                          | 结果                                                                                                  |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 上一测试版 `local-state.json` v1（草稿、选中 Bot、主题 dark） | 启动即恢复草稿与选中 Bot，主题仍为 dark；600 ms 防抖后原地升级为 v2，`organization` 补齐，草稿保留 ✅ |
| 主文档损坏 + 上一版备份完整                                   | 加载回退到 `.bak`，恢复草稿而非回到默认值；主文档在下次成功写入前不被覆盖 ✅                          |
| 主文档损坏且无备份                                            | 应用不崩溃；下次保存前把损坏文件保留为 `local-state.json.corrupt`，再写入新文档（单元测试） ✅        |
| 更新 schema 拒绝覆盖                                          | 更高版本文档不被覆盖，`save` 返回 `newer-schema`（单元测试） ✅                                       |

实现：`src/main/local/store.ts` 增加“主文档不可读/更高版本时回退备份”和“损坏文档另存
`.corrupt`”两条路径；本地状态仍为原子写 + 上一版 `.bak` 备份。

## 未覆盖 / 关闭条件

- **Developer ID 签名、公证、Gatekeeper**：本机证书已实测 Apple Development 签名链路；关闭
  仍需要 Developer ID Application 证书与 notarytool 凭据（Apple ID 专用密码 + Team ID），
  再以 `pnpm test:install` 检查 `kind=developer-id` 且 `spctl` 接受。
- **真实干净系统**：本次在本机用临时目录 + 全新 userData 模拟解压安装，未在另一台 Mac 或
  新建 macOS 用户下验证；也未验证下载后的 quarantine 属性（无签名时会被 Gatekeeper 拦截）。
- **前一测试版安装包**：当前没有已分发的旧版本安装包，升级用“v1 本地状态文档”模拟；
  真实覆盖安装（保留连接/已读位置/偏好）仍需在获得旧包后复验。
- **DMG / 安装器**：仍只有 ZIP（解压即用）；未新增 maker-dmg 依赖。
- **强退待确认发送**：发布候选验收要求“强退后待确认发送不会自动重发”，本次未构造；
  需要一次真实发送中强杀进程的测试。
- **体积**：ZIP 约 313 MB（Electron 运行时占主要部分），asar 内依赖裁剪仍需评估。

## 2026-11-09 干净安装复验

- 产物：`out/make/zip/darwin/arm64/MosBot-darwin-arm64-0.1.0.zip`（328,802,141 B），SHA-256 `56a19b77aabb5e66cd5f1efd503511e49349d2aa47e2aa3b96cfcb8b444d26f9`。
- 解压到临时目录并以全新 userData 启动：窗口标题、版本、bundle id、fixture 名单、底栏与离线连接弹层全部通过；登录前不存在凭据。
- 签名：ad-hoc，`codesign --verify --deep --strict` 退出码 0；`spctl` 因未配置 Developer ID 证书而拒绝（预期）。
- E2E 回归：21 passed，包含 v1→v2 升级与损坏回退用例。
- 报告：`docs/evidence/tmp/install-verify-2026-11-09T15-53-19-054Z.json`。

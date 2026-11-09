# 品牌资产来源与使用

本仓库的 MosBot 品牌资产取自移动端项目 `~/dev/MosBot`，固定提交 **`3c118c4`**。资产按原文件复制，未做重采样；界面通过 CSS `mask` 着色，因此同一份文件同时服务浅色与深色主题。

## 同步方式

```bash
pnpm assets:sync   # node scripts/sync-brand-assets.mjs
```

脚本会校验 `~/dev/MosBot` 当前 HEAD 必须是上面的固定提交，复制文件到 `src/renderer/assets/brand/`，写出 `provenance.json`（文件、来源路径、SHA-256），并生成 `artwork.ts`——把词标与空对话图形的路径数据转成可内联的 SVG 常量。升级来源提交时须同时审阅代码、artwork 与 provenance 差异。

## 资产清单

| 文件                          | 来源（MosBot@3c118c4）                                            | 许可                    | 用途                                                        |
| ----------------------------- | ----------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------- |
| `app-icon.png`                | `AppScope/resources/base/media/app_icon.png`（1024²）             | MIT（`MosBot-LICENSE`） | 应用/Dock/安装包图标；M5 生成 `.icns` 多分辨率              |
| `empty-chat.svg`              | `entry/src/main/resources/base/media/empty_chat_bubbles.svg`      | MIT（`MosBot-LICENSE`） | 空对话插画；路径由 `artwork.ts` 内联，描边用 `currentColor` |
| `wordmark-letters.svg`        | `entry/src/main/resources/base/media/mosbot_wordmark_letters.svg` | MIT（`MosBot-LICENSE`） | 左下角词标字形；路径内联，填充 `currentColor`               |
| `wordmark-eyes.svg`           | `entry/src/main/resources/base/media/mosbot_wordmark_eyes.svg`    | MIT（`MosBot-LICENSE`） | 词标眼睛；路径内联，填充 `--accent-brand`                   |
| `artwork.ts`                  | 由上述三个 SVG 生成                                               | 同上                    | 内联 SVG 路径常量（勿手改）                                 |
| `hermes-desktop-bots-LICENSE` | `licenses/hermes-desktop-bots-LICENSE`                            | MIT（Nous Research）    | BotFace 形状/姿态移植的许可                                 |
| `MosBot-LICENSE`              | `LICENSE`                                                         | MIT                     | 品牌图形许可                                                |

## BotFace 移植

聊天、置顶、名牌、详情和创建预览里的 Bot 脸不是位图，而是从移动端移植的程序化 SVG：

- 形状与配色：`entry/src/main/ets/state/bot/BotFaceShapes.ets`
- 眼睛与动作：`entry/src/main/ets/state/bot/BotFacePose.ets`
- 组件结构：`entry/src/main/ets/components/bot/BotFace.ets`
- 外观默认值/种子规则：`entry/src/main/ets/state/bot/BotRoster.ets`

实现位于 `src/renderer/features/bots/face/`，统一通过 `BotAvatar` / `BotLookFace` 使用；移植细节与测试见该目录与 `tests/unit/face.test.ts`。渲染保持 40×40 viewBox，形状与动作语义与移动端一致。

## 约束

- 不把品牌词标重复铺进聊天导航；聊天只出现小头像与名牌。
- 亮色 Bot（例如 MosBot 默认的 `#AFE17B`）上的文字使用深色 ink，见 `src/shared/color.ts` 的 `readableInk`。
- 资产只从这里取用并登记；不从其他项目或截图里抠图。
- 词标与空对话图形不使用 CSS `mask` + `?url`：打包后的 `file://` 页面会丢弃 data-URI mask（M0a 真实窗口验收时发现），因此由脚本生成内联 SVG 路径（`artwork.ts`）。小图标仍可用内联 SVG 组件。

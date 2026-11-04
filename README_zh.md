# MosBot Desktop

面向 macOS 的 Hermes Agent 桌面客户端：打开应用就看到熟悉的 Bot，点头像接着聊；需要看
Profile、Session 和 Kanban 时再进入独立的 Hermes 工作台。

**当前状态：** M0a 设计切片 + M0b 协议基础。窗口、名单、聊天、详情栏、搜索和新建 Bot 弹层
已经可以操作，但界面仍使用确定性 fixture 数据。Dashboard 客户端（地址策略、Electron 网络栈
REST 传输、RFC 8252 PKCE 登录、safeStorage 凭据库、IPC 桥）已经实现，并在测试部署（v0.22.5）
上完成真实浏览器登录、刷新轮换、Gateway WebSocket 契约与专用对象写入探针验证。首次连接弹层会
加密保存登录并在下次启动静默恢复。连接后名单与所选 Bot 的 Bot Chat 来自真实 Dashboard：可以发送、流式接收回复（完整 Markdown 渲染）、
停止当前回合、向上加载更早历史；审批/澄清卡经同一 Gateway 回执；连接断开会自动重连、回放漏掉的
事件并重投未回答的请求；草稿、选中 Bot、详情栏与语言外观偏好重启后保留。未打开 Bot 的审批/提问
由后台 watcher 发现，左栏显示待确认计数并在后台时发系统通知（点击直达该 Bot）。连接状态下新建
Bot 走真实 fresh profile 流程（名称、形状、颜色），创建后自动选中，未配置模型时引导完成配置。
连接后的 Bot 可置顶、建分区（重命名/删除）、在分区间移动，并编辑外观与名称（CAS 写入）；整理结果
保存在本地并重启恢复。左下菜单可打开 Hermes 工作台（Profiles / Sessions / Kanban），三个子页使用
真实 REST；Kanban 可新建任务、修改状态，Profiles 可写入默认模型/提供方并回读就绪状态；
Kanban 打开时通过事件 WebSocket 保持实时（重连重签票、旧游标续传、缺口重读快照）。附件经系统选择器
与 `file.attach` 上传后随消息发送；资料库通过 `/api/files` 索引 Bot Chat 工作区，支持文本/图片预览与
「保存并打开」；电脑页读取真实状态与预览，并提供显式唤醒入口（观看/控制窗口下一段接入）。返回 Bots 时聊天、草稿与滚动位置保持不变。未连接时仍使用 fixture。
尚无签名安装包和升级路径。详见
[`docs/evidence/m0a-design-slice.md`](docs/evidence/m0a-design-slice.md) 与
[`docs/evidence/capabilities.md`](docs/evidence/capabilities.md)。

## 环境要求

- macOS 13 或更新版本，Apple Silicon 或 Intel
- Node.js 24+（开发使用 Node 26）
- pnpm 11.28.5 —— 已作为项目 devDependency 固定，因此无需全局安装，
  用 `npx pnpm@11.28.5` 即可；Electron Forge 打包时会读取它

## 运行

```bash
npx pnpm@11.28.5 install
npm run dev            # 或：npx pnpm@11.28.5 dev
```

请在 Terminal.app 直接运行，不要放在受限的构建沙箱里：Chromium 需要自己的沙箱与 GPU
进程，受限环境会阻止它们启动。

## 检查

| 命令                                    | 验证内容                                                                |
| --------------------------------------- | ----------------------------------------------------------------------- |
| `npm run typecheck`                     | renderer、preload、main 的严格 TypeScript                               |
| `npm test`                              | 纯函数与 reducer 测试（颜色、中英一致性、store、fixture、BotFace 几何） |
| `npm run test:e2e`                      | 先打包，再用 Playwright 驱动真实 Electron 窗口                          |
| `npm run lint` / `npm run format:check` | ESLint 9 与 Prettier                                                    |
| `npm run package`                       | 未签名的 `out/MosBot-<platform>-<arch>/MosBot.app`                      |
| `npm run screenshot`                    | 打包并生成证据截图                                                      |
| `npm run assets:sync`                   | 从固定提交重新同步 MosBot 品牌资产                                      |

## 目录

```
src/main       Electron 主进程：窗口、导航加固、生命周期
src/preload    窄 contextBridge 接口（暂不含业务数据）
src/shared     领域类型、颜色/表情助手、桥接契约
src/renderer   React 应用、CSS Modules、设计令牌、fixture 与界面功能
tests/unit     Vitest；tests/e2e 针对打包产物运行
docs           方案（中文）、品牌来源、证据
```

## 文档

- 交付基线与里程碑：[`docs/plans/README.md`](docs/plans/README.md)
- 界面规格：[`docs/plans/01-bot-experience.md`](docs/plans/01-bot-experience.md)
- Dashboard 接入：[`docs/plans/02-dashboard-integration.md`](docs/plans/02-dashboard-integration.md)
- 任务卡：[`docs/plans/03-agent-handoff.md`](docs/plans/03-agent-handoff.md)
- 品牌资产与许可：[`docs/assets/brand.md`](docs/assets/brand.md)
- 更新日志：[`CHANGELOG.zh-CN.md`](CHANGELOG.zh-CN.md)

## M0a 已知限制

- 聊天回复与电脑唤醒是 fixture 节奏，不是推理或真实远端会话。
- 附件、产物预览/保存/打开、独立电脑窗口在 M4 接入；相关按钮禁用并说明原因，不伪造成功。
- 真实中文输入法、VoiceOver 顺序、窗口缩放与分屏尚未实测。
- 构建未签名、未做分发打包；签名与连续 7 天日用验收在 M5。

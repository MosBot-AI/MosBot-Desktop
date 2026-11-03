# 更新日志

MosBot Desktop 的所有重要变更记录在此。格式遵循
[Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[语义化版本 2.0.0](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。源码改动、已构建产物与已安装/已发布版本分开列出，避免把源码改动误读为可安装版本。

仓库尚未建立远程地址；对比链接暂用本文件锚点，发布仓库建立后替换为 comparison link。

## [Unreleased]

### 新增

- Electron Forge + Vite + React 19 + TypeScript（strict）基线：沙箱化、上下文隔离的主窗口（1000 × 760，最小 720 × 500），禁止外部导航、无 remote 模块、生产环境严格 CSP，以及窄接口 preload 桥。
- Bot 优先界面的设计系统：暖中性底色、MosBot 品牌绿、4/8/12/16/24 间距、10–14 px 圆角、浅色与深色 token、动态效果降低时的行为。
- 带类型的中英文 message keys 与一致性测试；语言跟随系统，底栏可切换并保留草稿、滚动与运行状态。
- 左栏名单：搜索与新建入口、待处理请求提示、三列共六格的常用头像、「全部置顶」浮层、可收折分区与数量、未读角标、状态点，以及底部的 MosBot 连接入口。
- 会话栏：居中名牌（点击打开详情）、用户/Bot 气泡、合并且可展开的工作记录、审批与澄清卡（处理后折为回执）、已停止状态、最小而安全的文本渲染（段落、列表、代码块、行内代码），以及支持中文输入法、Enter 发送、Shift+Enter 换行、发送/停止的输入条。
- 确定性的脱敏界面样例：两个分区、六个置顶位、超长中文名、空对话、长回复、离线 Bot、待审批请求与休眠电脑；另有仅样例使用的回复与唤醒节奏。
- 按需详情栏（详情/资料库/电脑，可拖拽宽度、窄窗口覆盖态）、键盘可用的搜索浮层，以及实时预览的新建 Bot 弹层。
- 从 MosBot@3c118c4 复制的品牌资产与 provenance 记录、`pnpm assets:sync` 命令，以及从移动端移植的程序化 BotFace 几何。
- 工具链：`pnpm dev`、`pnpm package`、`pnpm typecheck`、`pnpm test`、`pnpm test:e2e`、`pnpm lint`、`pnpm format`、Playwright Electron 冒烟测试与证据截屏。
- 中英成对的 `README.md` / `README_zh.md`：环境要求、运行与检查命令、目录结构、文档索引与 M0a 已知限制。
- 名单与置顶头像的悬停反馈：延迟出现的预览浮层（名称、最后摘要、状态、最近活动），脸部切到 `listening` 姿态并轻微上浮；指针悬停与键盘聚焦都会触发。
- M0b 协议基础：Dashboard 地址策略（其余一律 https，仅保留一个精确的明文测试 origin）；基于 Electron 网络栈、zod 校验的 REST 传输（超时、响应大小上限、禁止跟随重定向）；RFC 8252 PKCE 登录与 loopback 回调 + state 校验；safeStorage 加密的刷新令牌凭据库（access token 只存内存）；仅接受应用自身顶层 frame 的 Dashboard IPC 桥。
- M0b 探针：可重跑的 `pnpm test:integration`，打包应用后先做无凭据 REST 探活，再经系统浏览器登录，随后跑已登录探针与本地注销检查；能力矩阵见 `docs/evidence/capabilities.md`。

### 变更

- `pnpm test` 覆盖扩展：地址策略、传输错误分类、PKCE、凭据库、loopback state 校验与完整登录/探针流程（89 个用例）。
- pnpm 作为 devDependency 固定，Electron Forge 的包管理检查无需全局 pnpm 即可复现。

### 说明

- 本条仅为源码改动：尚无签名安装包、升级路径与真实 Dashboard 连接。M0a 用样例数据做界面评审，M0b/M1 再切换到 `192.168.2.171:9119` 真实服务。
- 截图中的聊天内容全部为脱敏样例数据。
- M0b 只读探针已在测试部署（`192.168.2.171:9119`，v0.22.5 / `bf0203a794`）跑通：health、
  status、鉴权形态、登录提供方与 native authorize 路由均通过。登录、刷新与已登录探针仍需在
  浏览器完成一次登录；详见 `docs/evidence/capabilities.md`。

## [0.1.0] - 2026-11-03

### 新增

- M0a 设计切片基线（当前内容见 Unreleased）。

[Unreleased]: ./CHANGELOG.md#unreleased
[0.1.0]: ./CHANGELOG.md#010---2026-11-03

# 更新日志

MosBot Desktop 的所有重要变更记录在此。格式遵循
[Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[语义化版本 2.0.0](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。源码改动、已构建产物与已安装/已发布版本分开列出，避免把源码改动误读为可安装版本。

仓库尚未建立远程地址；对比链接暂用本文件锚点，发布仓库建立后替换为 comparison link。

## [Unreleased]

### 新增

- 资料库：工作区列表现在识别部署返回的 `mtime`（epoch 秒）而不只读 `modified_at`，文件按真实
  修改时间排序；悬空符号链接（`broken_link`）显示「资源已删除」并禁用打开；读取失败按
  已删除/无权限/过大/登录过期给出专门文案与「重试」。部署文件 API 没有来源消息字段，登记为
  能力缺口。

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
- safeStorage 凭据库支持静默恢复登录（`dashboard.restore`），后续运行与应用启动无需重复输入密码；探针支持 preflight / restore / login / ws / all 模式，默认保留会话。
- 首次连接界面与静默恢复：底栏显示真实账号；弹层负责地址预检、登录方式选择、浏览器交接与
  连接摘要；登录成功后记住凭据（刷新令牌进 safeStorage，上次地址进非密钥设置），后续启动无需
  重复输入。令牌不会进入 renderer。
- 真实聊天纵切：连接后向真实 Bot Chat 提交 prompt，流式 delta 合并进单个 Bot 气泡，停止按钮中断
  当前回合；审批/澄清请求以内联卡片呈现并按 request id 回执；同一轮工具事件合并为一个可展开
  「工作记录」；客户端声明 `server_requests`（测试部署返回 16 个方法）；历史可分页向上加载并保持
  滚动锚点；回复按 Markdown 渲染（标题/列表/表格/代码），原始 HTML 只作文本、仅 https 链接可点。
- 本地状态持久化：主进程单写版本化 `local-state.json`（原子替换、上一版备份、损坏与更高 schema
  保护），保存按连接的草稿、选中 Bot、详情栏以及主题/语言；渲染层启动时 hydrate，600 ms 防抖写盘
  并在关闭前刷盘。
- 断线回放：聊天管理器记录 gateway replay epoch 与事件 seq，重连 resume 后用
  `session.events.since` 回放、按 seq 去重、重投未回答的审批/澄清请求；回放环被截断或 epoch
  变化时重新拉取历史。
- 后台审批：独立 Gateway watcher 轮询活跃会话列表，只读附加等待中的 canonical Bot Chat，把其待处理
  审批/澄清汇总为左栏「待确认」计数；窗口未聚焦时为每个请求发一次系统通知，点击恢复窗口并打开
  对应 Bot。
- M2 新建流程：连接状态下创建弹层提交真实 fresh profile（`no_skills`/`no_alias`、不继承凭据），
  通过 `ui_meta['hermes-bots']` CAS 写入所选形状与颜色，创建后选中新 Bot；Dashboard 报告模型未就绪时
  聊天内显示「完成配置 / 重新检查」并禁用发送。远端名单直接渲染 `ui_meta` 里的显示名与外观，外观写入
  遇到 revision 冲突会提示重试。
- M2 整理：连接后的 Bot 可置顶、建命名分区（重命名/删除、移入移出、折叠），并编辑外观与名称
  （同一 CAS 外观写入 + REST 改名）。整理结果与折叠状态写入本地状态文档；schema 升级为 v2 并自动
  迁移 v1。
- M3 工作台：左下菜单打开全窗口 Hermes 工作台，含 Profiles / Sessions / Kanban 三个子页。
  Profiles 显示真实名单与模型就绪；Sessions 支持 `/api/sessions` 分页、搜索与只读历史；Kanban 列出
  看板并渲染带 `latest_event_id` 的快照，插件不可用时有专用空态。聊天外壳保持挂载，返回时 Bot、草稿、
  滚动位置与详情栏原样恢复。
- 工作台写入：Kanban 页可新建任务、在列间移动状态（写入后重读快照回显）；Profiles 页可通过
  `PUT /api/profiles/{name}/model` 写入默认 provider/model 并回读就绪状态。均用专用 board/profile
  探针验证并自动清理。
- Kanban 实时事件：每个打开的 board 通过独立 WebSocket 尾随 `/api/plugins/kanban/events`，重连重签
  ticket 并用旧游标续上；切换 board 会关闭旧 watcher，迟到帧不会写入新 board；事件到达后防抖重读
  快照，游标回退时从新尾部重新订阅。
- M4 第一块：输入条经系统选择器与 `file.attach` 上传附件（10 MB 上限、可移除 chip、引用随消息发送），
  专用 profile 探针验证真实推理能读取附件；电脑页轮询 `display.status`、显示 `display.thumbnail`
  预览（他人持租约时隐藏），并提供显式 `display.start` 唤醒。
- 资料库：详情栏资料库通过 `/api/files` 索引当前 Bot Chat 工作区，显示名称/类型/大小，用
  `/api/files/read` 的 data URL 预览文本与图片，并可保存到 Downloads 后显式打开。专用 profile 探针
  验证了 Bot 创建文件 → 索引命中 → 读取回 token。
- 电脑观看窗口：`display.observe` 取得一次性 RFB ticket 与 server viewer id，独立窗口用 noVNC 渲染画面；
  控制条显示「仅观看 / 你正在控制 / 他人控制」，显式 `display.lease.acquire/release`，跟随 lease 广播，
  关闭窗口时归还控制权。真实探针验证 observe ticket、acquire（holder=human）、持租约预览抑制、
  release（holder=agent）。
- 详情栏例行任务：连接后读取 `/api/cron/jobs?profile=`，列出任务名、调度与停用状态，替代 fixture 数据。
- 打包：`pnpm make` 通过 Forge ZIP maker 产出未签名 macOS ZIP（`out/make/zip/darwin/arm64/`）。
  签名、公证、DMG 与干净安装/覆盖升级检查待 Developer 证书就绪后进行；打包忽略构建产物与 dev-only
  依赖后 ZIP 由 347 MB 降至 312 MB。未连接时保持 fixture 演示。
- Gateway WebSocket 客户端（`ws`）：一次性 ticket 握手、`gateway.ready` 首帧、zod 校验的 JSON-RPC 请求响应、类型化服务端事件，以及 ticket 复用/过期拒绝检查。已在测试部署验证：`profiles.list`、`client.capabilities` 与精确 Bot Chat 查询通过；复用与过期 ticket 被拒绝。

- 流式合并：聊天管理器按 turn 在 16–32 ms（默认 24 ms）窗口内合并 delta，并限制帧数与
  字节数；任何控制事件、终态或连接状态变化前先冲刷待发文本。transcript 顺序不变，同时避免
  每个原始 token 一次进程往返与 React 渲染。
- 流式 Markdown：进行中的回复把已完成的空行分块按 Markdown 渲染（只解析一次并记忆化），
  仅正在增长的尾块以纯文本显示，终态事件后切回完整 Markdown；回合进行中不再向读屏逐字播报。
- 性能门槛：`pnpm bench:pipeline` 用真实合并器回放四通道脱敏帧（含 JSON 解析）并对批次年龄、
  队列上界与丢字回归直接断言；`pnpm bench:stream` 以进程内帧回放器启动打包产物，检查
  「帧到可见文本」p95、5 秒 5 倍突发、实际帧率、10,000 条历史、20 次采样的发送/切 Bot 反馈
  与 DOM 文本完整性，并记录堆/RSS 曲线。证据见 `docs/evidence/m5-performance.md`。

- macOS 应用菜单：新建 Bot（`Cmd+N`）、搜索 Bot（`Cmd+K`）、设置（`Cmd+,`）、
  放大/缩小/实际大小（`Cmd+=`/`Cmd+-`/`Cmd+0`）、显示主窗口，以及标准编辑/窗口角色；
  菜单文案随界面语言切换，底栏设置菜单打开时焦点进入菜单、关闭后回到底栏入口。
- 键盘与可访问性回归（`tests/e2e/m5-accessibility.spec.ts`）：菜单命令打开对应界面并聚焦
  正确控件；缩放改变页面且复位后无横向溢出；中文输入法 composition 期间 Enter 不发送、
  Shift+Enter 换行；降动态时过渡时长为 0；所有可见控件都有可访问名称，Tab 可到达全部主要
  区域。证据：`docs/evidence/m5-gui-a11y.md`。

- 打包与签名：`forge.config.js` 可按 `MOSBOT_MACOS_SIGN_IDENTITY` / `MOSBOT_NOTARY_*` 启用
  Developer ID 签名、硬化运行与公证，并附带最小 entitlements；没有证书时保持未签名 ZIP，
  报告中如实标为 ad-hoc/未签名。
- `pnpm test:install` 把打包 ZIP 解压到临时目录、用全新 userData 启动，检查标题、版本、
  bundle id、离线名单与连接弹层；报告记录体积、SHA-256 与 ad-hoc/Developer ID 签名状态。
- 本地状态恢复：主文档损坏时回退上一份 `.bak`，并在下次写入前把损坏文档另存为 `.corrupt`；
  更高 schema 仍拒绝覆盖。
- 覆盖升级 E2E：上一测试版的 v1 文档保留草稿、选中 Bot 与主题并原地升级到 v2；主文档损坏时
  可从备份恢复。证据：`docs/evidence/m5-install-upgrade.md`。

- `README.md` / `README_zh.md` 补齐用户指南：连接与登录、Bot/聊天/审批、文件与产物、
  本地数据与手动升级，并用当前限制替换过时的 M0a 列表。

- 已用本机 Apple Development 证书端到端验证签名链路（硬化运行时、最小 entitlements、
  `codesign --verify --deep --strict`、签名 ZIP 启动）；Developer ID 签名与公证仍需
  Developer ID 证书与 notarytool 凭据。

### 变更

- `pnpm test` 覆盖扩展：地址策略、传输错误分类、PKCE、凭据库、loopback state 校验与完整登录/探针流程（89 个用例）。
- pnpm 作为 devDependency 固定，Electron Forge 的包管理检查无需全局 pnpm 即可复现。

### 说明

- 本条仅为源码改动：尚无签名安装包、升级路径与真实 Dashboard 连接。M0a 用样例数据做界面评审，M0b/M1 再切换到 `192.168.2.171:9119` 真实服务。
- 截图中的聊天内容全部为脱敏样例数据。
- M0b 探针已在测试部署（`192.168.2.171:9119`，v0.22.5 / `bf0203a794`）跑通：health、status、
  鉴权形态、登录提供方、native authorize、浏览器登录、身份、刷新轮换、失效刷新处理、ws ticket、
  WS 握手、`gateway.ready`、`client.capabilities`、`profiles.list` 与精确 Bot Chat 查询均通过；
  复用与过期 ticket 被拒绝。真实 turn（delta/停止/resume）仍未验证；详见
  `docs/evidence/capabilities.md`。

## [0.1.0] - 2026-11-03

### 新增

- M0a 设计切片基线（当前内容见 Unreleased）。

[Unreleased]: ./CHANGELOG.md#unreleased
[0.1.0]: ./CHANGELOG.md#010---2026-11-03

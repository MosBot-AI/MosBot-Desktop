# 更新日志

[English](CHANGELOG.md)

MosBot Desktop 的所有重要变更记录在此。格式遵循
[Keep a Changelog 1.1.0](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循
[语义化版本 2.0.0](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。源码改动、已构建产物与已安装/已发布版本分开列出，避免把源码改动误读为可安装版本。

源码仓库已发布到 https://github.com/charleypeng/MosBot-Desktop；首个签名 tag 出现前，对比链接仍使用本文件锚点。

## [Unreleased]

### 新增

- 群聊名单基础：主进程 chat manager 读取 gateway 的 hosted-room 列表（`groups.list`），侧栏渲染只读「群聊」分区（房间名与成员数）；点击房间打开状态/日志视图（`groups.state` + `groups.log`），输入框已接 `groups.send`；侧栏创建弹层用 2–6 个本地 profile 建群，群视图发送并每 3 秒轮询 `groups.log` 与 `groups.state`（working/blocked 状态、错误呈现），停止按钮可取消群工作，模拟 socket 断开后群视图可恢复；端到端测试已验证创建 → 发送 → 渲染 → 停止 → 解散；群视图显示成员标签、Markdown 消息与审批横幅（允许一次/拒绝均已验证），定位到最新日志页并可加载更早历史。群附件与语音仍受部署能力限制。
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
- 中英成对的 `README.md` / `README-zh.md`：环境要求、运行与检查命令、目录结构、文档索引与 M0a 已知限制。
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

- `README.md` / `README-zh.md` 补齐用户指南：连接与登录、Bot/聊天/审批、文件与产物、
  本地数据与手动升级，并用当前限制替换过时的 M0a 列表。

- 已用本机 Apple Development 证书端到端验证签名链路（硬化运行时、最小 entitlements、
  `codesign --verify --deep --strict`、签名 ZIP 启动）；Developer ID 签名与公证仍需
  Developer ID 证书与 notarytool 凭据。

- 60 分钟重连/空闲 soak（`pnpm bench:soak`）：四通道经真实合并器，90 秒一轮的流式、空闲与
  重连回放，滚动哈希校验文本完整性，逐轮记录批次年龄/队列并采样 RSS/堆。完整运行 40 轮、
  960,000 帧，最差批次年龄 p95 25 ms，队列有界，RSS +13.8 MB。证据：
  `docs/evidence/m5-soak.md`。
- 聊天探针现在同时记录索引产物的 `mtime` 与是否悬空链接，真实服务复跑可验证新字段映射。

- 真实服务复跑（chat 探针，专用 profile 自动清理）：发送、首个 delta、终态、停止、附件读取、
  含真实 `mtime` 的产物索引与读取全部通过；审批仍因部署对 terminal 工具自动放行而未触发，
  记为未关闭项。

- 修复：已连接的聊天在 renderer 重载 / 关窗后从 Dock 重开时，`chat.open` 现在重新发送
  connection、session 与未处理请求，而不是返回无事件的缓存结果；远端 chat 缓存会同步
  canonical stored session；输入条在会话真正就绪前保持禁用，避免 “session is not ready”。
- 真实服务 chat 探针现在只读 `approvals.mode`，并用自己的探针文件触发一个受控危险命令审批：
  请求、拒绝（命令未执行）、允许与终态均已在测试部署验证。证据：
  `docs/evidence/m1-background-approvals.md`。

- 真实审批也做了 GUI 全链路验证：应用内新建专用 Bot → 内联审批卡 → 切走后出现后台
  「待确认」→ 点击跳回 canonical 会话并重投审批卡 → 拒绝后折为回执且角标清除。该过程还修复了
  跨会话事件游标泄漏导致的 false history-stale、审批回执随请求被删除、以及输入条在自身会话
  就绪前接收输入（可能发到上一个 Bot）等问题。

- 网络断开现在可见：主窗口根据系统 online/offline 事件显示固定提示，聊天连接横幅有专门的断网
  文案，资料库把 unreachable/timeout 映射为断网提示，电脑观看窗口显示断网状态并在网络恢复时
  通过 `computer.reconnect` 重新取得 display ticket、重建 RFB。E2E 增加了断网/恢复提示用例。

- 电脑观看窗口：noVNC 不再发送 WebSocket 子协议（部署 RFB bridge 不协商子协议，之前每次
  握手都失败）；viewer 窗口被允许驱动自己的租约/重连/关闭 IPC，而不再被当作不可信发送者拒绝。
  真实画面可渲染（1440 × 900 canvas），可以取得/归还控制并关闭窗口。

- 观看窗口在 RFB 关闭时（被 4000 踢下线或网络掉线）会自动重新 observe、重建连接并回到只读，
  而非停在“已断开”。双客户端实测确认当前部署仍允许后来者抢占租约（M0c 原子认领缺口），
  且被踢客户端能恢复为仅观看。

- M0c 电脑租约补丁已就绪：`acquire_if_free` 在同一个 profile 文件锁内完成 holder 检查与写入，
  冲突时返回 `lease_conflict` 回执；客户端保留 `error.data.code`，被拒绝的接管显示“其他人正在
  控制”而不是断线。补丁仅作为参考实现：本工作流对测试服只有 Dashboard API 授权（不改/不部署/
  不重启服务），因此 M4 该项保持部分验证。

- 修复：通过搜索结果切 Bot 只更新 `selectedBotId`，未同步 remote/live 选中，聊天与输入条仍停在
  上一个 Bot（快速发送可能发错会话）。
- 双客户端审批同步：网关不会向其他客户端推送处理结果，打开的聊天在有待处理请求时每 5 秒用
  `session.resume` 的 `open_requests` 对账；被另一端处理的请求折成「已由另一端处理」回执。
  双客户端 walkthrough 验证了共享聊天观察与该回执。证据：`docs/evidence/m1-dual-client.md`。

- 通知路径已用测试专用诊断钩子做程序化验证：失焦（最小化）窗口中的真实审批会请求系统通知
  （Bot 名 +「需要你确认」），点击处理会恢复窗口、打开等待中的 Bot 并重投审批卡。macOS 横幅像素
  与真实鼠标点击仍未验证（本 shell 无屏幕录制权限），walkthrough 报告中已注明。

- 审批可跨“关闭主窗口 → Dock 重开 → 完整退出重启”保留：无窗口时请求系统通知，重建窗口后重投
  审批卡；重启后会恢复会话并重投仍未处理的请求，拒绝后显示回执。证据：
  `docs/evidence/m1-window-lifecycle.md`。

- 跨客户端未打开 Bot 审批：A 保持 Chat 附着时，停在另一个 Bot 的客户端 B 由 pending watcher
  发现等待会话，在窗口最小化时收到通知；点击通知直达并处理请求，A 随即将卡片折成
  「已由另一端处理」回执。

- 把发布候选验收整理进 `docs/evidence/acceptance.md`，并新增
  `docs/evidence/final-checklist.md`：每个剩余项都写明归属、用户操作与复验命令。新增真实连接
  冷启动 walkthrough（真实服务、专用 Bot、完整退出重启），验证恢复选中 Bot 与草稿；索引已链接
  脚本与证据。另提供 7 天日用记录模板。

- 并发与强退安全已在真实服务验证：两个客户端同时回答同一审批不会重复执行命令、不会残留卡片
  （API 没有“获胜方”回执，两个窗口的回执可能不同）；在途 prompt 时 SIGKILL，重启后聊天恢复且
  prompt 只出现一次（不自动重发）。

- 观看窗口打开时直接渲染 `display.observe` 返回的 lease 快照：若已有他人持有，立即显示
  「其他人正在控制」，而不是先误报“仅观看”。强杀/重启 walkthrough 确认该部署不会留下卡死的
  人类租约：重启后为只读、可取控制，重新取得成功。

- 观看窗口断线重连新增 walkthrough：测试专用 socket 断开（或 renderer offline/online 事件）会触发
  重新 observe 并重建 RFB，其间显示断网文案。这是模拟验证，真实网卡断开仍未实测。

- 自动化界面测试不再打扰用户：`MOSBOT_TEST_BACKGROUND=1` 创建隐藏、不可聚焦窗口并隐藏 Dock
  图标、禁止应用激活；E2E harness 与 `scripts/gui-*.mjs` 默认开启。需要人观看时用
  `MOSBOT_TEST_FOREGROUND=1`。已用窗口状态探针（visible/focusable/dock=false）、21 项 E2E 与
  两个真实服务 GUI 流程验证。

- 聊天断线回放新增测试专用 socket 断开验证：自动重连（disconnected → reconnecting →
  connected）、既有 transcript 保留、重连后新消息仍收到真实回复、回放不重复消息。真实网卡断开仍
  需可复现环境。

- 跨客户端 Kanban 刷新能源真实服务验证：在专用 probe board（walkthrough 期间保留、随后由 probe
  清理）上，另一端创建任务，本端点「刷新」后可见。

- 修复：本窗口回答审批后没有把请求移出跨端对账集合，后续 `session.resume` 可能把本窗口回执
  覆盖成「已由另一端处理」。现在本窗口回答会先移出对账集合；两个单测覆盖远端对账与本窗口回答
  路径，并发审批 walkthrough 确认两个窗口各自保留回执（剩余差异来自服务端缺少“获胜方”事件）。

- 双客户端同时向同一聊天发送不同 prompt 已验证：各自只出现一次（不丢/不重复），两轮都完成。
  网关不广播其他客户端的用户消息事件，实时用户气泡不会跨端出现，重开/重连后由历史补齐
  （记为服务端能力限制）。

- 修复：Kanban board 的迟到响应可能覆盖已经切走的当前 board。`loadBoard` 现在丢弃 slug 不再是
  当前 board 的响应，切换时同步更新当前 board ref。用专用 board + 注入延迟的 walkthrough 验证
  旧响应被忽略、切回后任务正常显示。

- 记录验证限制：无法通过 Dashboard API 构造“未配置模型”的 Bot（`PUT /model` 拒绝空值，新建
  profile 会继承可用模型），该引导路径需要真实未配置环境或明确授权清空测试 profile 的模型。

- Sessions 页也补上类似 Kanban 的旧响应守卫：会话列表、搜索、打开会话与消息分页在 profile /
  query / session 已切换时丢弃旧响应。用专用空 profile 注入延迟的 walkthrough 验证：切走后快
  profile 的 50 条会话不被覆盖，切回空 profile 正常显示“还没有会话”。

- 搜索旧响应也已验证：慢的无结果查询之后立即输入能命中的查询，旧结果不会清空新结果
  （测试专用延迟注入）。

- 流式基准也改为隐藏窗口运行，性能门槛不再打扰用户。修复后的冒烟（30s steady + burst）通过：
  p95 30.8ms / 30.6ms，无未决批次与长任务。

- 修复：审批对账把 `session.resume` 缺少 `open_requests` 字段当成“所有请求已处理”，在不返回该
  字段的网关上会在第一次轮询后清空所有待处理卡片。现在字段缺失时跳过对账；已加单测。

- 修复资料库的旧响应隐患：切换 Bot 后，旧 Bot 的 artifacts 列表/预览/保存响应不会覆盖新 Bot
  的内容（与工作台同类问题）。

- 电脑状态/缩略图/唤醒现在支持并转发显式 profile：资料库“电脑”页传入当前 Bot，租约与缩略图
  抑制按该 profile 读取，而不是按网关当前会话上下文。单测覆盖参数路由；runtime/geometry 仍是
  主机级共享值。

- 检查器三个 tab 现在按 Bot 加 key，切换 Bot 不会复用上一个 Bot 的资料库列表、电脑状态/缩略图或
  cron 行；电脑页的加载器依赖 profile，并丢弃已非当前 Bot 的响应。

- 记录隐藏模式完整 10 分钟基准复跑：steady（p95 32.6ms）、burst（30.5ms）与历史渲染通过，但
  switch 反馈在两次隐藏复跑中出现 2/20 大异常值（p95 199.8ms），因此未标记通过；建议机器空闲时
  以前台可见窗口复跑。未放宽门槛。

- switch 反馈门禁改为测“正常聊天切换”：先清理合成的 10 分钟流式文本（其帧延迟/完整性已由
  steady 单独测量），把“大文本仍挂载时的切换”单独记为信息指标（p95 49.8ms）。隐藏模式完整
  10 分钟通过：steady p95 32.2ms、burst 30.2ms、send/switch 反馈 17.3ms、10k 历史 27.8ms。

- 新增 `docs/evidence/delivery-summary.md`：当前验证计数、已实现范围、隐藏测试模式说明、复验命令，
  以及仍阻塞首版的 5 项外部/用户动作。

- 本地打包默认做 ad-hoc 完整签名（`postPackage` 执行 `codesign --force --deep --sign -`），因为
  linker-signed 产物的 Identifier=Electron、Info.plist 未绑定，macOS 不会注册通知；配置
  Developer ID 时仍走原 osxSign 路径。记录用户范围决定：非抢占租约移出首版、接受内部签名、
  7 天日用自行管理、授权测试服务器配置。

- 修正为显式开关：`MOSBOT_ADHOC_SIGN=1 pnpm make` 才做 ad-hoc 完整签名（发布/通知验证用）；
  日常测试包保持 linker-signed，因为改变代码身份会让既有 userData 的 keychain 凭据失效
  （`vault_unavailable`）。

- 在用户授权下重新尝试构造“未配置模型”：解密会话后直连测试服 REST，发现 profile 创建总会继承
  默认模型且 `/api/model/info` 返回该继承值，`PUT /model` 又拒绝空值/无凭据 provider，因此该
  状态无法通过 Dashboard API 构造；诊断脚本与限制已记录。

- 消息面板旧响应也已验证：先打开慢会话、立即打开另一个会话，新 transcript 保留、旧消息被丢弃
  （对现有会话只读 + 测试专用延迟）。

- 记录测试服为 `hermes serve` 无头后端：插件管理 API 返回 404（web UI disabled），因此“插件禁用”
  状态需要服务端 CLI + gateway 重启，无法通过 Dashboard API 构造。

- 通知权限已视觉验证：屏幕录制授权后，首次真实请求弹出 macOS「MosBot 通知」权限提示；点击后
  系统设置显示允许通知，ncprefs 出现 com.mosbot.desktop 条目（已提交裁剪截图）。真实审批横幅仍需
  签名版保持打开后再触发一次；证据记录当前状态。

### 变更

- 仓库文档改为中英双语：`docs/` 下每个文件在原路径保留英文主文件，并提供 `-zh` 中文版，
  成对文件顶部互加语言链接；README/CHANGELOG 链接同步调整。GitHub 交付看板迁到
  MosBot-AI 组织，按英文跟踪状态、阶段、优先级、验证与证据；里程碑、标签与 issue 也用英文。
  本地录屏参考已标注为未提交，公开文档不再链接被忽略的文件。
- `pnpm test` 覆盖扩展：地址策略、传输错误分类、PKCE、凭据库、loopback state 校验与完整登录/探针流程（89 个用例）。
- pnpm 作为 devDependency 固定，Electron Forge 的包管理检查无需全局 pnpm 即可复现。

### 修复

- 服务端向所有客户端广播结算时，重复的 `resolved-elsewhere` 取消不再覆盖本地审批回执。
- 系统通知点击现在会先刷新 Bot 名单，再打开对应 Bot；即使该 Bot 是其他客户端在名单加载后
  新建的。此前只会把窗口带到前台，审批卡不会打开。

### 说明

- 本条仅为源码改动：尚无签名安装包、升级路径与真实 Dashboard 连接。M0a 用样例数据做界面评审，M0b/M1 再切换到 `192.168.2.171:9119` 真实服务。
- 截图中的聊天内容全部为脱敏样例数据。
- M0b 探针已在测试部署（`192.168.2.171:9119`，v0.22.5 / `bf0203a794`）跑通：health、status、
  鉴权形态、登录提供方、native authorize、浏览器登录、身份、刷新轮换、失效刷新处理、ws ticket、
  WS 握手、`gateway.ready`、`client.capabilities`、`profiles.list` 与精确 Bot Chat 查询均通过；
  复用与过期 ticket 被拒绝。真实 turn（delta/停止/resume）仍未验证；详见
  `docs/evidence/capabilities.md`。

### 修复

- 群视图切换到其他房间后，会忽略迟到的发送/停止/审批/加载更早响应。
- 群消息显示成员显示名、隐藏内部 `turn.settled` 行、本地化 driver 状态并通过 ARIA log 播报轮询新增；retry 类型待处理动作提供重试；群聊标题栏提供刷新操作；创建弹层支持焦点陷阱与恢复；群操作改为追加新日志而不是重置到第一页；群视图可在确认后解散房间；群名单为空时分区仍显示加载/错误/重试状态，重复选择当前房间不重置，只有 approval 类型的 pending action 显示审批按钮。

## [0.1.0] - 2026-11-03

### 新增

- M0a 设计切片基线（当前内容见 Unreleased）。

[Unreleased]: ./CHANGELOG.md#unreleased
[0.1.0]: ./CHANGELOG.md#010---2026-11-03

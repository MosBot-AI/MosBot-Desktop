# Hermes Dashboard 接入与流式架构

[English](02-dashboard-integration.md)

源码基线为 `~/dev/hermes-agent` 的 `c419cf7c86`。对照移动端 `91d9b43` 的 Dashboard 网络模块及 llmwiki《Hermes Dashboard 后端契约》。下文的路径和方法来自源码核查，部署版本、权限、插件、路由开关及代理兼容性由 M0b 在指定真实服务 `192.168.2.171:9119` 上验证。以目标部署的结果更新契约 fixture 后再开启功能。

## 进程和传输

| 层 | 职责 |
| --- | --- |
| Main | BrowserWindow、系统登录、凭据存取、Dashboard 地址验证、认证刷新、ticket broker、文件和麦克风授权、Utility Process 生命周期。使用 Electron `session.fetch` / `net` 请求 REST、交换授权及读取响应流 |
| Dashboard Utility Process | 每个已连接 Dashboard 一个逻辑连接上下文，聊天 JSON-RPC 使用长连接，Kanban 按打开的 board 建独立 WS。负责 WS 帧校验、RPC 关联、事件归一化、状态 reducer、会话回放、背压、连接状态及有界数据缓存 |
| Renderer + preload | 本地页面，窄类型桥提供 `connect`、`listBots`、`openChat`、`send`、`stop`、`answerRequest`、`subscribe` 等具体命令。REST 缓存使用分页 DTO。独立电脑窗口仅经受控桥接取得短命显示 ticket，以 noVNC 处理 RFB；正文 React 渲染和电脑帧分别调度 |

Utility Process 通过 Main 请求当前连接的受限 ticket，并对照连接代次使用。验证 WS 客户端与目标部署的系统代理、PAC、WSS 证书、反向代理前缀和重连行为。Node 的 WebSocket 库自有网络栈，代理规则单独适配与测试。若其无法符合部署要求，把 socket I/O 放到独立的 Electron sandbox transport renderer，由 Chromium 处理网络，Utility Process 继续负责投影和聚合。电脑流不转成 JSON/Base64 经主聊天管线。 [Electron net](https://www.electronjs.org/docs/latest/api/net) · [Electron MessagePorts](https://www.electronjs.org/docs/latest/tutorial/message-ports)

单个窗口以 `MessageChannelMain` 建订阅端口，数据端口只发脱敏后的域事件。Main/服务命令接收端校验 sender、schema、窗口、账号和 scope；preload 只暴露允许的窄接口，renderer 只收到必要 DTO。关闭窗口、退出登录、切连接、进程崩溃时关闭端口并淘汰旧代次。生产启用 context isolation、sandbox、严格 CSP、关闭 nodeIntegration，拒绝非预期导航和新窗。聊天 Markdown 禁用原生 HTML，代码复制与链接打开使用明确动作，附件预览与外链依据允许的协议和源处理。主进程不暴露任意 fetch、文件路径或原始 IPC。 [Electron 安全指南](https://www.electronjs.org/docs/latest/tutorial/security)

## Dashboard 路由与功能矩阵

| 界面 | 真实接口与字段 | 实施要求 |
| --- | --- | --- |
| 首次连接与鉴权 | `GET /api/health`、`GET /api/status`、`GET /api/auth/providers`、`GET /auth/native/authorize`、`POST /auth/native/token`、`POST /auth/native/refresh`、`GET /api/auth/me`、`POST /api/auth/ws-ticket` | 浏览器 PKCE S256，使用 loopback 临时端口及随机 state，校验 host、path 和 state 后换码。支持的密码提供方由浏览器完成。验证 account 与部署身份再建数据层 |
| Bot 名单与在线状态 | `/api/ws` 上 `profiles.list {include_sessions:true}`、`session.active_list {profile}`，用 `canonical_session`、`ui_meta["hermes-bots"]`、`ui_meta_revisions` 与实际活动事件 | 默认 profile 也可以是 Bot。Roster 快照后用已验证的变更通知和稀疏复查，普通名单前台才轮询，待处理请求的后台发现另按下文执行；合并重复查询。校验 `install_id`，未知活动显示未知 |
| Bot 创建与外观 | `profiles.create`、`profiles.configure`；`ui_meta_expected_revisions["hermes-bots"]` 为 CAS 条件 | `name` 为连接范围唯一 slug，显示名和外观按移动端 meta 映射并保留未知字段。使用 `no_alias:true`、`mirror_credentials:false`，显式完成下文模型就绪流程；不把 Profile 创建成功当作可聊天。外观失败重试现有 slug |
| Bot Chat 标识与回放 | `session.list {profile,title:"Bot Chat",include_hidden:true}`，`session.create {profile,title,hidden:true,follow_profile_config:true,idempotency_key}`，`session.title` 用于首次发送前认领标题，`session.resume`，`session.events.since {session_id,last_seen}` | 用持久 id 和 `resolved_id` 锚定记录，用运行时 id 发实时 RPC。创建与重连规则见下文 |
| 实时聊天与操作 | `prompt.submit {session_id,text,...}`、`session.interrupt`、`client.capabilities {server_requests:true}`；`message.*`、`tool.*`、`session.*`、`approval`、`clarify` 等；`image.attach` / `file.attach` 按部署验证 | 流式帧从 WS 接收，工具归组。审批/澄清按服务端请求 id 及原 scope 回复，校验选项；仅在端到端链路准备好后宣告能力。附件使用系统选择器和尺寸限制，服务端返回引用后才随文本提交 |
| 资料库与详情 | `GET /api/sessions/{storedId}/messages?profile=…&limit=50&order=latest&inline_images=false`，`GET /api/cron/jobs?profile=…`；经验证的 `/api/files/*` 或文件 ticket | 按消息游标索引有类型且归属该 Bot 的附件/产物，保留来源消息和续接会话身份。任意 Markdown 路径不自动作为可读文件。至少跑通真实产物的索引、保存和打开；缺少元数据/授权下载能力进入 M0c，附件列表只是中间产物 |
| 电脑 | `display.status`、`display.thumbnail`、`display.start`、`display.observe`、`display.lease.acquire/release`；`/api/display/ws` 为 RFB WebSocket，`display.lease/status` 事件更新 UI | 详情面板只读取状态和有权限的缩略图，显式唤醒后再打开独立 viewer；租约见下文 |
| Hermes Profiles | `GET /api/profiles`、`GET /api/profiles/active`，模型配置使用 `PUT /api/profiles/{name}/model {provider,model}`，保存后重新查询同一 profile | 有权限时才开放已验证字段的写操作。切换工作台的 profile 是客户端选择，只有用户明确操作才改服务端 active profile |
| Hermes Sessions | `GET /api/sessions?profile=…&order=recent&limit=50&offset=…`、`/api/sessions/search`、`/api/sessions/{storedId}/messages` | 分页消费到底，保留筛选口径和锚点。区分普通会话和 Bot 的隐藏主对话；按用途区分计划任务和普通会话 |
| Hermes Kanban | `GET /api/plugins/kanban/boards`、`GET /board?board=…`、`GET /tasks/{id}`、`POST /tasks`、`PATCH /tasks/{id}`；简写的 REST 路径均使用同一插件前缀；WS `/api/plugins/kanban/events?board=…&since=…` | 按 board 保持 scope。从 board 的 `latest_event_id` 订阅 `{events,cursor}`，合并失效再读快照；重连重新签票，用旧 cursor 续上，缺口/重启重抓快照。插件缺失有独立状态 |
| 群聊与语音扩展 | `groups.capabilities` 后接 `groups.list/create/state/log/send`；语音验证 `POST /api/audio/transcribe`，实时转写另验 `/api/audio/transcribe-stream` WS | 群按连接 + room id + thread id 投影，日志 cursor 和 `event_id` 由协议处理；成员头像来自 MosBot。转写先进草稿供用户确认。能力未验证前留在 fixture |

认证按部署形态适配。受 gate 保护的 Dashboard 用 native bearer 调 REST 和换一次性 WS ticket，聊天和 Kanban 的 ticket 分开获取，票据过期或用过后重签。源码另有 loopback session-token 路径，M0b 要明确其凭据入口与 WS 握手，用户提供令牌时独立管理。生产默认 HTTPS/WSS，精确 loopback 可用 HTTP/WS。M0b 记录指定测试服务的实际 scheme；如仅提供 HTTP/WS，仅为 `192.168.2.171:9119` 配置精确 origin 的测试例外，不扩展为任意内网地址、不忽略证书错误，也不替换 OAuth。使用 Keychain 或 Electron safeStorage 保存需持久的凭据，access token 优先只存内存，凭据、票据、请求体及屏幕画面不进入日志。按连接做单飞刷新，401 后只重试可安全重放的读操作，写操作按其幂等及回读规则处理。反代前缀绑定到连接，限制请求和重定向来源。

### 新 Bot 配置到首次回复

创建使用 `mirror_credentials:false`，不会替用户复制凭据或继承可用模型。M2 负责同一 profile 的配置状态机，M3 的模型页面复用它：

1. 从后端查询该 profile 的模型选项、当前选择及授权状态。M0b 固定真实端点、字段和权限；已有登录 Dashboard 的身份不代表模型已授权。
2. 凭据仍由后端管理。打开同一 Dashboard 上绑定原 profile 的配置页，回到应用后重新读状态；浏览器完成页不能单独证明成功。若部署无法定位或配置该 profile，进入 M0c 修复，不让用户猜页面或手改文件。
3. 保存 provider/model 后回读相同 profile。分别处理未授权、模型不可用、超时和配置部分成功，保留 slug、草稿和已完成步骤；切账号或 profile 后旧回调无效。
4. 配置验证后开放首条发送，经 canonical 认领再真实推理。收到回复并回读持久历史才通过新建验收；重启可继续同一会话。额外的付费探测由明确测试动作触发，不在每次状态检查时自动调用模型。

### 会话一致性与恢复

1. 数据键最少含 `connectionId + verifiedPrincipal + profile + storedId`。运行时 id、请求 id 和 seq 另绑定 `connectionGeneration` 及 replay epoch。Roster 中的 canonical 提示可先绘制预览，发消息前执行精确标题查询及拥有者校验。压缩后的 tip 更换时归并到原 Bot。
2. 已有会话直接 resume。仅精确查询成功且确定缺失时才在首条发送前创建；客户端按 profile 单飞，同一次创建重试沿用 idempotency key。当前源码的普通 create 返回 lazy 会话，显式 `session.title {session_id,title:"Bot Chat"}` 会尝试持久化并在标题事务中检查冲突。先认领标题，再用精确查询回读，确认同 profile、hidden 的 canonical 记录与候选 stored id 一致才向候选发送。遇到 4022 时重查并 resume 胜出的 canonical，放弃候选，保留草稿，由用户确认再次发送。遇到 pending、可见同名旧会话或归属无法确定时保留草稿并标明原因。M0b 用两个客户端同时首次发送复现标题竞争，观察候选空行及后续恢复。在目标部署验证持久回读和冲突保护后才启用新建 Bot 的首发。缺少保护时可继续已存在 Bot Chat 的链路，并将认领能力加入 M0c；M2 与首版验收保持阻塞，直至指定部署复验通过。
3. 接受 WS 事件与 RPC 响应乱序。发送前生成 client operation id，维护「待发送 / 待确认 / 排队 / 回复中 / 已完成 / 已停止 / 失败」。用目标版本实际提供的 admission/消息 id 对账，未确认的写入先查历史和 active state，有可靠服务端幂等时才自动重试。默认运行中保持草稿并提供「停止」；部署验证队列后方可启用显式排队。避免把旧 turn 的晚到终止事件应用到下一轮。
4. 断线先标恢复，按指数退避加抖动换票。等待 gateway ready，使用 stored id 续接获得当前 runtime id、持久历史、inflight 和 open requests，按同 epoch 的 `last_seen` 重放。缓冲实时事件直至基线建立，按 scope、seq、turn/row id 去重。若 replay 截断、epoch 改变、进程重启或 runtime id 失效，按新快照与持久历史重建。恢复后仍活跃则保留 Stop，并以终止事件或重新核实的服务端状态落地。
5. M0b 实测两个 Dashboard 客户端同时打开同一个运行中的 Bot Chat。当前源码的 live resume 路径会尝试把调用方加为活动会话订阅者，提交路径另有 transport 重绑定。用双客户端证明观察会持续收到增量、关闭观察端不会打断当前轮，并验证两端的写入权限与审批行为。需要时使用持久历史和活动快照提供只读显示；确认拥有控制权后才允许发送、审批和停止。切 Bot、关详情或刷新资料应保留活动回复与待确认请求。

### 待处理请求与文件交付

- Utility Process 维护按账号、profile、会话和 request id 隔离的待处理索引；订阅/对账不随选中 Bot 或可见列表裁剪。M0b 验证未打开 Bot 的请求发现、跨端已处理回执及恢复能力，缺失时由 M0c 补齐。重连先核实 open requests，再恢复动作；通知去重与已读位置持久化，切账号立即失效。
- 文件由 Main 使用系统选择/保存对话框处理，renderer 只持有绑定窗口、账号、profile 和用途的不透明句柄。上传限制类型/大小，取消和失败保留草稿；禁止 renderer 提交任意本机路径。远端引用在发送前验证归属及有效期。
- 下载重新校验资源身份和权限；短命授权过期可重签，禁止直接信任消息中的 URL 或路径。大文件流式写临时文件，成功后原子落位；有进度、取消、失败重试和覆盖确认。预览使用受限本地内容，不执行 HTML/脚本；外部打开只接受用户明确选择且下载完成的文件。
- 索引覆盖完整历史分页与压缩续接，按稳定资源标识去重。已删除、无权访问与暂时失败分开；从资料项可回到来源消息。真实验收包括上传文件被模型读取，以及生成产物在重连、重启后仍能保存并打开。

### 本地数据与升级

Main 单写应用 `userData` 下的版本化 JSON，串行执行临时文件落盘和原子替换；凭据另存 Keychain/safeStorage。持久数据包括连接、账号隔离的草稿/附件元数据、分区置顶、未读位置、窗口及语言外观偏好、待确认操作 id；权威历史和租约始终从服务端恢复。暂存附件有大小/期限限制，原文件失效时要求重新选择。

输入短防抖保存，切 Bot、关窗和正常退出前刷盘。崩溃恢复读取最近完整版本；待确认发送先对账，不能自动重发。每次 schema 迁移前备份，失败保留原文件并给出恢复入口；旧版本遇到更高 schema 拒绝写入。注销清除凭据、端口和内存投影，账号草稿隔离保留；用户明确清除后才删除该账号本地数据、对应备份和暂存附件。

首版采用签名安装包手动覆盖升级，在关于页提供下载/版本说明，自动更新后置。M5 从本次重做的前一测试版升级，覆盖正常迁移、强退及迁移失败恢复；回退先恢复对应数据备份，不能让旧版覆盖新格式。保持稳定 app id 和数据目录，旧 Desktop 数据导入不在首版范围。

### 电脑查看和接管

电脑标签仅在 `display.status` 能力已确认的部署出现。打开标签只读，显式「唤醒」后等权威状态并限频取预览。有人接管或服务端返回 suppressed 时立即清除预览，禁止使用旧帧冒充实时画面。打开独立窗口时先 `display.observe {profile}`，用一次性 ticket 建 RFB 只读连接，绑定服务端返回的 viewer id 和 profile。ticket 与聊天认证通道分离，禁入剪贴板和日志。

用户点击取得控制权后，调用经部署验证的租约认领，并用返回的 holder/epoch/viewer hash 核对。当前源码的 acquire 可替换另一 viewer 的租约，先读再 acquire 有竞态。要求无抢占接管时，以服务端条件认领或受验证的等价保护为启用条件，能力未满足时只读观看仅作为中间交付，M0c 必须补齐原子条件认领并在指定部署验证，M4 不得结项。只有租约匹配且 viewer 连接正常才转发输入。归还时释放按键及鼠标状态，然后使用当前 viewer id 调用 release，等回执回到仅观看。离开、断线或租约丢失立即关输入，重连先观察，重新核对权限后允许显式接管。关窗尽力归还当前窗口持有的租约，失去 viewer id 后避免 force release。对“接管响应晚于关闭”和“两端争用、收回、重连”分别做真实测试。远端停机与归还控制单独提供。

M0c 的条件认领契约须在服务端同一事务/锁内校验 holder 与预期 epoch 并写入；冲突返回权威租约，不改变现有 holder。同一 viewer 重试幂等，失去 viewer 身份不能释放他人租约。字段和方法名由协议负责人冻结，不将设计中的条件参数伪装成当前接口。复验两个 viewer 并发认领仅一个成功、迟到响应/关窗、断线和租约回收；用户主动接管与强制抢占必须区分，首版不提供强抢入口。

## 高吞吐与背压

- Utility Process 解析、验证和聚合。按会话与 turn 在 16–32 ms 内合并文本 delta 后发 `StreamBatch`，每批限制帧数和字节。服务端请求及终态优先交付。合并只改变批量粒度，保持同一 turn 的文本和控制事件顺序。
- MessagePort 基于 ACK 做有界窗口，初始可用 8 批及每订阅 512 KiB 作调优起点。慢消费者优先合并临时进度，以快照替换积压投影。原始正文与必达事件保留在有界逻辑状态，通过服务端回放或快照补齐。溢出立即进入同步恢复状态并记计数。
- 分离持久 REST 分页、活跃消息与 Bot 摘要。只重新渲染变更中的消息，流中按块解析 Markdown，终态完整渲染；代码高亮、大文件处理先测再移至 Worker。固定历史分页大小，有界保留已完成消息；当前活跃回复优先保留，缓存超限时淘汰非活动页并保留滚动定位。
- 已核对的聊天、Kanban 和电脑都是 WS。未来存在 SSE 路由时在流服务中增加增量 parser，支持 UTF-8 跨块、CRLF、多行 `data`、事件上限、AbortSignal。只有服务端声明续传语义时才带 Last-Event-ID。相同投影与背压策略适用，不要求新增 SSE 代理层。
- 先用 trace 测网络读、JSON parse、消息拷贝、Markdown、布局和 RFB 各阶段。CPU 热点若确认为解析或转码且持续超预算，先把该段从共享队列分离，再用同一 fixture 比较 Worker 或 Rust 原生模块。原生版本须有实测收益并通过签名、崩溃恢复和对应架构的安装检查。 [Electron 性能指南](https://www.electronjs.org/docs/latest/tutorial/performance)

### 初始性能门槛

打包产物在 Apple Silicon 参考机实测并记录机型、OS、电源状态和 Dashboard 版本。用进程内脱敏帧回放器跑 4 个活跃 Bot，每个 100 个小 delta/秒，持续 10 分钟，另跑 5 秒 5 倍突发、单会话 10,000 条历史及 60 分钟重连/空闲混合循环。该合成负载只证明本地管线性能，不启动模拟服务器；另在指定服务实际聊天及电脑观看时重跑交互场景。记录 p95、堆及 RSS 曲线、最大队列、恢复次数。

- 本机帧到可见文本 p95 ≤ 100 ms，单独记录远端模型首 token 延迟。发送/切 Bot 的本地反馈 p95 ≤ 100 ms，滚动、中文输入和右栏开合保持可操作。
- 压测中正文、确认请求及终态完整，长回复中断后可回放。同一 turn 无重复正文，终态不会卡在工作中。突发结束后队列回到稳态，60 分钟循环后内存不持续线性增长。
- 在生产配置运行性能采样，分开记录首屏、连接、首次历史页、批次渲染和电脑预览。性能目标为实施门槛，具体基线由 M0b/M5 实测补入。

## 联调前应固定的证据

- 记录本地源码版本、实际部署版本、URL 前缀、认证形态、可用的方法和插件。来源入口为 `hermes_cli/dashboard_auth/{routes,ws_tickets}.py`、`hermes_cli/web_routers/{chat_ws,status,profiles,sessions,display,audio}.py`、`hermes_state_titles.py`、`tui_gateway/{methods_profiles,methods_session,methods_prompt,methods_session_interrupt,methods_display,methods_groups,server_requests}.py`、`plugins/kanban/dashboard/plugin_api.py`。
- 以两个隔离 profile 做 scope 错配、重放票据、错用户、晚回调、开关窗口、休眠/唤醒、切 board 测试。真实 OAuth、提供方和审批测试使用本次专用测试对象；不切换服务端 active profile、不修改已有 Bot，不为测试擅自重启服务或开关全局插件。
- 将断线、401、重复帧、乱序、epoch 更换、回放截断、模型失败、部分创建、租约丢失、Kanban 404 固定为回归 fixture。发布验收要求真实服务证据及对应集成测试。

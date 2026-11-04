# M4 · 附件与电脑（第一块）· 证据

- 卡片：M4（附件收发、电脑状态/预览/唤醒；产物索引与观看/接管窗口待下一段）
- 状态：**附件上传/真实推理读取、资料库产物索引/预览/保存并打开、电脑状态/预览/唤醒、独立 RFB 观看窗口
  与租约取得/归还均已接入**；观看窗口的真实画面验收待用户在场确认
- 记录时间：2026-11-04
- 目标服务：`192.168.2.171:9119`（v0.22.5 / `bf0203a794`）

## 附件

- 输入条回形针在连接且已打开 Bot Chat 时可用：系统文件选择器（主进程）→ 读取（10 MB 上限）→
  base64 data URL → WS `file.attach {session_id, name, data_url}` → 返回 `@file:` 引用；
- 引用以 chip 形式显示在输入条上方，可移除；发送时把引用与正文一起 `prompt.submit`；
- 失败（超限/读取失败/服务端拒绝）提示且不发送；取消选择静默。
- 真实验证（专用 profile，自动清理）：上传 `mosbot-probe-attachment.txt` 得到引用 → 提示模型读取附件
  → 回复中回显文件内的随机 token（`chat_attach_read` 通过）。

## 资料库

- 工作区解析：聊天 `session.resume` 返回的 `info.cwd` 随 `chatOpen` 一并缓存；资料库用它作为产物根目录
  （未打开过聊天时回退到 canonical Bot Chat 的 session 记录）。
- 索引：`GET /api/files?path=<workspace>` → 文件名、大小、mime、类型（image/text/pdf/other）、修改时间，
  按修改时间倒序，上限 200 条。
- 读取：`GET /api/files/read?path=` → data URL；文本解码后预览（上限 400 KB），图片直接显示；
  PDF/其它类型提示保存后由系统应用打开。
- 保存并打开：主进程把 data URL 写入 Downloads（同名自动加时间戳），再 `shell.openPath` 显式打开；
  失败提示且不覆盖已有文件。
- 真实验证（专用 profile，自动清理）：让 Bot 在工作区创建 `mosbot-probe-artifact.txt` → 索引命中
  （kind=text、24 B）→ 读取内容含随机 token。

## 电脑

- 详情栏「电脑」页在连接模式读取真实 `display.status`（每 5 s 轮询），显示运行/休眠、几何、阻塞原因；
- 运行时读取 `display.thumbnail` 显示 16:10 预览；服务端 `suppressed`（他人持有租约）时隐藏画面并提示，
  不显示旧帧；
- 休眠时提供显式「唤醒」按钮（`display.start`），完成后 1.5 s 重读权威状态；阻塞时禁用并显示原因；
- 独立观看窗口：主进程 `display.observe` 取得一次性 display ticket 与 server-minted viewer id，打开独立
  BrowserWindow（noVNC RFB 直连 `/api/display/ws?display_ticket=`）；控制条显示「仅观看 / 你正在控制 /
  他人控制」，`display.lease.acquire/release` 取得/归还控制权，lease 广播与操作结果同步；关闭窗口或注销时
  自动归还租约并关闭连接。RFB 窗口初始只读，取得控制后才发送输入。

## 例行任务概览

- 详情栏「例行任务」在连接模式读取 `/api/cron/jobs?profile=`，显示任务名、调度与停用状态；空态与 fixture
  一致。只读，不修改服务端任务。

## 验证

| 检查                                | 结果                                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 真实附件探针（专用 profile）        | ✅ 上传 staged、模型回显附件 token、profile 清理                                                                                  |
| 真实 `display.status`               | ✅ supported/installed/running/lease 等字段可读                                                                                   |
| 真实 `display.thumbnail`            | ✅ 读取成功；电脑休眠时 `data_url=null`、无帧、无 suppressed（不伪造画面）                                                        |
| 真实电脑探针（唤醒/票据/租约）      | ✅ running=true · observe ticket+viewer_id · acquire holder=human · 持租约时预览抑制（`human_has_control`）· release holder=agent |
| `pnpm test`                         | 133 通过                                                                                                                          |
| `pnpm test:e2e`                     | 12 通过（fixture 路径不受影响）                                                                                                   |
| typecheck / lint / format / package | 通过                                                                                                                              |

## 资料库字段与错误态（2026-11-04 补充）

部署源码 `~/.hermes/hermes-agent`（`bf0203a794`）的 `/api/files` 行为与本轮修正：

- 目录项字段为 `name / path / is_directory / size / mtime / mime_type`，其中 **`mtime` 是
  epoch 秒**，不是 `modified_at` 毫秒；客户端此前只读 `modified_at`，导致所有文件按 0 排序。
  现优先 `modified_at`，否则用 `mtime × 1000`，保留“按修改时间倒序”。
- 悬空符号链接返回 `broken_link: true`、`size: null`。资料库现在显示「资源已删除」徽标并禁用
  打开，不再展示为 0 B 可点击项。
- 错误映射：`401→session_expired`、`403→unauthorized(httpStatus 403)`、`404→http_error`、
  `413→http_error`；资料库按 已删除 / 无权限 / 过大 / 登录过期 / 未连接 给出专门文案，并提供
  「重试」按钮（`src/renderer/features/inspector/artifactError.ts`）。
- **部署 API 不提供产物到来源消息的关联字段**：`/api/files` 只有文件系统元数据。因此“来源消息”
  目前只能用于 fixture 演示，真实资料库不显示来源；这是部署能力缺口，登记到 `acceptance.md`
  第 6 项，不能用客户端猜测补造。
- 验证：`tests/unit/artifacts-mapping.test.ts`（字段/排序/损坏链接/错误映射）；**真实服务复跑
  通过（2026-11-04 14:37，专用 profile 自动清理）**：
  `chat_artifact_index` 返回 `name=mosbot-probe-artifact.txt · kind=text · bytes=24 ·
mtime=2026-11-04T06:37:52.972Z · broken=false`，`chat_artifact_read` 回显 token，
  附件上传/推理读取同时复验通过；报告 `docs/evidence/tmp/dashboard-chat-2026-11-04T06-39-26-736Z.json`。

## 观看窗口真实验收（2026-11-04 完成）

`scripts/gui-computer-walkthrough.mjs`（打包产物 + 真实 Dashboard + 专用 viewer，不采集远端画面像素）：

| 步骤                                    | 结果                                     |
| --------------------------------------- | ---------------------------------------- |
| 详情栏「电脑」读取真实 `display.status` | ✅ 电脑运行中                            |
| 打开独立观看窗口                        | ✅ 新 BrowserWindow                      |
| noVNC RFB 连接与画面                    | ✅ canvas **1440 × 900**（真实远端画面） |
| 取得控制权（lease）                     | ✅ `你正在控制`，按钮切为「归还控制」    |
| 归还控制                                | ✅ 回到 `仅观看 · 取得控制权`            |
| 关闭窗口                                | ✅ 窗口销毁                              |

本轮修复的两个真实缺陷（此前观看窗口从未真正可用）：

1. noVNC 发送 `Sec-WebSocket-Protocol: binary`，而部署的 RFB bridge 不协商子协议 → 握手 1006。
   改为 `wsProtocols: []` 后连通。
2. viewer 窗口的 `computerAcquire/Release/Reconnect/Close` IPC 被主进程按“仅信任主窗口”拒绝，
   返回 `The viewer is not ready`，控制权永远取不到。现在 viewer 只信任自己的顶层 frame。

证据：`docs/evidence/tmp/computer-gui-2026-11-04T08-38-29-331Z.json`。

### 双 viewer 租约争用（2026-11-04，用户授权测试服务器）

`scripts/gui-computer-dual.mjs`：两个独立打包实例（同一账号、各自 userData）打开同一 profile 的
观看窗口，画面均为 **1440 × 900**：

| 步骤                                     | 结果                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------ |
| A 取得控制                               | ✅ `你正在控制`                                                                |
| B 观察到他人控制                         | ✅ `其他人正在控制这台电脑。`（控制按钮禁用）                                  |
| B 强行 acquire（绕过禁用按钮直接调 IPC） | ✅ 成功：**后来者覆盖租约**，A 被踢下线                                        |
| A 被踢后恢复                             | ✅ RFB close(4000) 触发重新 `display.observe` + 重建，A 回到只读并看到他人控制 |
| B 归还后                                 | ✅ A 回到 `仅观看`                                                             |

**结论：部署（v0.22.5 / `bf0203a794`）仍允许后来者抢占租约，M0c 的“非抢占原子认领”缺口在指定
服务上确认存在**，M4 不能以当前部署关闭。客户端已做到：被抢占后自动重新观察并回到只读、不向
他人租约发送输入。报告：`docs/evidence/tmp/computer-dual-2026-11-04T08-41-37-535Z.json`。

## 网络断开处理（2026-11-04 补充）

- 主窗口新增全局断网提示；观看窗口显示「网络已断开，恢复后会自动重连画面。」并在 `online` 时
  通过 `computer.reconnect` 重新 `display.observe` 取得 ticket、重建 RFB。
- 之前一次观看失败是用户切换网络导致，并非客户端缺陷；上面已用稳定网络完成真实画面验收。

## 未完成 / 下一段

- 资料库来源消息关联与过期/无权限/已删除状态细化（当前按工作区文件索引，来源消息待补）。
- 电脑独立窗口：`display.observe` → 一次性 display ticket → RFB 观看；`display.lease.acquire/release`
  取得/归还控制权；他人控制、断线退回只读、关闭窗口归还租约、双客户端验收。
- 详情栏例行任务概览与真实 `/api/cron/jobs` 数据（当前只读探针已验证接口）。

## 2026-11-04 重启重验租约（强杀场景）

`scripts/gui-stale-lease.mjs`：观看窗口取得控制后 **SIGKILL** 整个应用（不会执行释放），重启并重新
打开同一 Bot 的观看窗口。

| 检查                           | 结果                      |
| ------------------------------ | ------------------------- |
| 崩溃前 viewer 持有控制         | ✅ `你正在控制`           |
| 重启后重新读取租约（非控制态） | ✅ `仅观看`               |
| 取得控制权按钮可用             | ✅ disabled=false         |
| 重新取得控制                   | ✅ `你正在控制`，随后释放 |

结论：该部署在 viewer 进程被强杀后不会留下卡死的“陈旧人类租约”，重启后回到只读并可重新取得控制。
另外本轮补了一处客户端行为：观看窗口打开时直接渲染 `display.observe` 返回的 **lease 快照**，
若确实有另一个人类持有租约，打开即显示「其他人正在控制」，而不是先误报“仅观看”。

报告：`docs/evidence/tmp/stale-lease-2026-11-04T10-45-36-283Z.json`。

仍未验证：真实断网后的画面重连、双 viewer 非抢占（M0c 服务端依赖）。

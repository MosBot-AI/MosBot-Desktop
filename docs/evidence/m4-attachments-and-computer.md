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
- 验证：`tests/unit/artifacts-mapping.test.ts`（字段/排序/损坏链接/错误映射）；真实服务上的
  重新探针待 soak 结束后执行并补充。

## 未完成 / 下一段

- 资料库来源消息关联与过期/无权限/已删除状态细化（当前按工作区文件索引，来源消息待补）。
- 电脑独立窗口：`display.observe` → 一次性 display ticket → RFB 观看；`display.lease.acquire/release`
  取得/归还控制权；他人控制、断线退回只读、关闭窗口归还租约、双客户端验收。
- 详情栏例行任务概览与真实 `/api/cron/jobs` 数据（当前只读探针已验证接口）。

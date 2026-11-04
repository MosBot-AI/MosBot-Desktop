# M4 · 附件与电脑（第一块）· 证据

- 卡片：M4（附件收发、电脑状态/预览/唤醒；产物索引与观看/接管窗口待下一段）
- 状态：**附件上传与真实推理读取已打通；电脑状态、预览与显式唤醒入口已接入**；
  产物索引/保存/打开、独立观看窗口与租约接管待下一段
- 记录时间：2026-11-04
- 目标服务：`192.168.2.171:9119`（v0.22.5 / `bf0203a794`）

## 附件

- 输入条回形针在连接且已打开 Bot Chat 时可用：系统文件选择器（主进程）→ 读取（10 MB 上限）→
  base64 data URL → WS `file.attach {session_id, name, data_url}` → 返回 `@file:` 引用；
- 引用以 chip 形式显示在输入条上方，可移除；发送时把引用与正文一起 `prompt.submit`；
- 失败（超限/读取失败/服务端拒绝）提示且不发送；取消选择静默。
- 真实验证（专用 profile，自动清理）：上传 `mosbot-probe-attachment.txt` 得到引用 → 提示模型读取附件
  → 回复中回显文件内的随机 token（`chat_attach_read` 通过）。

## 电脑

- 详情栏「电脑」页在连接模式读取真实 `display.status`（每 5 s 轮询），显示运行/休眠、几何、阻塞原因；
- 运行时读取 `display.thumbnail` 显示 16:10 预览；服务端 `suppressed`（他人持有租约）时隐藏画面并提示，
  不显示旧帧；
- 休眠时提供显式「唤醒」按钮（`display.start`），完成后 1.5 s 重读权威状态；阻塞时禁用并显示原因；
- 独立观看/控制窗口（RFB/noVNC + `display.observe` 一次性 ticket + 租约 acquire/release）尚未接入，
  界面明确标注下一段。

## 验证

| 检查                                | 结果                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------- |
| 真实附件探针（专用 profile）        | ✅ 上传 staged、模型回显附件 token、profile 清理                           |
| 真实 `display.status`               | ✅ supported/installed/running/lease 等字段可读                            |
| 真实 `display.thumbnail`            | ✅ 读取成功；电脑休眠时 `data_url=null`、无帧、无 suppressed（不伪造画面） |
| `pnpm test`                         | 133 通过                                                                   |
| `pnpm test:e2e`                     | 12 通过（fixture 路径不受影响）                                            |
| typecheck / lint / format / package | 通过                                                                       |

## 未完成 / 下一段

- 资料库：按消息游标索引 Bot 附件/产物（文件名、类型、大小、来源消息），图片/文本预览、保存后外部打开、
  过期/无权限/已删除状态；真实产物端到端验证。
- 电脑独立窗口：`display.observe` → 一次性 display ticket → RFB 观看；`display.lease.acquire/release`
  取得/归还控制权；他人控制、断线退回只读、关闭窗口归还租约、双客户端验收。
- 详情栏例行任务概览与真实 `/api/cron/jobs` 数据（当前只读探针已验证接口）。

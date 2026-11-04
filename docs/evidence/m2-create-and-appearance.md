# M2 · 新建与外观（后端纵切）· 证据

- 卡片：M2（真实新建、外观 CAS、改名、模型就绪回读、创建后的选择与配置引导）
- 状态：**新建 / 外观 / 改名 / 就绪回读已实现并在真实服务验证；创建弹层的真实提交与模型引导已接入**
- 记录时间：2026-11-04
- 目标服务：`192.168.2.171:9119`（v0.22.5 / `bf0203a794`），写入仅针对本轮
  `mosbot-m2-probe-<时间戳>` 专用 profile，结束删除

## 实现

- 新建：WS `profiles.create`（`no_skills`、`no_alias`、`mirror_credentials:false`，fresh 不继承凭据）；
  随后 `profiles.configure` 写 `ui_meta['hermes-bots']`（`title/shape/color/custom`）并带
  `ui_meta_expected_revisions` CAS。
- 回读：REST `/api/profiles` **不含 ui_meta**，因此 roster 回读走 WS `profiles.list`；configure 响应里的
  revision 与输入外观会合并进返回行，规避 roster 读缓存滞后。
- 冲突：CAS revision 过期时返回 `conflict`（可重试），弹层提示「这个 Bot 的外观已在别处修改」。
- 改名：REST `PATCH /api/profiles/{name}` `{new_name}`（服务端先停网关再改目录）。
- 就绪：REST `/api/model/info?profile=` → `provider/model` 非空即 ready；配置页地址为
  `${dashboard}/profiles`，由主进程校验后 `shell.openExternal`。
- 渲染层：
  - 创建弹层在连接模式调用真实后端：创建中禁用提交、重名映射为「已存在」、其他失败保留输入；
  - 成功后 upsert 新 Bot 并选中；未就绪时聊天内显示「完成配置 / 重新检查」，发送禁用；
  - 窗口重新获得焦点时自动复查模型就绪；
  - 远端名单读取 `ui_meta['hermes-bots']` 的 title/shape/color 与 revision，真实外观直接上屏。

## 验证

| 检查                                | 结果                                                                       |
| ----------------------------------- | -------------------------------------------------------------------------- |
| 真实新建 + 外观                     | ✅ `shape=circle`、`color=#4f86d6`、`revision=1`、`appearanceApplied=true` |
| 外观 CAS 写入与回读                 | ✅ 写入 `pill`/`#e05c5c` → revision=2，WS 回读一致                         |
| 过期 revision                       | ✅ 返回 `conflict`（actual revision=2）                                    |
| 模型就绪回读                        | ✅ `ready=true`（provider `openai-codex`，model `gpt-6-luna-900k`）        |
| 改名                                | ✅ `…-r` 后 WS roster 可找到                                               |
| 清理                                | ✅ 删除成功、leftovers=0                                                   |
| `pnpm test`                         | **131 个用例通过**                                                         |
| `pnpm test:e2e`                     | 11 个用例通过（fixture 路径不受影响）                                      |
| typecheck / lint / format / package | 通过                                                                       |

## 未完成 / 限制

- 该部署新建 profile 会继承模型路由，`modelReady` 实测为 true；「未配置模型」引导路径只有 store/单测覆盖，
  未在真实服务观察到 not-ready。
- 外观编辑（已有 Bot 改形状/颜色）、改名、分区/置顶/搜索的真实整理 UI 仍待 M2 后续。
- 创建后的 roster 读缓存可能滞后；当前用 upsert 立即选中，后台刷新在下一轮 roster tick 对齐。

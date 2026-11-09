# MosBot Desktop · 交付说明（当前候选）

[English](delivery-summary.md)

- 更新：2026-11-09 · 最新实现提交：`f2b86d6`
- 方案依据：`docs/plans/README-zh.md`、`01-bot-experience-zh.md`、`02-dashboard-integration-zh.md`、
  `03-agent-handoff-zh.md`
- 结论：**代码与自动化验收已收敛；首版仍被 3 项外部/用户动作阻塞**（见文末）。

## 一、当前状态

| 项目                      | 状态                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------- |
| 单元测试                  | 173 passed                                                                               |
| E2E（隐藏窗口、打包产物） | 21 passed                                                                                |
| typecheck / lint / format | 全绿                                                                                     |
| 完整 10 分钟隐藏性能门槛  | 通过：steady p95 32.2ms、burst 30.2ms、send/switch 反馈 17.3ms、10k 历史 27.8ms          |
| 60 分钟 soak              | 通过（`m5-soak-zh.md`）                                                                  |
| 真实服务联调              | 审批/回执、双客户端、未打开 Bot 通知、窗口生命周期、电脑画面/控制、工作台写入、附件/产物 |
| 签名                      | ad-hoc 完整签名；Developer ID/公证按用户决定未做（无证书）                               |
| 干净安装                  | 2026-11-09 ZIP 本机 + 全新 userData 通过；第二台 Mac 未做                                |
| 通知横幅/点击             | 2026-11-09 抓取真实横幅；点击导航已修复并有回归覆盖（#10 已关闭）                        |

## 二、实现范围（对应计划切片）

- M0a 视觉切片、M0b 真实探针/能力矩阵、M0c 参考补丁（**未部署**）。
- M1：真实登录/静默恢复、Bot 名单与历史、聊天流式/工具/停止/终态、跨客户端聊天与审批、未打开 Bot
  通知直达、关窗/Dock 重开/退出重启、断线重连/回放、强退不重发。
- M2：创建/外观 CAS/模型就绪/整理（置顶/分区/搜索切换，含 remote 选中修复）。
- M3：工作台三页真实读写、跨客户端 Kanban 刷新、旧响应隔离（board/profile/搜索）。
- M4：附件与产物、电脑唤醒/预览/观看 RFB、控制权取得/归还、被踢恢复、断网提示、重启租约重验。
- M5：性能/soak/键盘/IME/缩放/降动态/可访问性、安装与升级迁移、Apple Development 签名。

## 三、测试模式

- 所有 E2E 与 `scripts/gui-*.mjs` 默认 `MOSBOT_TEST_BACKGROUND=1`：窗口隐藏、不可聚焦、无 Dock
  图标，不打扰用户；需要人观看时才用 `MOSBOT_TEST_FOREGROUND=1`。
- 测试专用对象均带 `mosbot-probe-*` 标识，由 probe 清理；真实用户数据只读或仅写专用对象。

## 四、复验入口

```bash
pnpm typecheck && pnpm test && pnpm test:e2e
pnpm bench:stream
BENCH_SOAK_SECONDS=3600 pnpm bench:soak
MOSBOT_DASHBOARD_URL=http://192.168.2.171:9119 MOSBOT_PROBE_MODE=chat pnpm test:integration
# 真实 GUI：见 docs/evidence/acceptance-zh.md 第四节
```

## 五、首版前剩余项（详见 `final-checklist-zh.md`）

1. **第二台 Mac / 新用户干净安装**：本机干净安装检查通过；真实第二台设备验收仍未完成。
2. **连续 7 天日用**：由用户自行使用，记录维护在 `dogfood-log-zh.md`。
3. **服务端缺口**：`/api/files` 来源字段（#15）、插件禁用状态（#17）、未配置模型环境（#16）需要范围决定或服务端实施。电脑租约补丁（#14）已移出首版范围。

2026-11-09 已解决：真实 macOS 通知横幅已抓取，通知点击导航 bug 已修复（Issue #10）；M0a 视觉基线已确认；内部签名决定已记录；租约已移出首版范围。

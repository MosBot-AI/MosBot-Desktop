# M6 · 群聊与语音能力探测

[English](m6-capability-probe.md)

- 卡片：M6（群头像/群聊、录音转写）
- 状态：**目标部署群聊已可运行（hosted-room driver 运行中，可列出 2 个房间）；该无头部署的语音唤醒不可用。实现尚未开始。**
- 记录时间：2026-11-09
- 目标服务：`192.168.2.171:9119`（v0.22.5 / `bf0203a794`）
- 设计草案：[`m6-group-chat-design-zh.md`](m6-group-chat-design-zh.md)
- 命令：`MOSBOT_DASHBOARD_URL=http://192.168.2.171:9119 MOSBOT_PROBE_MODE=ws npm run test:integration`
- 数据性质：真实 Dashboard WebSocket，只读 RPC（`groups.capabilities`、`groups.list`、`wake.status`）；没有状态变更调用
- 报告（工作区忽略数据）：`docs/evidence/tmp/dashboard-probe-2026-11-09T16-14-52-900Z.json`

## 结果

| 能力                       | 状态 | 详情                                                    |
| -------------------------- | ---- | ------------------------------------------------------- |
| 群聊 `groups.capabilities` | ✅   | `driver=true` · `methods=18` · `room_link_enabled=true` |
| 语音唤醒 `wake.status`     | ⛔   | `available=false` · `enabled=false` · `listening=false` |
| 既有 `client.capabilities` | ✅   | `server_requests=16`（approval/clarify 契约不变）       |

## 结论

- **目标部署群聊已可运行**：hosted-room driver 正在运行，gateway 公布 18 个 `groups.*` 方法与 room link，`groups.list` 返回 2 个已有房间。M6 群聊工作可以排期；实现前仍需按录屏确定入口层级。
- **该无头部署的语音唤醒不可用**（`available=false`），因此无法在这里证明唤醒词/录音验收。`voice.record`/`voice.tts` 会改变状态且需要音频输入，本次未调用；录音转写仍未验证。
- M6 尚未开始实现；本次探测只建立能力基线。

## 下一步

1. 决定群聊是否进入首版或按计划留在 M6 后续；当前计划将 M6 放在首版之后。
2. 按参考录屏设计群聊入口层级，再基于公布的 18 个 `groups.*` 方法实现。
3. 语音需要具备音频输入与唤醒能力的部署/设备后再验收；否则保持范围外。

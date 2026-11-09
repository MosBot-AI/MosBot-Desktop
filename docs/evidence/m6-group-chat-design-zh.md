# M6 · 群聊设计草案

[English](m6-group-chat-design.md)

- 状态：**草案，范围未批准，尚未开始实现**
- 关联：[能力探测](m6-capability-probe-zh.md)、[界面规格](../plans/01-bot-experience-zh.md)
- 记录时间：2026-11-09

## 一、为什么有这份草案

目标部署已经暴露 hosted-room 协议（`groups.capabilities` 通过、18 个方法、`groups.list` 返回 2 个房间）。参考录屏把群聊与单 Bot 放在同一视觉层级，因此 M6 下一步要决定入口层级与首个纵切。本草案记录选项与 API 映射；**不改变首版范围**。

## 二、入口层级（来自录屏）

- 左栏顶部：三列大头像；单 Bot 与群聊共享这一层级。
- 下方：分区列表（头像、名称、一行摘要）；折叠分区保留当前聊天。
- 群聊是独立会话，不是 Bot Chat。选择群聊不得覆盖 Bot 草稿、选中 Bot 或聊天滚动状态。
- 创建群聊放在与创建 Bot 相同的“+”入口；创建弹层需要群聊页签或单独一步。
- 群聊自己的名牌与成员列表沿用现有右栏模式；成员管理不属于首个纵切。

## 三、数据与 API 映射

| 需求           | API（部署）                                                                                    | 说明                                |
| -------------- | ---------------------------------------------------------------------------------------------- | ----------------------------------- |
| 能力检查       | `groups.capabilities`                                                                          | 18 个方法，room link 已启用         |
| 群列表         | `groups.list`                                                                                  | 当前 2 个房间；支持 offset/limit    |
| 创建/改名/解散 | `groups.create`、`groups.rename`、`groups.disband`                                             | 写路径；需要专用测试对象            |
| 打开群状态     | `groups.state`                                                                                 | 选中群的只读状态                    |
| 历史           | `groups.log`                                                                                   | 单调日志；分页上限来自 capabilities |
| 发送/停止/继续 | `groups.send`、`groups.stop`、`groups.continue`                                                | send 幂等；需要请求身份             |
| 审批           | `groups.approve`、`groups.retry`                                                               | 群审批与 Bot Chat 审批分开          |
| 附件           | `groups.attachment.upload/download`                                                            | 复用现有文件预览/保存 UI            |
| peer/权威      | `groups.peer.*`、`groups.replicate`、`groups.replica_state`、`groups.promote`、`groups.demote` | 不在首个纵切                        |
| 上下文         | `groups.context`                                                                               | 群的只读上下文                      |

## 四、建议的纵切顺序

1. **只读名单**：拉取 `groups.list`，在置顶网格与分区列表渲染群头像；选中群打开只读状态/日志。不发消息、不调用写 API。
2. **打开与滚动历史**：`groups.state` + `groups.log` 分页与重连；验证旧响应不会重绘到另一个群。
3. **发送与接收**：`groups.send` 带请求身份、流式/事件、停止/继续、错误与离线态。
4. **审批与附件**：`groups.approve`/`groups.retry`、`groups.attachment.*`；复用现有审批卡与文件预览模式。
5. **创建与管理**：`groups.create`/`rename`/`disband`，使用专用测试对象并清理。
6. **语音**：独立线；该部署 `wake.status` 不可用，录音/转写需要具备音频输入与唤醒能力的设备/部署后再验收。

## 五、待决策

- 群聊进首版还是按计划留在 M6 后续？当前计划将 M6 放在首版之后。
- 群头像来源（按群名生成，还是服务端提供资产）？
- 群审批是否与 Bot 审批一样通知，是否复用同一角标？
- 该账号/角色允许哪些群方法？能力探测是只读的；写路径需要专用对象。
- 群聊如何与现有 Bot 草稿/滚动持久化、通知点击路径交互？

## 六、首个纵切的非目标

- 不做成员邀请/peer 管理、复制或权威接管。
- 在有能力的部署/设备前不做语音录音/转写。
- 未经用户明确决定，不改变首版范围。

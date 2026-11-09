# M6 · Group Chat Design Draft

[简体中文](m6-group-chat-design-zh.md)

- Status: **draft proposal; scope not approved and no implementation has started**
- Related: [capability probe](m6-capability-probe.md), [interface spec](../plans/01-bot-experience.md)
- Recorded: 2026-11-09

## 1. Why this draft exists

The target deployment already exposes the hosted-room protocol (`groups.capabilities` passes, 18 methods, `groups.list` returns 2 rooms).
The reference recording shows group chats at the same visual level as single Bots, so the next M6 decision is the entry hierarchy and
the first vertical slice. This draft records the options and the API mapping; it does **not** change the first-release scope.

## 2. Entry hierarchy (from the recording)

- Left column top: three columns of large avatars; single Bots and group chats share that level.
- Below: section list (avatar, name, one-line summary); collapsing a section keeps the current chat.
- A group chat is an independent conversation, not a Bot Chat. Selecting a group must not overwrite the Bot draft, selected Bot or
  chat scroll state.
- Group creation lives in the same "+" entry as Bot creation; the create sheet needs a group tab or a separate group step.
- The group's own header/nameplate and member list use the existing details-column pattern; member management is not part of the first
  slice.

## 3. Data and API mapping

| Need                   | API (deployment)                                                                               | Notes                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Capability check       | `groups.capabilities`                                                                          | 18 methods, room link enabled                        |
| Group list             | `groups.list`                                                                                  | 2 rooms currently; offset/limit supported            |
| Create/rename/disband  | `groups.create`, `groups.rename`, `groups.disband`                                             | write paths; need dedicated test objects             |
| Open group state       | `groups.state`                                                                                 | read-only state for the selected group               |
| History                | `groups.log`                                                                                   | monotonic log; pagination limit from capabilities    |
| Send / stop / continue | `groups.send`, `groups.stop`, `groups.continue`                                                | send is idempotent; needs request identity           |
| Approvals              | `groups.approve`, `groups.retry`                                                               | group approvals are separate from Bot Chat approvals |
| Attachments            | `groups.attachment.upload/download`                                                            | reuse the existing file preview/save UI              |
| Peers / authority      | `groups.peer.*`, `groups.replicate`, `groups.replica_state`, `groups.promote`, `groups.demote` | out of the first slice                               |
| Context                | `groups.context`                                                                               | read-only context for the group                      |

## 4. Suggested vertical slices

1. **Read-only roster**: fetch `groups.list`, render group avatars in the pinned grid and section list; selecting a group opens a
   read-only state/log view. No sending, no write APIs.
2. **Open and scroll history**: `groups.state` + `groups.log` with pagination and reconnect; verify stale responses do not repaint a
   different group.
3. **Send and receive**: `groups.send` with request identity, streaming/event handling, stop/continue, error and offline states.
4. **Approvals and attachments**: `groups.approve`/`groups.retry`, `groups.attachment.*`; reuse the existing approval card and file
   preview patterns.
5. **Creation and management**: `groups.create`/`rename`/`disband` with dedicated test objects and cleanup.
6. **Voice**: separate track; `wake.status` is unavailable on this deployment, so recording/transcription needs a device/deployment
   with audio input and wake support before acceptance.

## 5. Open decisions

- Is group chat in the first release or the M6 follow-up? The plan currently keeps M6 post-release.
- Where do group avatars come from (generated from the group name, or a server-provided asset)?
- Do group approvals notify the same way as Bot approvals, and should they reuse the same badge?
- Which group methods are allowed for this account/role? The capability probe is read-only; write paths need dedicated objects.
- How should group chat interact with the current Bot draft/scroll persistence and the notification click path?

## 6. Non-goals for the first slice

- No member invitation/peer management, replication or authority takeover.
- No voice recording/transcription until a capable deployment/device is available.
- No change to first-release scope without the user's explicit decision.

# M6 · Read-only Group Roster · Evidence

[简体中文](m6-group-roster-zh.md)

- Card: M6 (group chat in first-release scope since 2026-11-10)
- Status: **read-only group roster landed and verified against the real service; group state/log and messaging are next**
- Recorded: 2026-11-10
- Target service: `192.168.2.171:9119` (v0.22.5 / `bf0203a794`)

## Implementation

- `RemoteGroup` shared type, validated `groups.list` schema, `ChatManager.listGroups()` and the
  `chatListGroups()` bridge/preload/IPC method.
- Renderer stores the read-only room list in `remote.groups` and fetches it once a Bot Chat connection is live.
- Sidebar renders a "Groups" section with one row per room (face, name, member count).
- Clicking a group currently shows a one-line notice that the read-only group view arrives in the next slice;
  it does not send or open group messages.

## Verification

- Command: `node scripts/gui-groups-roster.mjs` (real Dashboard, dedicated probe userData).
- Result: 2 hosted rooms rendered with matching member counts:
  - `Group Chat` · 4 members
  - `Mosbot Ui 041400、devbot` · 2 members
- `vitest` 176 passed; typecheck/lint/format green.
- Report (ignored working data): `docs/evidence/tmp/groups-roster-*.json`.

## Next

1. `groups.state` + `groups.log` bridge and a read-only group view.
2. Send/receive and stop/continue.
3. Group approvals and attachments.
4. Voice recording/transcription stays separate until a capable deployment/device is available.

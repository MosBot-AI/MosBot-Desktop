# M6 · Read-only Group Roster · Evidence

[简体中文](m6-group-roster-zh.md)

- Card: M6 (group chat in first-release scope since 2026-11-10)
- Status: **read-only roster, state/log view, composer and dedicated-group send/disband are verified against the real service; live log polling and stop/continue are next**
- Recorded: 2026-11-10
- Target service: `192.168.2.171:9119` (v0.22.5 / `bf0203a794`)

## Implementation

- `RemoteGroup` shared type, validated `groups.list` schema, `ChatManager.listGroups()` and the
  `chatListGroups()` bridge/preload/IPC method.
- Renderer stores the read-only room list in `remote.groups` and fetches it once a Bot Chat connection is live.
- Sidebar renders a "Groups" section with one row per room (face, name, member count).
- Clicking a group opens a view with room metadata (member count, latest seq, driver status), the latest 50 log events (message text where present) and a composer. The composer is wired to `groups.send` with a derived `thread_id` and a client event id; sending to a real room has not been exercised to avoid writing user data.

## Verification

- Command: `node scripts/gui-groups-roster.mjs` (real Dashboard, dedicated probe userData).
- Result: 2 hosted rooms rendered with matching member counts:
  - `Group Chat` · 4 members
  - `Mosbot Ui 041400、devbot` · 2 members
- Clicking the first room rendered the view: heading `Group Chat`, 50 log events, latest seq 86, driver `running`, composer and send button present.
- Dedicated-group verification: `node scripts/gui-group-send.mjs` created a temporary hosted room from two local profiles, sent one message, found it in the room log and disbanded the room.
- `vitest` 176 passed; typecheck/lint/format green.
- Report (ignored working data): `docs/evidence/tmp/groups-roster-*.json`.

## Next

1. Live log polling while the group view is open.
2. Group stop/continue and error/reconnect states.
3. Group approvals and attachments.
4. Voice recording/transcription stays separate until a capable deployment/device is available.

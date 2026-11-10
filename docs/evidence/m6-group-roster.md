# M6 · Read-only Group Roster · Evidence

[简体中文](m6-group-roster-zh.md)

- Card: M6 (group chat in first-release scope since 2026-11-10)
- Status: **read-only roster, state/log view, composer, dedicated-group send/disband and 3 s log polling are implemented; stop/continue and a real polling observation are next**
- Recorded: 2026-11-10
- Target service: `192.168.2.171:9119` (v0.22.5 / `bf0203a794`)

## Implementation

- `RemoteGroup` shared type, validated `groups.list` schema, `ChatManager.listGroups()` and the
  `chatListGroups()` bridge/preload/IPC method.
- Renderer stores the read-only room list in `remote.groups` and fetches it once a Bot Chat connection is live.
- Sidebar renders a "Groups" section with one row per room (face, name, member count).
- Clicking a group opens a view with room metadata (member count, latest seq, driver status), the latest 50 log events (message text where present) and a composer. The composer is wired to `groups.send` with a derived `thread_id` and a client event id.
- While the group view is open, the renderer polls `groups.log` every 3 s from the last seen seq, de-duplicates by seq, updates the latest sequence and auto-scrolls; reducer coverage is in `tests/unit/store.test.ts`.

## Verification

- Command: `node scripts/gui-groups-roster.mjs` (real Dashboard, dedicated probe userData).
- Result: 2 hosted rooms rendered with matching member counts:
  - `Group Chat` · 4 members
  - `Mosbot Ui 041400、devbot` · 2 members
- Clicking the first room rendered the view: heading `Group Chat`, 50 log events, latest seq 86, driver `running`, composer and send button present.
- Dedicated-group verification: `node scripts/gui-group-send.mjs` created a temporary hosted room from two local profiles, sent one message, found it in the room log and disbanded the room.
- The polling path is not yet observed end-to-end because the verification script sends outside the group view; it is covered by the reducer unit test and will be exercised when the group creation UI lands.
- `vitest` 176 passed; typecheck/lint/format green.
- Report (ignored working data): `docs/evidence/tmp/groups-roster-*.json`.

## Next

1. Group creation UI so the dedicated test group can be opened in the group view; observe polling end-to-end.
2. Group stop/continue and error/reconnect states.
3. Group approvals and attachments.
4. Voice recording/transcription stays separate until a capable deployment/device is available.

# M6 · Read-only Group Roster · Evidence

[简体中文](m6-group-roster-zh.md)

- Card: M6 (group chat in first-release scope since 2026-11-10)
- Status: **read-only roster, state/log view with member chips and Markdown messages, create dialog, composer, send, 3 s log/state polling, stop, error surfacing and simulated socket-drop recovery are verified against the real service; approvals are next, attachments are unavailable on this deployment**
- Recorded: 2026-11-10
- Target service: `192.168.2.171:9119` (v0.22.5 / `bf0203a794`)

## Implementation

- `RemoteGroup` shared type, validated `groups.list` schema, `ChatManager.listGroups()` and the
  `chatListGroups()` bridge/preload/IPC method.
- Renderer stores the read-only room list in `remote.groups` and fetches it once a Bot Chat connection is live.
- Sidebar renders a "Groups" section with one row per room (face, name, member count).
- Clicking a group opens a view with room metadata (member count, member chips, latest seq, driver status), the latest 50 log events (message text rendered as Markdown where present) and a composer. The composer is wired to `groups.send` with a derived `thread_id` and a client event id.
- The sidebar Groups section has a create button and a small create dialog (name + 2–6 local profiles); on success the roster refreshes and the new room opens.
- While the group view is open, the renderer polls `groups.log` and `groups.state` every 3 s from the last seen seq, de-duplicates by seq, updates the latest sequence, refreshes working/blocked driver state, auto-scrolls and surfaces poll errors (a later successful poll clears them); reducer coverage is in `tests/unit/store.test.ts`.

## Verification

- Command: `node scripts/gui-groups-roster.mjs` (real Dashboard, dedicated probe userData).
- Result: 2 hosted rooms rendered with matching member counts:
  - `Group Chat` · 4 members
  - `Mosbot Ui 041400、devbot` · 2 members
- Clicking the first room rendered the view: heading `Group Chat`, 50 log events, latest seq 86, driver `running`, composer and send button present.
- Dedicated-group verification: `node scripts/gui-group-send.mjs` created a temporary hosted room from two local profiles, sent one message, found it in the room log and disbanded the room.
- The deployment advertises 18 `groups.*` methods and does not include `groups.attachment.*`; group attachments are therefore a deployment capability gap, not a client gap.
- End-to-end UI verification: `node scripts/gui-group-create-send.mjs` created a group from the dialog, sent a message from the composer, saw it rendered by the 3 s poll, clicked Stop (`stopped=true`) and disbanded the room (`created=true`, `sent=true`, `rendered=true`, `disbanded=true`).
- Reconnect verification: `node scripts/gui-group-reconnect.mjs` dropped the gateway socket while a group view was open; the room stayed selected, detail/log recovered and the poll error cleared (`recovered=true`). The reconnecting state was too fast to observe (`sawReconnect=false`), so this is a simulated socket drop, not a real network outage.
- `vitest` 176 passed; typecheck/lint/format green.
- Report (ignored working data): `docs/evidence/tmp/groups-roster-*.json`.

## Deployment capability limits

- `groups.attachment.*` is not advertised by the deployment (18 `groups.*` methods); group attachments are blocked on the server side.
- `groups.approve` / `groups.retry` exist, but no group approval request has been observed in the room log/tasks, so the approval UI cannot be wired or verified yet.
- Voice recording/transcription remains unavailable on the headless deployment (`wake.status available=false`).
- Tracked in Issue #20.

## Next

1. Group approvals.
2. Error/reconnect hardening with a real network drop.
3. Attachments need a deployment that advertises `groups.attachment.*`; approvals need a reproducible group task that requests approval; voice recording/transcription stays separate until a capable deployment/device is available.

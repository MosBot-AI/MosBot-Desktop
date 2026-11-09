# M3 · Hermes Workbench (shell + three read-only sub-pages) · Evidence

[简体中文](m3-workbench-zh.md)

- Card: M3 (Profiles overview/detail, Sessions paging/search/history, Kanban board snapshot, restore on returning to chat)
- Status: **Workbench shell, three sub-pages, Kanban task creation/status change with a real-time WS cursor, and model configuration writes are all wired in and verified**
- Recorded: 2026-11-04
- Target service: `192.168.2.171:9119` (v0.22.5 / `bf0203a794`), read-only

## Implementation

- **Entry and shell**: the bottom-left menu "Hermes Workbench" opens a `/hermes` surface covering the whole window; the
  top bar has "Back to Bots", three sub-pages (Profiles / Sessions / Kanban) and the current Dashboard address. The chat
  shell stays mounted (hidden), and on return the Bot, draft, scroll position and inspector are preserved as-is.
- **Profiles**: real `profiles.list` (WS, via `listBots`) list + local filtering; the detail shows display name, summary,
  model/provider, canonical Bot Chat and whether it is the default; selecting a Bot reads `/api/model/info` to show
  readiness, and "Open configuration page" reuses M2's configuration entry.
- **Sessions**: `GET /api/sessions?profile&order=recent&limit&offset` paging (load more),
  `GET /api/sessions/search?q&profile` search, `GET /api/sessions/{id}/messages` read-only history (earlier paging);
  the profile can be switched, the canonical Bot Chat is labeled; a dedicated empty state is shown when not connected.
- **Kanban**: `GET /api/plugins/kanban/boards` board list + `GET /api/plugins/kanban/board?board=` column/task snapshot
  (shows `latest_event_id`); supports creating tasks (`POST /tasks`) and changing status (`PATCH /tasks/{id}`), and
  re-reads the snapshot after writing; a dedicated empty state is shown when the plugin is unavailable or there is no
  board, without affecting the other sub-pages.
- **Model configuration writes**: the Profiles detail can edit provider/model; after `PUT /api/profiles/{name}/model` it
  re-reads `/api/model/info` and the roster and shows the readiness state; on failure the input is kept and an error is shown.
- **Kanban real-time events**: the main process opens a dedicated WS `/api/plugins/kanban/events?board&since&ticket` per
  board; the ticket is re-signed on every reconnect (30 s), the cursor starts from `latest_event_id`, disconnects back off
  2/4/8/15 s and resume with the old cursor; switching the board closes the old watcher (old frames never write into the new
  board); the renderer debounces 300 ms and re-reads the snapshot after an event, and if the snapshot `latest_event_id` is
  smaller than the local cursor (reset/recovery) it re-subscribes with the new cursor.
- The main process adds a `workbench.ts` normalization layer (sessions/messages/boards), exposed to the renderer via IPC;
  all parameters are boundary-validated.

## Verification

| Check                                                   | Result                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real workbench probe `MOSBOT_PROBE_MODE=workbench`      | ✅ Profile list/active, model read (openai-codex / gpt-6-luna-900k), Sessions paging (returned=5 · total=1791 · offsets non-overlapping overlap=0), search (results=5), history message paging, Kanban boards (1 board, 7 tasks), board snapshot and `latest_event_id` |
| Real Kanban write probe (dedicated board, auto-cleanup) | ✅ create board → create task (id, status=ready) → detail read-back → status written as `done` → cursor 0→2 → delete board, remaining_board=false                                                                                                                      |
| Real model configuration write (dedicated profile)      | ✅ after `PUT /api/profiles/{name}/model`, read back `provider=openai-codex · model=gpt-6-luna-900k · ready=true`                                                                                                                                                      |
| `pnpm test`                                             | **133 cases passed**                                                                                                                                                                                                                                                   |
| `pnpm test:e2e`                                         | **12 cases passed**, new "open workbench → back to Bots → draft still there"                                                                                                                                                                                           |
| typecheck / lint / format / package                     | passed                                                                                                                                                                                                                                                                 |
| Screenshot                                              | `docs/evidence/screens/m0a/13-workbench.png` (disconnected empty state)                                                                                                                                                                                                |

## Incomplete / next slice

- Real-window screenshot and user acceptance of the connected workbench (requires logging in and actually operating it).
- Fixed: during verification, a duplicate registration of the `probeWorkbench` IPC handler caused startup failure; the
  duplicate was removed and re-verified.

## 2026-11-04 Cross-client Kanban refresh (dedicated board)

`scripts/gui-workbench-refresh.mjs` (hidden window, two clients, same account): the probe creates and **keeps** a dedicated
board (`MOSBOT_PROBE_KEEP_BOARD=1`, only touching `mosbot-probe-board-*`); client A opens the workbench and selects that
board, client B creates a task via `kanbanCreateTask`, and A sees the task after clicking "Refresh". Afterwards a normal
probe is run again: on startup it deletes leftover probe boards and creates/deletes its own.

| Check                                            | Result                    |
| ------------------------------------------------ | ------------------------- |
| Dedicated board created and kept                 | ✅ `mosbot-probe-board-*` |
| A opens the workbench and selects that board     | ✅                        |
| B creates a task                                 | ✅ `t_… ready`            |
| **A sees the other client's task after refresh** | ✅ `另一客户端任务-…`     |

Report: `docs/evidence/tmp/workbench-refresh-2026-11-04T11-19-10-251Z.json`.

Still unverified: real-deployment evidence of the plugin-disabled state; real dual-client isolation of late responses
after switching board/profile.

## 2026-11-04 Stale-response isolation when switching boards (injected delay)

`scripts/gui-workbench-stale.mjs`: create two dedicated probe boards and inject a 2.5 s delay into board A; A first selects
the slow board and then immediately switches to the fast board. The late old response must not overwrite the current board.

| Check                                                                          | Result |
| ------------------------------------------------------------------------------ | ------ |
| Two dedicated boards created                                                   | ✅     |
| Another client creates a task on the slow board                                | ✅     |
| Old response discarded after switching (task on the slow board is not visible) | ✅     |
| Current fast board stays selected                                              | ✅     |
| Switching back to the slow board shows the task                                | ✅     |

Report: `docs/evidence/tmp/workbench-stale-2026-11-04T11-53-07-488Z.json`.

**Fix**: `loadBoard` previously called `setSnapshot` unconditionally, so a late old-board response could overwrite the
current board. Now, after the response returns, it first checks `slug === currentBoard.current` and drops anything that is
not the current board; switching boards also updates `currentBoard.current` synchronously, eliminating the race before the
effect update. The delay is only a test seam (`MOSBOT_TEST_KANBAN_SLOW_BOARD`) and has no effect on normal startup.

Still unverified: stale-response isolation after switching profile/account; deployment evidence for the plugin-disabled state.

## 2026-11-04 Stale sessions-response isolation when switching profiles (injected delay)

`scripts/gui-sessions-stale.mjs`: inject a 2.5 s delay into a dedicated empty profile; first select it (slow), then
immediately switch to a Bot that already has sessions (fast). The late empty list must not overwrite the fast profile's
session list.

| Check                                                                | Result         |
| -------------------------------------------------------------------- | -------------- |
| Fast profile baseline has visible sessions                           | ✅ 50 sessions |
| Old sessions response dropped after switching (list still non-empty) | ✅ 50 sessions |
| Fast profile stays selected                                          | ✅             |
| Switching back to the empty profile shows "No sessions yet"          | ✅             |

Report: `docs/evidence/tmp/sessions-stale-2026-11-04T12-09-15-586Z.json`.

**Fix**: `SessionsPage`'s `load` / search / open session / load more messages all gained a guard for "whether the requested
profile / query / session is still the current value"; stale responses are dropped directly, and refs update synchronously
on profile switch. The delay is only a test seam (`MOSBOT_TEST_SESSIONS_SLOW_PROFILE`).

Still unverified: the same kind of guard for search input and the message panel has not been separately reproduced with a
real delay; plugin-disabled state.

## 2026-11-04 Stale-response isolation when switching search input (injected delay)

`scripts/gui-search-stale.mjs`: first enter a slow query with no results (injecting a 2.5 s delay), then immediately change
it to a query that hits; the late empty result must not clear the new results.

| Check                                                               | Result |
| ------------------------------------------------------------------- | ------ |
| Session list and searchable titles available                        | ✅     |
| Late result of the old query dropped (new result still has 30 rows) | ✅     |
| Input box still holds the current query                             | ✅     |

Report: `docs/evidence/tmp/search-stale-2026-11-04T12-15-56-630Z.json`.

The delay is only a test seam (`MOSBOT_TEST_SEARCH_SLOW_QUERY`). The same guard has been added for the message panel
(opening a session / loading more), but has not been separately reproduced with a delay.

## 2026-11-04 Stale-response isolation when switching sessions in the message panel (injected delay)

`scripts/gui-messages-stale.mjs`: using two real sessions of the default profile (read-only), inject a 2.5 s delay into the
message endpoint of the first session; open it first, then immediately open the second session, and the old messages must
not overwrite the new transcript.

| Check                                                       | Result |
| ----------------------------------------------------------- | ------ |
| Two sessions with distinguishable content found (read-only) | ✅     |
| Both sessions visible in the list                           | ✅     |
| New session's transcript shown correctly                    | ✅     |
| Late messages from the old session dropped                  | ✅     |

Report: `docs/evidence/tmp/messages-stale-2026-11-04T15-26-15-853Z.json`. The delay is only a test seam
(`MOSBOT_TEST_MESSAGES_SLOW_SESSION`) and has no effect on normal startup. At this point all three kinds of stale-response
isolation in the workbench — list / search / messages — have real-service verification.

## 2026-11-04 Plugin-disabled state: Dashboard API not reachable

Using the authorized test-server session to call REST directly and try to read/toggle plugins: `/api/dashboard/agent-plugins`
returns **404 `Headless backend (hermes serve): web UI disabled`**. This deployment is the `hermes serve` headless backend
with no dashboard plugin-management route; disabling Kanban requires the server-side `hermes plugins disable <key>` plus a
gateway restart/rescan. Therefore the "plugin-disabled empty state" cannot be constructed through the existing API and is
recorded as a server-configuration dependency, with no fake verification.

# M1 · Background Approval Discovery and Notifications · Evidence

- Card: M1 (pending requests for unopened Bots, system notifications)
- Status: **Background discovery, in-app reminders, and system notifications implemented and covered by unit tests; real approval triggering and system notification display await natural-condition re-verification**
- Recorded: 2026-11-04
- Data source: real Dashboard `192.168.2.171:9119` (v0.22.5 / `bf0203a794`), read-only subscription, no writes

## Implementation

- Main-process `PendingWatcher` (separate Gateway connection, does not affect the current chat):
  - polls `profiles.list` (to get the stored id → profile mapping of the canonical Bot Chat) and `session.active_list` every 5 s;
  - for sessions whose state is `waiting` and that belong to the canonical Bot Chat, attaches read-only with `session.activate {omit_messages:true}`, reads `open_requests`, and converts new requests into `add` events; subsequent requests for already-attached sessions arrive directly;
  - emits `remove` on `request.cancel` or when polling finds it is no longer waiting; stops and clears on sign-out/quit;
  - notifies once per request id.
- System notification (macOS `Notification`): sent only when the main window is invisible or unfocused; the title is the Bot display name, the body distinguishes approval/clarification in zh/en; clicking restores or rebuilds the main window, sends `open {profile}` to the renderer, automatically selects that Bot, and after the chat connection resumes re-delivers the request as an inline card. If notifications are denied by the system, the in-app reminder remains.
- Renderer: the left-column "Pending · N" uses the background discovery count in real mode, and clicking jumps directly to the first pending Bot; after switching/opening a Bot the card is delivered by the chat connection, and answering uses the same request id.

## Verification

| Check                                                | Result                                                                                                                                                               |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | Pass                                                                                                                                                                 |
| `pnpm test`                                          | **130 cases pass** (2 new PendingWatcher, pending count/selector tests)                                                                                              |
| `pnpm test:e2e`                                      | **11 cases pass** (fixture mode and persistence restart tests unaffected)                                                                                            |
| Real `session.active_list`                           | ✅ Pass: 7 active sessions, `waiting=0` (none pending currently)                                                                                                     |
| Real notification display / approval trigger         | ⏳ Not verified: the deployment auto-allows `echo`-like commands and no manual approval was produced; the system notification needs the user present to observe once |

## Known Limitations

- Only monitors the canonical "Bot Chat" sessions; approvals from normal sessions or other clients are out of scope this round.
- Polling every 5 s; clearing after another client handles it takes at most one period; `request.cancel` clears immediately.
- Notification permission denied, Do Not Disturb, etc. only affect the system banner; the in-app count and cards are unaffected.
- Requests for unopened Bots show the full card only after opening; the in-app UI does not expand details of unselected Bots.

## 2026-11-04 Real Approval Re-verification (per user authorization, dedicated profile auto-cleaned)

- **Config (read-only)**: `GET /api/config` shows `approvals.mode=manual`, `timeout=300`; no config was modified.
- **Why the earlier echo did not trigger approval**: `manual` mode only asks about dangerous command patterns; `echo` / ordinary `rm file` are not in the dangerous-pattern table, so no approval is prompted. Using `chmod 777 <dedicated probe file>` hits the dangerous pattern.
- **Chat probe results (dedicated profile, auto-cleaned)**:
  - `Approval config (read-only)` ✅ `approvals.mode=manual · timeout=300`
  - `Approval request (chmod 777 probe file)` ✅ `request raised · choices=4`
  - `Approval receipt (deny)` ✅ replies `deny` by request id
  - `Command not executed after deny (probe file still there)` ✅ the file still exists when reading back the workspace
  - `Allow branch`: trigger the request again → reply `once` → turn completes ✅
  - Report: `docs/evidence/tmp/dashboard-chat-2026-11-04T07-32-11-088Z.json`
- **GUI re-verification (packaged artifact + dedicated profile + bridge login, no password entry)**:
  - Created a Bot through the UI → sent a dangerous command from the composer → **inline approval card appears** ✅
  - After switching to another Bot, the background watcher shows "Pending · 1" and it can be seen directly ✅
  - Clicking Pending to jump back exposed and fixed two real defects:
    1. When the chat manager was already connected to the same session, `chat.open` went through the cache and did not resend connection/session (after a renderer reload/window reopen it kept showing "Connection lost");
    2. on jump-back the `storedSessionId` in the remote chat cache was still null (not written back after session creation), causing it to open a newly created empty session instead of the session where the approval was located.
  - Also fixed a `session is not ready` race where the composer could send when "connected but session not ready".
  - **Full GUI chain green after the fixes** (`scripts/gui-approval-walkthrough.mjs`): create dedicated Bot → create probe file → `chmod 666` triggers **inline approval card** → switch away → background **"Pending · 1"** → click to jump back → **approval card re-delivered in the canonical session** → click "Deny" → **"Denied" receipt** → badge cleared.
    Screenshots: `screens/m5/approval-inline-real.png`, `screens/m5/approval-reopened-real.png`; report: `docs/evidence/tmp/approval-gui-2026-11-04T08-11-04-079Z.json`.
  - Real defects fixed during this GUI re-verification: event cursor not reset across sessions caused false history-stale and cleared requests; the reducer deleted the request on approval receipt so the card vanished; the composer did not verify that the live session belonged to the current Bot (could send messages to the previous Bot); reopening an already-connected session did not resend events; the canonical session id was not written back to the cache.
  - System notification banner display/click and dual-client cross-client receipts are still pending.

## 2026-11-04 System Notification Path Verification (programmatic)

`scripts/gui-notification-walkthrough.mjs` (packaged artifact + real service + dedicated Bot, `MOSBOT_DIAG=1`):

| Step                                                                                                                                    | Result                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Trigger a real approval inside the dedicated Bot (keep the chat connection so the server does not auto-deny when no client is attached) | ✅ approval pending                                              |
| Minimize the window (lose focus)                                                                                                        | ✅                                                               |
| Main process requests a system notification                                                                                             | ✅ title=Bot name, body="Needs your confirmation", approval=true |
| Click handling path (main-process diag triggers the click handler)                                                                      | ✅ window restored to visible                                    |
| After the click, open the waiting Bot and re-deliver the approval card                                                                  | ✅ card visible                                                  |
| Deny on this path and show the receipt                                                                                                  | ✅ "Denied"                                                      |

Report: `docs/evidence/tmp/notification-gui-2026-11-04T09-45-55-682Z.json`.

### Limitations and Behavior Notes

- **The actual pixels of the macOS notification banner and a real mouse click are not verified**: this shell has no screen-recording permission (`screencapture` returns a black image), and Notification Center items cannot be clicked from here either. So this item can only count as "programmatic verification of the notification request and click handling"; the user still needs to confirm the banner display and a real click on site.
- Key behavior: an approval request stays pending only while **a client is still attached** to that session. Switching the window to another Bot disconnects the old chat connection, and when no client is available to ask, the server automatically denies the request (the agent continues). Therefore "approvals for unopened Bots" must be produced by another client still observing that session (e.g. a phone or another computer); a single client cannot create an unopened approval by "switching away". This also explains the earlier GUI test timing differences.

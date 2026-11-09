# M4 · Attachments and Computer (first slice) · Evidence

[简体中文](m4-attachments-and-computer-zh.md)

- Card: M4 (attachment send/receive, computer status/preview/wake; the artifact index and the watch/takeover window are in the next slice)
- Status: **Attachment upload/real inference read, library artifact index/preview/save-and-open, computer status/preview/wake, the
  standalone RFB viewer window and lease acquire/release are all wired in**; real-frame acceptance of the viewer window awaits
  the user's presence for confirmation
- Recorded: 2026-11-04
- Target service: `192.168.2.171:9119` (v0.22.5 / `bf0203a794`)

## Attachments

- The paperclip in the composer is available when connected and a Bot Chat is open: system file picker (main process) → read
  (10 MB limit) → base64 data URL → WS `file.attach {session_id, name, data_url}` → returns an `@file:` reference;
- The reference is shown as a chip above the composer and can be removed; on send the reference and the body are submitted
  together with `prompt.submit`;
- A failure (over limit / read failure / server rejection) shows an error and does not send; cancelling the picker is silent.
- Real verification (dedicated profile, auto-cleanup): upload `mosbot-probe-attachment.txt` to get a reference → prompt the
  model to read the attachment → the reply echoes the random token inside the file (`chat_attach_read` passes).

## Library

- Workspace resolution: `info.cwd` returned by the chat `session.resume` is cached together with `chatOpen`; the library uses it
  as the artifact root (falling back to the canonical Bot Chat's session record when no chat has been opened).
- Index: `GET /api/files?path=<workspace>` → file name, size, mime, kind (image/text/pdf/other), modification time, sorted by
  modification time descending, capped at 200 entries.
- Read: `GET /api/files/read?path=` → data URL; text is decoded then previewed (400 KB limit), images are shown directly;
  PDF/other kinds prompt to save and open with a system application.
- Save and open: the main process writes the data URL into Downloads (auto-appending a timestamp on name collision), then
  explicitly opens it with `shell.openPath`; a failure shows an error and never overwrites existing files.
- Real verification (dedicated profile, auto-cleanup): have the Bot create `mosbot-probe-artifact.txt` in the workspace →
  the index hits it (kind=text, 24 B) → the read content contains the random token.

## Computer

- The inspector "Computer" tab reads the real `display.status` in connected mode (polled every 5 s), showing running/asleep,
  geometry and the blocked reason;
- When running, it reads `display.thumbnail` to show a 16:10 preview; when the server reports `suppressed` (another party holds
  the lease), it hides the frame and shows a notice instead of a stale frame;
- When asleep it offers an explicit "Wake" button (`display.start`), then re-reads the authoritative state 1.5 s later; when
  blocked it is disabled with the reason shown;
- Standalone viewer window: the main process calls `display.observe` to get a one-time display ticket and a server-minted viewer
  id, and opens a standalone BrowserWindow (noVNC RFB directly to `/api/display/ws?display_ticket=`); the control bar shows
  "View only / You are in control / Someone else is in control", `display.lease.acquire/release` acquires/returns control, and
  lease broadcasts and operation results stay in sync; closing the window or logging out automatically returns the lease and
  closes the connection. The RFB window is read-only initially and only sends input after control is acquired.

## Recurring tasks overview

- The inspector "Recurring tasks" tab reads `/api/cron/jobs?profile=` in connected mode, showing the task name, schedule and
  disabled state; the empty state matches the fixture. Read-only; it does not modify server tasks.

## Verification

| Check                                     | Result                                                                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Real attachment probe (dedicated profile) | ✅ upload staged, model echoes the attachment token, profile cleaned up                                                                                     |
| Real `display.status`                     | ✅ fields such as supported/installed/running/lease readable                                                                                                |
| Real `display.thumbnail`                  | ✅ read succeeded; while the computer is asleep `data_url=null`, no frame, no suppressed (frame not faked)                                                  |
| Real computer probe (wake/ticket/lease)   | ✅ running=true · observe ticket+viewer_id · acquire holder=human · preview suppressed while holding the lease (`human_has_control`) · release holder=agent |
| `pnpm test`                               | 133 passed                                                                                                                                                  |
| `pnpm test:e2e`                           | 12 passed (fixture path unaffected)                                                                                                                         |
| typecheck / lint / format / package       | passed                                                                                                                                                      |

## Library fields and error states (2026-11-04 addendum)

Deployment source `~/.hermes/hermes-agent` (`bf0203a794`), `/api/files` behavior and this round's fixes:

- Directory entry fields are `name / path / is_directory / size / mtime / mime_type`, where **`mtime` is epoch seconds**, not
  `modified_at` milliseconds; the client previously read only `modified_at`, so all files sorted as 0. It now prefers
  `modified_at`, otherwise uses `mtime × 1000`, keeping "sorted by modification time descending".
- A dangling symlink returns `broken_link: true`, `size: null`. The library now shows a "Resource deleted" badge and disables
  opening, instead of showing it as a 0 B clickable item.
- Error mapping: `401→session_expired`, `403→unauthorized(httpStatus 403)`, `404→http_error`, `413→http_error`; the library
  provides dedicated copy for deleted / no permission / too large / login expired / not connected, and offers a "Retry" button
  (`src/renderer/features/inspector/artifactError.ts`).
- **The deployment API provides no field linking an artifact to its source message**: `/api/files` has only filesystem metadata.
  So "source message" can currently only be used in the fixture demo and is not shown in the real library; this is a deployment
  capability gap, registered as item 6 in `acceptance.md`, and must not be fabricated by client guesswork.
- Verification: `tests/unit/artifacts-mapping.test.ts` (fields/sorting/broken links/error mapping); **real-service rerun
  passed (2026-11-04 14:37, dedicated profile auto-cleaned)**:
  `chat_artifact_index` returned `name=mosbot-probe-artifact.txt · kind=text · bytes=24 ·
mtime=2026-11-04T06:37:52.972Z · broken=false`, `chat_artifact_read` echoed the token, and attachment upload/inference read
  passed again in the same run; report `docs/evidence/tmp/dashboard-chat-2026-11-04T06-39-26-736Z.json`.

## Real viewer-window acceptance (completed 2026-11-04)

`scripts/gui-computer-walkthrough.mjs` (packaged artifact + real Dashboard + dedicated viewer, no remote frame pixels captured):

| Step                                             | Result                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| Inspector "Computer" reads real `display.status` | ✅ computer is running                                           |
| Open the standalone viewer window                | ✅ new BrowserWindow                                             |
| noVNC RFB connection and frame                   | ✅ canvas **1440 × 900** (real remote frame)                     |
| Acquire control (lease)                          | ✅ "You are in control", the button switches to "Return control" |
| Return control                                   | ✅ back to "View only · Take control"                            |
| Close the window                                 | ✅ window destroyed                                              |

Two real defects fixed this round (the viewer window had never actually worked before):

1. noVNC sends `Sec-WebSocket-Protocol: binary`, while the deployed RFB bridge does not negotiate the subprotocol → handshake 1006. Changing to `wsProtocols: []` made it connect.
2. The viewer window's `computerAcquire/Release/Reconnect/Close` IPC calls were rejected by the main process under "trust the
   main window only", returning `The viewer is not ready`, so control could never be acquired. Now the viewer only trusts its
   own top-level frame.

Evidence: `docs/evidence/tmp/computer-gui-2026-11-04T08-38-29-331Z.json`.

### Dual-viewer lease contention (2026-11-04, user-authorized test server)

`scripts/gui-computer-dual.mjs`: two standalone packaged instances (same account, separate userData) open the viewer window for
the same profile; both frames are **1440 × 900**:

| Step                                                                   | Result                                                                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| A acquires control                                                     | ✅ "You are in control"                                                                                                  |
| B observes someone else in control                                     | ✅ "Someone else is controlling this computer." (control button disabled)                                                |
| B force-acquires (calling IPC directly, bypassing the disabled button) | ✅ succeeded: **the later client takes over the lease**, A is kicked                                                     |
| A recovers after being kicked                                          | ✅ RFB close(4000) triggers a fresh `display.observe` + rebuild; A returns to read-only and sees someone else in control |
| After B returns control                                                | ✅ A returns to "View only"                                                                                              |

**Conclusion: the deployment (v0.22.5 / `bf0203a794`) still allows a later client to seize the lease; M0c's "non-preemptive
atomic claim" gap is confirmed on the designated service**, so M4 cannot be closed against the current deployment. The client
side already does: after being preempted, automatically re-observe and return to read-only, never sending input into someone
else's lease. Report: `docs/evidence/tmp/computer-dual-2026-11-04T08-41-37-535Z.json`.

## Network disconnect handling (2026-11-04 addendum)

- The main window gained a global offline notice; the viewer window shows "Network disconnected; the frame will reconnect
  automatically once the network recovers." and on `online` re-`display.observe` through `computer.reconnect` to get a ticket and
  rebuild RFB.
- An earlier viewing failure was caused by the user switching networks, not a client defect; the real-frame acceptance above was
  completed on a stable network.

## Incomplete / next slice

- Library source-message linkage and refinement of expired/no-permission/deleted states (currently indexing workspace files;
  source messages pending).
- Computer standalone window: `display.observe` → one-time display ticket → RFB viewing; `display.lease.acquire/release` to
  acquire/return control; someone else in control, offline fallback to read-only, closing the window returns the lease,
  dual-client acceptance.
- Inspector recurring-task overview with real `/api/cron/jobs` data (currently a read-only probe has verified the endpoint).

## 2026-11-04 Lease re-verification after restart (force-kill scenario)

`scripts/gui-stale-lease.mjs`: after the viewer window acquires control, **SIGKILL** the whole app (so no release runs), then
restart and reopen the viewer window for the same Bot.

| Check                                        | Result                                 |
| -------------------------------------------- | -------------------------------------- |
| viewer held control before the crash         | ✅ "You are in control"                |
| lease re-read after restart (not in control) | ✅ "View only"                         |
| Take control button usable                   | ✅ disabled=false                      |
| re-acquire control                           | ✅ "You are in control", then released |

Conclusion: on this deployment, force-killing the viewer process does not leave a stuck "stale human lease"; after restart it
returns to read-only and control can be acquired again. Also this round added a client behavior: when the viewer window opens it
directly renders the **lease snapshot** returned by `display.observe`; if another human does hold the lease, it shows "Someone
else is in control" right away instead of falsely reporting "View only" first.

Report: `docs/evidence/tmp/stale-lease-2026-11-04T10-45-36-283Z.json`.

Still unverified: real frame reconnect after a network disconnect; dual-viewer non-preemption (M0c server dependency).

## 2026-11-04 Viewer disconnect/reconnect (simulated socket drop + offline/online events)

`scripts/gui-viewer-reconnect.mjs` (`MOSBOT_DIAG=1` exposes a test-only `dropSocket()`, no real network touched):

| Check                                                | Result                                     |
| ---------------------------------------------------- | ------------------------------------------ |
| viewer window connected with a real canvas           | ✅                                         |
| RFB socket forcibly dropped, auto re-observe/rebuild | ✅ frame restored, state back to read-only |
| `offline` event shows "Network disconnected…"        | ✅                                         |
| `online` event reconnects automatically              | ✅ frame restored                          |

Report: `docs/evidence/tmp/viewer-reconnect-2026-11-04T10-50-35-732Z.json`.

Note: this is a **simulated** disconnect (test seam + DOM events); reconnect of the frame after a real Wi-Fi/NIC disconnect has
not been tested. This round also fixed the viewer window not reading the `display.observe` lease snapshot on open (it now shows
"Someone else is in control" immediately).

## 2026-11-04 Stale-response isolation when switching Bots in the library (code fix)

`LibraryTab`'s artifacts list, preview read and save callbacks all captured `botId`, but after the response returned did not
check whether it was still the current Bot: when switching Bots quickly, the old Bot's list/preview could overwrite the new
Bot's content (the same class of problem as the workbench board/profile). A `currentBot` ref guard was added so stale responses
are dropped directly; a duplicate assignment in `chat.ts` was also removed. The fix is covered by typecheck/regression tests;
no separate delay-injection GUI reproduction was done (real library content involves user data).

## 2026-11-04 Computer status/thumbnail routed by profile (fix)

`display.status/thumbnail/start`'s **runtime is host-level**, but the **lease and thumbnail suppression are per profile**. The
library "Computer" tab previously called them without a profile, so the gateway could only take the lease from the current
session context: when switching Bots quickly, another Bot's lease/suppression state could be used incorrectly (the thumbnail
might still show while someone else holds it).

Fix: bridge/preload/IPC/service all support an optional `profile`, and `ComputerTab` explicitly passes `profileId`; when unnamed,
the old behavior is kept (probes/compatibility calls). Unit test `tests/unit/display.test.ts` verifies that all three calls pass
`{profile}` to the RPC, and pass `{}` when unnamed.

Note: the runtime's running/geometry are host-level shared values and cannot distinguish profiles via "a Bot that has not
started"; therefore this phenomenon was not used for real-service assertions, to avoid misjudgment.

## 2026-11-04 Inspector cross-Bot state reuse (code fix)

`InspectorPanel`'s three tabs are not rebuilt when switching Bots: the library's list/preview, the computer tab's status/frame,
and the details tab's cron rows are all briefly reused by the next Bot. Worse, `ComputerTab.loadRemote`'s `useCallback` had an
empty dependency list, so its closure captured **the profileId at first mount**, and could still query the old Bot after
switching.

Fix:

- `InspectorPanel` uses `key={bot.id}` so the three tabs are rebuilt when the Bot switches;
- `ComputerTab`'s `loadRemote` depends on `profileId`, and after the response returns validates that it is still the current Bot
  (dropping stale responses).

Note: the runtime/lease semantics of `display.status` appear host-level shared on the deployment, so no real GUI assertion was
made using "two Bots with different computer states", to avoid misjudgment; the fix is covered by typecheck/unit tests and the
existing real computer page verification.

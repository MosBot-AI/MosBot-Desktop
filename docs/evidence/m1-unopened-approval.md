# M1 · Approval Discovery for Unopened Bots / Direct Notification / Cross-client Receipts · Evidence

[简体中文](m1-unopened-approval-zh.md)

- Card: M1 / release-candidate acceptance "Bots that are unopened or in collapsed sections can be discovered and jumped to when waiting for approval; background notifications; cross-client handling receipt sync"
- Status: **2026-11-04 run passed; a 2026-11-09 rerun fails at the original client's cross-client receipt.** Discovery, notification and click-through still pass; the receipt sync is under investigation and must not be claimed as verified.
- Recorded: 2026-11-09 (history: 2026-11-04)
- Data nature: real Dashboard `192.168.2.171:9119`; no remote screen content collected; notification banner pixels not collected

## Method

`scripts/gui-unopened-approval.mjs`:

1. Client A creates a dedicated Bot and keeps its Chat open, triggering a real `chmod 777` approval (A being attached ensures the server does not auto-deny the request);
2. Client B starts and stays on **another Bot** (target Chat not open), then minimizes the window;
3. B's pending watcher polls `session.active_list`, finds the waiting canonical Bot Chat and attaches, requesting a system notification while the window is unfocused;
4. Trigger the notification click path: B restores the window, opens the waiting Bot, re-delivers the approval card;
5. B denies → B shows a receipt; A reconciles via `open_requests` from `session.resume` and folds the card into "Handled in another window".

## Results

| Check                                                 | Result                                     |
| ----------------------------------------------------- | ------------------------------------------ |
| A's approval pending (A keeps the session attached)   | ✅                                         |
| B stays on another Bot (target Chat not open)         | ✅                                         |
| B window minimized                                    | ✅                                         |
| **B's watcher discovers the unopened Bot's approval** | ✅ waiting session mapped                  |
| **B requests a system notification**                  | ✅ `Bot name · Needs your confirmation`    |
| Notification click restores B's window                | ✅ visible & not minimised                 |
| Click jumps directly to the waiting Bot               | ✅ name is the dedicated Bot               |
| B receives the approval card                          | ✅                                         |
| B deny receipt                                        | ✅ "Denied"                                |
| **A receives the cross-client receipt**               | ❌ 2026-11-09 rerun: A keeps the card open |

Report: `docs/evidence/tmp/unopened-approval-2026-11-04T10-07-50-369Z.json`.

## Limitations

- macOS notification banner pixels and a real mouse click are not verified (this shell has no screen-recording permission); what was verified this time is "the notification request" and "the click handling path".
- This scenario depends on **another client keeping the target session attached** (A); a single client closing the target Chat makes the server auto-deny the request (behavior notes in `m1-background-approvals.md`).

## 2026-11-09 Rerun (cross-client receipt fails)

- Command: `node scripts/gui-unopened-approval.mjs` (same two-client flow).
- Passing steps: dedicated Bot, B on another Bot, B minimized, approval pending on A, B notification requested, B watcher mapped the session, notification click opened the Bot, approval card delivered on B, B denial receipt.
- **Failing step: A does not fold the shared request into "Handled in another window".**
- Diagnostics from the rerun:
  - A and B both use the same stored session `20261109_165353_027a2b` / runtime `eb4fc695` and the same request id `srq-...`.
  - A's chat manager is connected, its request poll is running, `session.resume` succeeds without an error, and A's `openRequestIds` still contains the request.
  - B's local request list is empty after the denial, but the gateway's `session.resume` for A still reports the request as open.
- Additional diagnostic: calling `window.mosbot.dashboard.chatAnswer(requestId, {choice:'deny'})` directly on B returns `{ok:true}` (the response frame is sent), yet A's `session.resume` still reports the request as open. This points to server-side ownership/routing of the response rather than a client-side answer failure.
- Working hypothesis: after the notification click, B's denial response may be handled by a gateway process/transport that does not own the request (the deployment runs `gateway_mode=multiplex`, and multiple gateway processes may be load-balanced), or the gateway does not settle a shared request across clients. This needs server-side investigation; the client cannot reconcile a request the gateway still reports as open.
- Reports: `docs/evidence/tmp/unopened-approval-2026-11-09T16-28-28-115Z.json`, `...16-31-23-687Z.json`, `...16-35-42-435Z.json`, `...16-42-51-197Z.json`, `...16-52-04-913Z.json`.

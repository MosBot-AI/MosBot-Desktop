# M1 · Approval Discovery for Unopened Bots / Direct Notification / Cross-client Receipts · Evidence

- Card: M1 / release-candidate acceptance "Bots that are unopened or in collapsed sections can be discovered and jumped to when waiting for approval; background notifications; cross-client handling receipt sync"
- Status: **Real-service GUI full chain passes** (two clients, dedicated Bot, auto-cleaned)
- Recorded: 2026-11-04
- Data nature: real Dashboard `192.168.2.171:9119`; no remote screen content collected; notification banner pixels not collected

## Method

`scripts/gui-unopened-approval.mjs`:

1. Client A creates a dedicated Bot and keeps its Chat open, triggering a real `chmod 777` approval (A being attached ensures the server does not auto-deny the request);
2. Client B starts and stays on **another Bot** (target Chat not open), then minimizes the window;
3. B's pending watcher polls `session.active_list`, finds the waiting canonical Bot Chat and attaches, requesting a system notification while the window is unfocused;
4. Trigger the notification click path: B restores the window, opens the waiting Bot, re-delivers the approval card;
5. B denies → B shows a receipt; A reconciles via `open_requests` from `session.resume` and folds the card into "Handled in another window".

## Results

| Check                                                 | Result                                  |
| ----------------------------------------------------- | --------------------------------------- |
| A's approval pending (A keeps the session attached)   | ✅                                      |
| B stays on another Bot (target Chat not open)         | ✅                                      |
| B window minimized                                    | ✅                                      |
| **B's watcher discovers the unopened Bot's approval** | ✅ waiting session mapped               |
| **B requests a system notification**                  | ✅ `Bot name · Needs your confirmation` |
| Notification click restores B's window                | ✅ visible & not minimised              |
| Click jumps directly to the waiting Bot               | ✅ name is the dedicated Bot            |
| B receives the approval card                          | ✅                                      |
| B deny receipt                                        | ✅ "Denied"                             |
| **A receives the cross-client receipt**               | ✅ "Handled in another window"          |

Report: `docs/evidence/tmp/unopened-approval-2026-11-04T10-07-50-369Z.json`.

## Limitations

- macOS notification banner pixels and a real mouse click are not verified (this shell has no screen-recording permission); what was verified this time is "the notification request" and "the click handling path".
- This scenario depends on **another client keeping the target session attached** (A); a single client closing the target Chat makes the server auto-deny the request (behavior notes in `m1-background-approvals.md`).

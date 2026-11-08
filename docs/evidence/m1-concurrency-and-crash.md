# M1 · Concurrent Approvals and Force-Quit Safety · Evidence

- Card: M1 / concurrency and force-quit gaps in release-candidate acceptance items 4 and 10
- Status: **Verified via real-service GUI; one API limitation on concurrent receipts**
- Recorded: 2026-11-04
- Data nature: real Dashboard + packaged artifact + dedicated Bot, safe probe files, cleaned up at the end

## 1. Two Clients Answering the Same Approval Concurrently

`scripts/gui-concurrent-approval.mjs`: A and B open the same Bot Chat and both receive the same real `chmod` approval; they click at the same time (A denies, B allows).

| Check                                                                                                   | Result                     |
| ------------------------------------------------------------------------------------------------------- | -------------------------- |
| Both ends receive the same approval card                                                                | ✅                         |
| After both ends answer simultaneously, both have a final state (receipt or "Handled in another window") | ✅                         |
| The dangerous command did not execute twice                                                             | ✅ only one request record |
| No leftover approval card                                                                               | ✅                         |

Report: `docs/evidence/tmp/concurrent-approval-2026-11-04T10-34-09-298Z.json`.

**Known limitation (API capability)**: the response frame is a notification without a receipt, and the gateway does not broadcast "which answer won". With concurrent answers, the two windows may each briefly show their own receipt and then may fold into "Handled in another window"; both behaviors were observed under different timings. The server settles only once and the command does not execute twice, but the client cannot learn the winner from the API, so identical display in both windows cannot be guaranteed. A complete fix requires the server to broadcast a resolution event carrying the answer after settle.

## 2. No Automatic Resend After Force Quit

`scripts/gui-force-quit.mjs`:

| Check                                                                                     | Result |
| ----------------------------------------------------------------------------------------- | ------ |
| SIGKILL the main process immediately after sending a prompt (simulating crash/force quit) | ✅     |
| Restore the same Bot Chat after restart                                                   | ✅     |
| The sent prompt appears only once in the session (no auto-resend/duplicate send)          | ✅     |

Report: `docs/evidence/tmp/force-quit-2026-11-04T10-36-20-752Z.json`.

## Conclusion

- Concurrent approvals do not cause duplicate command execution or leftover cards; full cross-client receipt consistency is limited by server event capabilities.
- Force quit does not automatically resend messages already in flight after restart.

## 3. Two Clients Sending Different Messages Simultaneously

`scripts/gui-concurrent-send.mjs` (hidden window, same Bot Chat, A/B press Enter simultaneously):

| Check                                                         | Result     |
| ------------------------------------------------------------- | ---------- |
| Each end's prompt appears only once (not lost/not duplicated) | ✅ A:1 B:1 |
| Both turns complete and each receives a reply                 | ✅         |
| No connection/error banner                                    | ✅         |

**Known limitation (server events)**: the gateway does not broadcast "user message" events to other clients, only assistant streams/tool calls/question cards. So when viewing the same screen live, the other end's user bubble does not appear (`A saw B's prompt=false`) and is only filled in by history sync after reopening/reconnecting. If both ends must see each other's user bubbles live, the server needs to add user-message broadcast.

Report: `docs/evidence/tmp/concurrent-send-2026-11-04T11-44-03-175Z.json`.

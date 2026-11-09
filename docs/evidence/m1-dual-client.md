# M1 · Dual Client (Same Account) Chat and Approval Receipts · Evidence

[简体中文](m1-dual-client-zh.md)

- Card: M1 (cross-client chat observation, approval discovery, and receipt sync), remaining items in M0b steps 3/5
- Status: **Real-service GUI full chain passes** (two independent packaged instances, same account, dedicated profile, auto-cleaned)
- Recorded: 2026-11-04
- Data nature: real Dashboard `192.168.2.171:9119` (v0.22.5 / `bf0203a794`) + packaged artifact; no remote screen content collected

## Method

`scripts/gui-dual-client.mjs`:

1. Client A creates a dedicated profile via the Dashboard API (`mosbot-probe-dual-HHMMSS`, model readiness inherited from the default Bot);
2. A and B (two independent app instances, each with a copied probe userData) open **the same Bot Chat** via search;
3. A sends a normal prompt; both transcripts should show the real reply;
4. A triggers the dangerous command `chmod 777`; both ends should receive the approval card; A denies;
5. A shows "Denied"; B reconciles via `open_requests` from `session.resume` and folds the shared request into a "Handled in another window" receipt.

## Results

| Check                                             | Result                         |
| ------------------------------------------------- | ------------------------------ |
| Dedicated profile created (API)                   | ✅ `mosbot-probe-dual-171837`  |
| Both ends open the same Bot Chat                  | ✅                             |
| A receives its own real reply                     | ✅ `dual-ok`                   |
| **B observes the same reply (cross-client chat)** | ✅ `dual-ok`                   |
| A receives the approval card                      | ✅                             |
| **B also receives the same approval request**     | ✅                             |
| A displays a receipt after denying                | ✅ `Denied`                    |
| **B folds into a cross-client receipt**           | ✅ `Handled in another window` |

Report: `docs/evidence/tmp/dual-client-2026-11-04T09-21-23-044Z.json`.

## Implementation and Fixes

- The gateway does **not push** a resolution event after the other end handles the request; while it has unhandled requests, the client calls `session.resume {session_id: stored id, omit_messages:true}` every 5 s to read `open_requests` and turns vanished ids into `request-cancel reason=resolved-elsewhere`. When answering locally it first removes the id from the reconciliation set, so its own receipt is not overwritten as "handled elsewhere".
- The renderer folds this event into `ApprovalResolutionAction='remote'` with the copy "Handled in another window", keeping the card instead of silently removing it.
- **Real defect fixed**: `search-activate` only changed `selectedBotId` and did not sync `remote.selectedProfile`, so switching Bots via search results left the live session on the previous Bot (composer disabled/could send to the wrong session).
- Tests: `tests/unit/store.test.ts` covers search-driven remote selection; `tests/unit/chat.test.ts` covers remote receipt folding; 162 unit tests and 21 E2E pass.
- Debug state entry: `?diag=1` (only appended by the main process when `MOSBOT_DIAG=1`; for tests, does not affect normal startup).

## Not Covered

- Conflict paths when both ends send/answer the same request simultaneously; cross-client notification click; dual-end reconciliation after network disconnect/reconnect.
- Dual-viewer computer lease contention see `m4-attachments-and-computer.md` (M0c server dependency).

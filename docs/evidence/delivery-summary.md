# MosBot Desktop · Delivery Notes (current candidate)

[简体中文](delivery-summary-zh.md)

- Updated: 2026-11-09 · Latest implementation commit: `f2b86d6`
- Plan basis: `docs/plans/README.md`, `01-bot-experience.md`, `02-dashboard-integration.md`,
  `03-agent-handoff.md`
- Conclusion: **Code and automated acceptance have converged; the first release is still blocked by 3 external/user actions** (see the end).

## 1. Current status

| Item                                   | Status                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests                             | 173 passed                                                                                                                                     |
| E2E (hidden window, packaged artifact) | 21 passed                                                                                                                                      |
| typecheck / lint / format              | all green                                                                                                                                      |
| Full 10-minute hidden performance gate | passed: steady p95 32.2ms, burst 30.2ms, send/switch feedback 17.3ms, 10k history 27.8ms                                                       |
| 60-minute soak                         | passed (`m5-soak.md`)                                                                                                                          |
| Real-service integration               | approvals/receipts, dual client, unopened-Bot notifications, window lifecycle, computer frame/control, workbench writes, attachments/artifacts |
| Signing                                | ad-hoc full signature; Developer ID/notarization not done by user decision (no certificate)                                                    |
| Clean install                          | 2026-11-09 ZIP passes locally with fresh userData; second Mac not done                                                                         |
| Notification banner / click            | real banner captured 2026-11-09; click navigation fixed and regression-covered (#10 closed)                                                    |

## 2. Implementation scope (mapped to plan slices)

- M0a visual slice, M0b real probes/capability matrix, M0c reference patch (**not deployed**).
- M1: real login/silent restore, Bot roster and history, chat streaming/tools/stop/final state, cross-client chat and approvals,
  unopened-Bot notification deep link, window close/Dock reopen/quit restart, reconnect/replay, force-quit no resend.
- M2: create/appearance CAS/model ready/organize (pin/sections/search switching, including the remote selection fix).
- M3: workbench three pages real read/write, cross-client Kanban refresh, stale-response isolation (board/profile/search).
- M4: attachments and artifacts, computer wake/preview/RFB viewing, control acquire/return, recovery after being kicked, offline
  notice, lease re-verification after restart.
- M5: performance/soak/keyboard/IME/zoom/reduced motion/accessibility, install and upgrade migration, Apple Development signing.

## 3. Test mode

- All E2E and `scripts/gui-*.mjs` default to `MOSBOT_TEST_BACKGROUND=1`: windows hidden, unfocusable, no Dock icon, so the user
  is not disturbed; use `MOSBOT_TEST_FOREGROUND=1` only when a human needs to watch.
- Test-only objects carry the `mosbot-probe-*` marker and are cleaned up by the probe; real user data is read-only or only writes
  dedicated objects.

## 4. Re-verification entry points

```bash
pnpm typecheck && pnpm test && pnpm test:e2e
pnpm bench:stream
BENCH_SOAK_SECONDS=3600 pnpm bench:soak
MOSBOT_DASHBOARD_URL=http://192.168.2.171:9119 MOSBOT_PROBE_MODE=chat pnpm test:integration
# Real GUI: see section 4 of docs/evidence/acceptance.md
```

## 5. Remaining items before the first release (see `final-checklist.md` for details)

1. **Clean install on a second Mac / new user**: the local clean-install check passes; real second-machine acceptance is still open.
2. **Seven consecutive days of daily use**: user-managed; the log stays in `dogfood-log.md`.
3. **Server gaps**: `/api/files` source field (#15), plugin-disabled state (#17) and unconfigured-model environment (#16) need a
   scope decision or server work. The computer-lease patch (#14) is out of first-release scope.

Resolved on 2026-11-09: the real macOS notification banner was captured and the click navigation bug was fixed (Issue #10);
M0a visual baseline confirmed; internal signing decision recorded; lease moved out of first-release scope.

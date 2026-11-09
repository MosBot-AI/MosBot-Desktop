# MosBot Desktop · Delivery Notes (current candidate)

[简体中文](delivery-summary-zh.md)

- Updated: 2026-11-04 · Latest implementation commit: `587384b`
- Plan basis: `docs/plans/README.md`, `01-bot-experience.md`, `02-dashboard-integration.md`,
  `03-agent-handoff.md`
- Conclusion: **Code and automated acceptance have converged; the first release is still blocked by 5 external/user actions** (see the end).

## 1. Current status

| Item                                   | Status                                                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit tests                             | 169 passed                                                                                                                                     |
| E2E (hidden window, packaged artifact) | 21 passed                                                                                                                                      |
| typecheck / lint / format              | all green                                                                                                                                      |
| Full 10-minute hidden performance gate | passed: steady p95 32.2ms, burst 30.2ms, send/switch feedback 17.3ms, 10k history 27.8ms                                                       |
| 60-minute soak                         | passed (`m5-soak.md`)                                                                                                                          |
| Real-service integration               | approvals/receipts, dual client, unopened-Bot notifications, window lifecycle, computer frame/control, workbench writes, attachments/artifacts |
| Signing                                | Apple Development chain passes; Developer ID/notarization not done (no certificate)                                                            |
| Clean install                          | passed on the local temp directory + fresh userData; second Mac not done                                                                       |

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

## 5. The 5 items blocking the first release (see `final-checklist.md` for details)

1. **Notification banner**: screen recording is authorized and screencapture works; but automation executes the app binary directly,
   bypassing LaunchServices, so macOS did not register notifications (no entry in ncprefs). Changed to default ad-hoc full signing;
   you need to first produce a signed build with `MOSBOT_ADHOC_SIGN=1 pnpm make`, launch it from Finder and allow notifications;
   afterwards automatic screenshot verification is possible (signing changes the keychain identity, so a one-time re-login is required).
2. ~~Computer non-preemptive lease~~: **removed from first-release scope by the user** (known limitation: a later client can take
   over; the client shows someone else in control / returns to read-only after being kicked).
3. ~~Developer ID signing + notarization~~: **the user decided the first release uses internal signing** (default ad-hoc full
   signing); Gatekeeper rejection is a known limitation.
4. ~~7-day dogfooding~~: **the user will review/manage it themselves**; no longer a development-side blocker.
5. **Unconfigured-model environment / plugin-disabled state**: the user has authorized direct use of the test server for
   configuration; continue trying API/configuration paths.

Also: the M0a visual baseline needs your confirmation; the artifact "from message" field depends on new fields in the server-side
`/api/files` (scope negotiable).

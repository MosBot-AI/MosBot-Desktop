# MosBot Desktop · Final acceptance checklist (for the user)

[简体中文](final-checklist-zh.md)

- Updated: 2026-11-09
- Purpose: explain **what has actually been verified**, **what remains for you or the outside world to complete**, and the concrete steps and re-verification commands for each item.
- Corresponding index: `docs/evidence/acceptance.md` (item-by-item evidence); this page only lists the parts that "need you to act/decide".

## 1. Conclusion

Code and automated acceptance have converged, the M0a visual baseline is confirmed and the macOS notification banner/click path is now verified and fixed. **The first release cannot be declared complete yet**; the remaining items are the clean install on a second Mac, the 7-day daily-use record, and three server-side capability gaps.

## 2. Scope decisions (confirmed)

- **Computer non-preemptive lease is out of first-release scope**: the client keeps the correct behaviour of "someone else is controlling / kicked back to read-only"; the server patch is left for a later version.
- **The first release uses internal signing** (complete ad-hoc signature by default; Apple Development optional): no Developer ID/notarization, so the first open on a second Mac needs right-click → Open; Gatekeeper not accepting it is a known limitation.
- **The 7-day daily use is checked by you on your own**; the development side does not treat it as a blocking TODO.
- **Test-server configuration use is authorized**: its configuration/settings may be used for verification while avoiding changes to real users' Bot global configuration.

## 3. What you need to do (remaining)

| #   | Item                                       | Why it needs you                                                                                                                                                   | Concrete steps                                                                                                                                                                                                                  | Re-verification I can do afterwards                                                                                                            |
| --- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Clean install on a second Mac / user**   | This machine's clean-install check passes, but a real second Mac or new macOS user has not been tested (acceptance item 9)                                         | Install the current ZIP from `out/make/zip/darwin/arm64/MosBot-darwin-arm64-0.1.0.zip`, right-click → Open the first time, sign in and send one message. Record macOS version and chip.                                         | I update `m5-install-upgrade.md` with the environment and result, then close Issue #12                                                         |
| 2   | **Seven consecutive days of daily use**    | Acceptance item 11 requires real daily use with no blockers; it cannot be produced by automation                                                                   | Use the app normally every day: messages, approvals, workbench, computer, attachments, sleep/wake and restarts. Report any blocker the same day.                                                                                | I maintain `dogfood-log.md` and close Issue #13 after day 7; any blocker is fixed and the observation restarts if reliability was affected     |
| 3   | **Server gaps: decide or assign an owner** | `/api/files` has no source-message field (#15), the plugin-disabled state (#17) and the unconfigured-model environment (#16) need server-side capability or config | Decide whether the artifact source field is in first-release scope; assign the server/plugin/config work to the server team. The computer-lease patch (#14) is already out of first-release scope and does not need action now. | I update the affected Issues and acceptance rows once the scope/owner is known; verified server changes are re-tested with the existing probes |

## 4. Already actually verified (no action needed from you)

- Connection/login: real OAuth + PKCE + silent restore; cancel-login path.
- Chat: real replies, streaming, tool records, stop, terminal state, reconnect/replay, force-quit no-resend; two clients sharing one chat.
- Approvals: real request/deny/allow/receipt; background "pending" badge; unopened-Bot watcher; **real macOS notification banner captured on 2026-11-09**, and the click path now refreshes the roster before opening the matching Bot (Issue #10 closed; regression `scripts/gui-pending-open.mjs`).
- M0a: **the user confirmed the visual baseline on 2026-11-09**; the baseline is frozen.
- Lifecycle: cold start over a real connection restores the selected Bot and draft.
- Workbench: real REST/WS reads and write read-back; stale-response isolation; board switch closes the old watcher.
- Attachments/artifacts: real upload + model read, artifact index/read/save/open, `mtime` sorting, deleted badge, error copy.
- Computer: real wake/preview/watch (RFB 1440×900), acquire/return control, auto read-only after being kicked, network-loss notice.
- Performance: 10-minute streaming thresholds and 60-minute soak.
- Keyboard/IME/zoom/reduced motion/focus order/accessible names; local extract-install, upgrade migration and corruption fallback.
- Release artifact: ad-hoc signed ZIP (2026-11-09) with SHA-256 `56a19b77aabb5e66cd5f1efd503511e49349d2aa47e2aa3b96cfcb8b444d26f9`; `codesign --verify` passes; clean-install checks pass except the expected Developer ID/Gatekeeper check.
- Automated checks: `vitest` 173 passed, `npm run test:e2e` 21 passed, typecheck/lint/format green.

## 5. Re-verification commands (I can run them directly)

```bash
npm run typecheck && npm test && npm run test:e2e
npm run bench:stream
BENCH_SOAK_SECONDS=3600 npm run bench:soak
MOSBOT_DASHBOARD_URL=http://192.168.2.171:9119 MOSBOT_PROBE_MODE=chat npm run test:integration
node scripts/gui-pending-open.mjs
node scripts/gui-dual-client.mjs
node scripts/gui-unopened-approval.mjs
node scripts/gui-window-lifecycle.mjs
node scripts/gui-computer-walkthrough.mjs
node scripts/gui-connected-draft.mjs
node scripts/gui-chat-reconnect.mjs
node scripts/gui-concurrent-approval.mjs
node scripts/gui-concurrent-send.mjs
node scripts/gui-workbench-refresh.mjs
node scripts/gui-workbench-stale.mjs
node scripts/gui-sessions-stale.mjs
node scripts/gui-search-stale.mjs
node scripts/gui-force-quit.mjs
```

## 6. Why "first release complete" cannot be claimed yet (truthfully)

1. A real clean install on a second Mac or a new macOS user has not been tested.
2. The 7-day daily-use record has not started.
3. The three server-side gaps (#15, #16, #17) still need a scope decision or server work.
4. Developer ID signing/notarization is a known limitation accepted for this release; it is not a blocker but must be stated in the release notes.
5. A real pointer click after the notification-click fix has not been repeated; the exact IPC handler is covered by `scripts/gui-pending-open.mjs` and the unit tests.

# MosBot Desktop · Final acceptance checklist (for the user)

- Updated: 2026-11-04
- Purpose: explain **what has actually been verified**, **what remains for you or the outside world to complete**, and the concrete steps and re-verification commands for each item.
- Corresponding index: `docs/evidence/acceptance.md` (item-by-item evidence); this page only lists the parts that "need you to act/decide".

## 1. Conclusion

Within the scope that code can verify automatically, all release-candidate features have passed
verification against the real service, packaged artifacts and multi-client GUI; **the first release
cannot be declared complete yet** — only the 5 items below remain, 3 of which must be completed by
you or the server team.

## 2. Scope decisions (confirmed 2026-11-04)

- **The computer non-preemptive lease is out of first-release scope**: the client keeps the correct
  behavior of "someone else is controlling / kicked back to read-only"; the server patch is left for
  a later version.
- **The first release uses internal signing** (currently a complete ad-hoc signature by default;
  Apple Development optional): no Developer ID/notarization, so the first open on a second Mac needs
  a right-click → Open; Gatekeeper not accepting it is a known limitation.
- **The 7-day daily use is checked by you on your own**; the development side no longer treats it as
  a blocking TODO.
- **Authorization to use the test-server configuration is confirmed**: its configuration/settings can
  be used directly for verification (still avoiding changes to real users' Bot global configuration).

## 3. What you need to do (remaining)

| #   | Item                                                          | Why it needs you                                                                                                                                                         | Concrete steps                                                                                                                                                                                                                                                                                                  | Re-verification I can do afterwards                                                                                                                                           |
| --- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Look at the macOS notification banner and really click it** | The shell on this machine has no screen-recording permission (`screencapture` returns black), so I cannot automatically confirm the system banner pixels and mouse click | When I run `node scripts/gui-notification-walkthrough.mjs`, the window minimizes and triggers a real approval notification: confirm that "Bot name · needs your confirmation" appears in the top-right corner; click it with the mouse, and the app should restore the window and open that Bot's approval card | Record the result in `m1-background-approvals.md`; if you are willing to give DSH "Screen Recording" permission, I can capture and verify it automatically                    |
| 2   | **Decide what to do about the computer non-preemptive lease** | This guarantee must be implemented server-side; you said the test server is only authorized for the Dashboard API, and I will not deploy                                 | Choose one:<br>A. Have the server team apply `docs/patches/0001-display-lease-atomic-claim.patch` and restart the gateway;<br>B. Explicitly move "non-preemptive takeover" out of first-release scope (I will record the downgrade truthfully and not pass it off as complete)                                  | A: I rerun `node scripts/gui-computer-dual.mjs`, expecting `takeover-allowed` to become `takeover-refused`; B: update the acceptance scope and state the risk                 |
| 3   | **Developer ID certificate / notarization credentials**       | This machine only has an Apple Development certificate (`spctl` rejects it) and no Developer ID, so Gatekeeper and a clean install on a second Mac are impossible        | Provide a Developer ID Application certificate + notarytool credentials (Apple ID/Team/app-specific password or API key), or explicitly accept the "internal development signature, user needs right-click → Open" delivery form                                                                                | I rerun `pnpm test:install` to confirm `kind=developer-id`, `codesign --verify`, `spctl` acceptance and the notarization ticket; then do a clean-user install on this machine |
| 4   | **7 consecutive days of daily use**                           | The acceptance item requires "7 consecutive days of daily use with no blockers", which can only come from real usage                                                     | Starting today, use it normally every day (sending messages, approvals, workbench, computer, attachments all count); send me issues at any time. I will maintain `docs/evidence/dogfood-log.md` with the date/usage/issues                                                                                      | After day 7, I summarize the evidence and close item 11; I fix any blocking issue the same day                                                                                |
| 5   | **Confirm the visual baseline (M0a)**                         | The UI baseline must be frozen after user trial                                                                                                                          | Open the current build and compare it with `docs/evidence/screens/m0a/` and the recording key points (00:42/00:46/01:04/01:24/02:03/02:14), confirming the type size/spacing/color/motion tone                                                                                                                  | Freeze the baseline and close the visual-confirmation part of item 3                                                                                                          |

## 4. Already actually verified (no action needed from you)

- Connection/login: real OAuth + PKCE + silent restore; cancel-login path.
- Chat: real replies, streaming, tool records, stop, terminal state, disconnect/reconnect (fixture replay); **two clients sharing one chat observation**.
- Approvals: real request/deny/allow/receipt; background "pending" badge; **watcher discovery of an unopened Bot + notification request/click-through + cross-device receipt**; **approvals are still redelivered and actionable after window close / Dock reopen / quit-and-relaunch**.
- Lifecycle: cold start over a real connection restores the selected Bot and draft.
- Workbench: real REST/WS read and read-back of writes (pagination/cursor/model); switching boards closes the old watcher.
- Attachments/artifacts: real upload + model read, artifact index/read/save/open, `mtime` sorting, deleted badge, error copy.
- Computer: real wake/preview/watch (RFB 1440×900), acquire/return control, auto read-only when kicked, network-loss notice.
- Performance: 10-minute streaming thresholds (p95 31.3ms / burst 473/s / 10k history 52.8ms), 60-minute soak.
- Keyboard/IME/zoom/reduced motion/focus order/accessible names; local extract-install, upgrade migration and corruption fallback; Apple Development signing chain.

## 5. Re-verification commands (I can run them directly)

```bash
pnpm typecheck && pnpm test && pnpm test:e2e
pnpm bench:stream
BENCH_SOAK_SECONDS=3600 pnpm bench:soak
MOSBOT_DASHBOARD_URL=http://192.168.2.171:9119 MOSBOT_PROBE_MODE=chat pnpm test:integration
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

1. The system notification banner's **visual presentation and real mouse click** have not been
   confirmed by a person (the code path is verified).
2. The computer's **non-preemptive lease** can still be preempted by a latecomer in the designated
   deployment; the fix requires a server change, which the current authorization does not allow.
3. **Developer ID signing/notarization** and a clean install on a second Mac are not done (no certificate).
4. **7-day daily use** has not started.
5. The artifact source message depends on new server-side `/api/files` fields, which is a server
   capability gap (whether it must be in the first release can be negotiated).

If you decide to move any of the above "out of the first release", please say so explicitly; I will
update the scope and acceptance record rather than marking unverified items as complete.

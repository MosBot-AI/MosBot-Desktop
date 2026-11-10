# MosBot Desktop · Final acceptance checklist (for the user)

[简体中文](final-checklist-zh.md)

- Updated: 2026-11-10
- Purpose: explain what is verified, what is out of first-release scope by user decision, and what still blocks the release.
- Index: `docs/evidence/acceptance.md`.

## 1. Conclusion

The release candidate artifact and evidence are ready. On 2026-11-10 the user moved the M5 user acceptance items
(second-Mac clean install, seven-day dogfooding) out of first-release scope and moved M6 group chat into first-release scope.
The release is still blocked by the M1 cross-client receipt (#19, server-side), the server gaps #15/#16/#17, and the in-progress
M6 group-chat implementation.

## 2. Scope decisions (confirmed)

- **M5 user acceptance moved out of first-release scope** (2026-11-10): second-Mac clean install (#12) and seven-day dogfooding (#13)
  are closed as not planned; the known limitations are recorded in the release notes.
- **M6 group chat is in first-release scope** (2026-11-10); voice recording/transcription remains separate until a capable
  deployment/device is available.
- **Computer non-preemptive lease is out of first-release scope**; the client keeps the correct others-in-control/read-only behaviour.
- **First release uses internal ad-hoc signing**; Developer ID/notarization is a known limitation for public distribution.
- **Test-server configuration use is authorized** for verification while avoiding real users' Bot global configuration.

## 3. What still blocks the release

| #   | Item                                    | Current state                                                                           | Close condition                                                                                     | Owner       |
| --- | --------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ----------- |
| 1   | Cross-client approval receipt (#19)     | A keeps the card open after B denies; the gateway still reports the request open        | Server routes/broadcasts the settlement; `node scripts/gui-unopened-approval.mjs` passes end to end | Server team |
| 2   | `/api/files` source-message field (#15) | The deployment has no source field                                                      | Server adds the field or the gap is explicitly moved out of scope                                   | Server team |
| 3   | Unconfigured-model environment (#16)    | The API cannot construct the state                                                      | Server configuration path or explicit scope-out                                                     | Server team |
| 4   | Plugin-disabled state (#17)             | No real deployment evidence; the headless backend returns 404                           | Server provides the state or the gap is moved out of scope                                          | Server team |
| 5   | M6 group chat implementation            | Scope approved; read-only `groups.list` bridge landed; roster UI and state/log are next | Read-only roster and group state/log verified, then send/receive and approvals                      | Lead        |

## 4. Already verified

- M0a visual baseline (user-confirmed 2026-11-09), M0b protocol/capability matrix.
- M1 login, roster/history, streaming chat, approvals, notification banner, window lifecycle, drafts; the cross-client receipt is
  the remaining M1 blocker (#19).
- M2 creation/appearance/organizing; M3 workbench reads/writes and stale-response isolation; M4 attachments/artifacts and computer
  viewer/control.
- M5 performance/soak/accessibility, local install/upgrade, ad-hoc signed ZIP (329,655,212 B, SHA-256
  `7dbecfea52e1e4d92928d9c36805afea3477caa51d2c78ac9cb722e50adabbbc`), release notes and support matrix.
- M6 capability probe: `groups.capabilities` and `groups.list` pass; voice wake is unavailable on this headless deployment.
- Automated checks: `vitest` 175 passed, `test:e2e` 21 passed, typecheck/lint/format green.

## 5. Re-verification commands

```bash
npm run typecheck && npm test && npm run test:e2e
node scripts/gui-unopened-approval.mjs
node scripts/gui-pending-open.mjs
MOSBOT_DASHBOARD_URL=http://192.168.2.171:9119 MOSBOT_PROBE_MODE=ws npm run test:integration
```

## 6. Why "first release complete" cannot be claimed yet

1. M1 #19: cross-client approval receipt still fails; the server needs to apply/route the settlement.
2. The server gaps #15/#16/#17 need a decision or server work.
3. M6 group chat is approved for first release and its read-only roster/state/log implementation is still in progress.

M5 user acceptance (second Mac, seven-day dogfooding) is no longer a blocker by user decision.

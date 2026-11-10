# MosBot Desktop 0.1.0 · Release notes (release candidate)

[简体中文](release-notes-0.1.0-zh.md)

- Version: 0.1.0 · source commit `f2b86d6`
- Status: **release candidate, not a final release.** On 2026-11-10 the user moved the M5 user acceptance items (second-Mac clean install, seven-day dogfooding) out of first-release scope. Remaining: the server-side gaps #15/#16/#17 and M1 #19; M6 group chat is now in first-release scope and implementation has started.
- Date: 2026-11-09

## Artifact

| Item       | Value                                                                |
| ---------- | -------------------------------------------------------------------- |
| File       | `out/make/zip/darwin/arm64/MosBot-darwin-arm64-0.1.0.zip`            |
| Size       | 328,802,141 B (about 314 MB)                                         |
| SHA-256    | `56a19b77aabb5e66cd5f1efd503511e49349d2aa47e2aa3b96cfcb8b444d26f9`   |
| Signature  | ad-hoc (`codesign --verify --deep --strict` passes; `spctl` rejects) |
| Built from | `f2b86d6` on macOS 15.8.2, Apple Silicon arm64                       |

The source after this commit includes probe-only diagnostics (`88415d0`); they do not change the shipped UI and are not part of the ZIP above.

## Tested environment and support matrix

| Item                  | Status                                                                                                |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| macOS 15.8.2 (24H232) | ✅ tested on Apple M4 (`Mac16,10`)                                                                    |
| Apple Silicon arm64   | ✅ built and tested                                                                                   |
| Intel x64             | ⏳ not built or tested                                                                                |
| Minimum macOS         | ⏳ not declared; M0b did not freeze a minimum version, so this release claims only the tested version |
| Backend               | `192.168.2.171:9119`, v0.22.5 / `bf0203a794`, Dashboard API only                                      |
| Signing               | internal ad-hoc; no Developer ID/notarization (known limitation)                                      |
| Second Mac / new user | Out of first-release scope by user decision (2026-11-10); not tested                                  |

## Included in this candidate

- M0a design slice and the frozen visual baseline (user-confirmed 2026-11-09).
- M0b real-service probe and capability matrix; M0c reference lease patch (not deployed, out of first-release scope).
- M1 real sign-in, roster/history, streaming chat, approvals, background notifications, window lifecycle, drafts.
- M2 Bot creation, model readiness, appearance, sections, pins and search.
- M3 Hermes workbench: profiles, sessions, Kanban reads/writes and stale-response isolation.
- M4 attachments/artifacts and the computer viewer with control acquire/return.
- M5 performance, soak, accessibility, local install/upgrade and the ad-hoc signed ZIP.
- M6 group chat is now in first-release scope; the read-only roster bridge (`groups.list`) has landed and the first UI slice is in progress. Voice recording/transcription remains separate until a capable deployment/device is available; probe results in `m6-capability-probe.md`.

## Install and upgrade

1. Unzip the artifact and move `MosBot.app` to `/Applications` (or another writable location).
2. The first launch on another Mac needs right-click → Open because the build is ad-hoc signed.
3. Sign in through the system browser OAuth flow; credentials stay in the macOS Keychain via `safeStorage`.
4. To upgrade, quit the app, replace `MosBot.app`, and relaunch. Local state upgrades in place (v1 → v2); a corrupt document falls back to the backup instead of showing defaults.

## Known limitations

- **Gatekeeper / Developer ID**: the build is ad-hoc signed; `spctl` rejects it and a second Mac needs right-click → Open. No notarization ticket.
- **Computer non-preemptive lease**: out of first-release scope. A later viewer can take over; the client correctly shows "someone else is controlling" and returns to read-only when kicked.
- **Artifact source field**: `/api/files` has no source-message field, so the library cannot show which message produced an artifact (Issue #15).
- **Plugin-disabled state** and **unconfigured-model environment** are not verified on the deployment (Issues #17 and #16).
- **Distribution format**: ZIP only, no DMG.
- **M5 user acceptance**: second-Mac clean install and seven-day dogfooding were moved out of first-release scope by the user on 2026-11-10.
- **M6**: group chat is in first-release scope and is being implemented; the read-only roster bridge has landed, while send/receive and voice are not yet part of this candidate. Voice wake is unavailable on this headless deployment.
- A real pointer click after the notification-click fix has not been repeated; the exact IPC handler is covered by `scripts/gui-pending-open.mjs`.

## Verification summary

- `vitest` 173 passed; `npm run test:e2e` 21 passed; typecheck/lint/format green.
- 10-minute streaming performance gate and 60-minute soak passed.
- Local clean install from the ZIP with a fresh userData passed; only the expected Developer ID/Gatekeeper check failed.
- Real-service probes cover auth, WS, roster/history, workbench, computer, attachments and notification click.

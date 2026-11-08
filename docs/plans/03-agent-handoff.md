# Agent Execution Handbook

This document is for task handoff in a new chat or implementation branch. Deliver M0a/M0b first, establish M0c from the probe results, then advance M1–M5. Card status is not started, in progress, blocked, or accepted; stating a blocker is not the same as completing it. M6 is scheduled independently.

## Ready to Hand to the Main Agent

> Rebuild MosBot Desktop from scratch in `~/dev/MosBot_Desktop`. Read the four plans in this directory, use `docs/scratch/录屏2026-11-03 19.25.26.mov` as the UI reference, and take brand assets from `~/dev/MosBot`. Start with the M0a runnable window and the M0b probe of the designated real service; freeze the UI after user acceptance. Real integration pins `192.168.2.171:9119` and OAuth, with writes limited to test objects dedicated to this round. When a required capability is found missing, establish an M0c fix task; do not close cards through hidden or degraded paths. Deliver the complete first version only after new-Bot authorization through first reply, file delivery, background alerts, the workbench, non-preemptive computer takeover, and M5 install/upgrade and 7-day daily-use acceptance. Attach reproduction commands, evidence, owners, and unresolved items to each card.

Before starting, check the directory, current Git state, and permissions, preserving other changes and the original recording. `docs/plans` is tracked in Git; recordings, caches, credentials, and raw real-integration data stay excluded. The Main Agent exclusively owns root build config and shared-type writes, pinning dependency lockfiles per the overall plan; follow AGENTS.md to verify and commit in phases and update the bilingual changelog, without pushing on its own. This plan revision does not mean M0 has been implemented.

## M0a · Operable UI Slice

- **Starting point** is the recording's states at 00:42, 00:46, 01:04, 01:24, 02:03, and 02:14. First accept the two-column ratio in a real Electron window of about 1000 × 760, then verify the overlay details column at 720 × 500.
- **Deliverables** include normal start scripts, the real MosBot wordmark and BotFace, layout, redacted fixtures, and browser/Electron automated test entry points. Fixtures cover at least two sections, six pinned slots, an extra-long Chinese name, an empty conversation, a long reply, offline, permission confirmation, and computer sleep. Selecting Bots, collapsing sections, search-then-navigate, opening and closing details, and live shape/color changes are all operable.
- **Completion gate** is cropped screenshots, keyboard/IME verification, a short interaction recording, and conclusions from the user's actual trial. Record pending adjustments and re-verify; if not accepted, keep fixing the UI while independent work such as protocol and storage continues. Later M1/M4 connect to real responses, and M5 verifies the installer.

## M0b · Protocol and Deployment Probe

The only integration acceptance target is `192.168.2.171:9119`, using system-browser OAuth. First confirm version, scheme, prefix, identity, permissions, and plugins read-only; the address policy follows the exact test-origin rules in 02. Create a dedicated profile, board/tasks, and test files marked for this round, record object ids, and clean up only this round's objects. When login is needed, the user enters it in the browser; tokens are stored securely and never appear in reports. Do not start a replacement Dashboard or mock server, and do not modify global plugins or the active profile, or restart shared services, to fake failures. Local network loss, client process restarts, and two-client races may be used for real exception acceptance; deployment changes first complete a reviewable patch, impact, and rollback notes, then execute within that round's authorization.

| Probe order | Results the probe must leave behind |
| --- | --- |
| 1. REST liveness and auth | `/api/health`, `/api/status`, provider list, browser callback, code exchange, `/api/auth/me`, refresh, and sign-out; the full OAuth chain on the designated service must be recorded, including cancellation, refresh expiry, and re-login. Record version, whether identity matches, prefix, and proxy behavior. Save only redacted field shapes |
| 2. WS and existing Bot | One-time ticket handshake, expiry and reuse rejection, `gateway.ready`, `profiles.list`, exact Bot Chat query, resume, first real delta, stop, persistent history read-back. Record which events carry turn ids or message ids |
| 3. New Bot and two clients | First walk through authorization, model choice, real first reply, and restart-continued chat on a new Bot that does not inherit credentials; then have two processes do lookup/create/title at the same time. Create at least one title conflict or pending, confirming each stored id, the winning record, prompt ownership, and visible history. Repeat with two ends on the same account doing resume, disconnects, and approvals, verifying whether the other end can keep observing, stopping, and answering requests |
| 4. Workbench | List/details/pagination/search and model-configuration read-back for isolated profiles; the Kanban board snapshot and cursor plus test card creation/status updates when available. Old events must not update a new board when switching; record missing plugins as blockers without changing global state |
| 5. Files and background | Upload an image/file and have the model actually read it; after generating artifacts, paginate the index, preview, save, and open externally. Also verify approvals for unopened Bots, cross-end handling, denied notifications, closing the main window and reopening from the Dock, quit/restart, and re-login |
| 6. Computer | Capability, status, wake, thumbnail, RFB handshake, viewing, lease acquire and release. Verify two-viewer contention and disconnect fallback to read-only, and record whether the target deployment can guarantee concurrency safety between lease checks and acquire |

**Deliverables** are a rerunnable probe, redacted fixtures, and `docs/evidence/capabilities.md`. Each row contains "capability / local and deployment versions / request result / required or extension / verified, pending, or missing / owner / dependency card / closing evidence". Capabilities may be accepted in batches; once the existing Bot path passes, M1 can proceed; all required gaps go to M0c and must not be deleted from the table to pass acceptance.

## M0c · Backend Dependency Closure

The Main Agent is accountable for the delivery and, when starting, fills in the actual owner and dependency card for each item. The protocol owner determines differences and the minimal compatibility contract, the implementation owner delivers adapters or backend patches, and the test owner re-verifies on the designated deployment. When roles are unavailable, the Main Agent takes them over and records it; nothing is left unowned.

| Dependency | Current basis and resolution deliverable | Closing condition |
| --- | --- | --- |
| Non-preemptive computer control | In local `c419cf7c86`, acquire is last-writer-wins; add server-side atomic conditional claim, conflict receipt, and compatibility probe. Deployment state is measured by M0b | On the designated service, only one of two concurrent viewers succeeds; the loser cannot input or release the winner's lease, disconnects and late receipts behave correctly; closes the M4 blocker |
| New Bot usability | Verify profile-targeted authorization/model configuration and canonical title claim; if missing, add configuration entry, state read-back, or claim capability | A clean new Bot completes a real first reply, two-client races do not double-send, restart continues the chat; closes the M1/M2 blockers |
| Artifact delivery | Verify artifact metadata with provenance and authorized download; if missing, add backend resource references or a verifiable adapter | Real artifacts can locate their source, be saved and opened, and cross-profile access is rejected; closes the M4 blocker |
| Background requests and workbench | Verify pending-request discovery across all Bots and necessary capabilities such as Kanban; if missing, provide protocol/plugin deployment compatibility | Requests for unopened Bots can be handled, cross-end receipts sync, workbench writes are read back; closes the M1/M3 blockers |

Each item keeps the missing evidence, patch location, minimum compatible version, deployment impact/rollback, and re-verification command. A patch that is complete but not yet deployed or re-verified remains blocked. For backend dependencies that cannot be modified, the Main Agent submits a concrete scope decision; only after the user explicitly changes the first-version scope can it be removed; independent tasks continue meanwhile.

## Implementation Order and Blocker Handling

| Card | Work order and concrete delivery gates |
| --- | --- |
| M1 · Chat | Real login, roster, history, and replies → recovery/approval/stop → all-Bot alerts and window lifecycle → draft persistence. Acceptance passes for existing Bots, switching Bots, close/reopen, and disconnect reconciliation; jointly verify new-Bot first send with M2 |
| M2 · Creation and organization | Create profile → CAS appearance → original-profile authorization/model configuration → state read-back → canonical claim → real first reply → restart continuation; then verify sections/pinning/search, partial success, and concurrency conflicts. When unconfigured, keep the steps and draft; do not mark it done |
| M3 · Hermes workbench | The three subpages use real REST directly, and Kanban uses real WS cursor reconnects. Demonstrate configuration or state writes and read-back with isolated test objects, and verify the main UI restores the original chat. A disabled plugin shows a dedicated empty state while other pages still work |
| M4 · Details and computer | File upload/artifact index → preview/save/open → computer status/wake/view → non-preemptive takeover/return. Delivering the read-only window first can count as progress, but closing M4 requires the complete real path and M0c closing evidence |
| M5 · Release and daily use | Performance and bilingual/appearance/keyboard regression → signing and notarization → clean-install full flow → in-place upgrade from the previous beta and migration-failure recovery → 7 consecutive days of real daily use → final user acceptance. Record results for each item separately |
| M6 · Group chat and voice | Schedule, implement, and accept separately based on their own M0b capability proof. Group chat and recording keep their original entry hierarchy per the reference recording |

**Parallelization** is visuals and protocol first, with the Main Agent unifying interfaces. After M0a passes, expand the full UI; M1 and M2 collaborate on the frozen contract; M3 reuses M2's configuration logic; M4 waits for the corresponding capabilities; M5 closes only after M1–M4 are all accepted. Real login, service writes, GUI recording, and signing are serial. Blockers must record the owner, next action, and re-verification condition while independent work continues.

## M5 Delivery Checklist

- Provide a versioned signed installer, checksums, the supported macOS/architecture/backend matrix, release notes, and known limitations; do not claim support for versions not verified on the real deployment.
- Root `README.md` (English) and `README_zh.md` (Chinese) cover installation, OAuth connection, model configuration, notifications, file saving, manual in-place upgrade, recovery, and feedback channels. The bilingual changelog stays in sync; plan, test and evidence documents are bilingual too (English primary file at the canonical path plus a `_zh` Chinese counterpart).
- `docs/evidence/acceptance.md` indexes commands, versions, results, and redacted evidence for each README acceptance item, distinguishing fixtures, the real service, the signed installer, and user acceptance. Degraded tests for missing service capabilities only prove exception handling.
- 7 consecutive days of actual use include real chat, approvals, artifacts, the workbench, the computer, sleep recovery, and restarts; record results each day. No data loss, duplicate sends, unauthorized operations, or unresolved blockers; after fixes, retest affected flows, and restart the consecutive observation after reliability fixes.
- Deliver only after all required items pass and the user completes final operational acceptance; do not label a build still missing credentials, service capabilities, signing, or user acceptance as a complete first version.

## Minimum Evidence Format for Submission

Establish stable script names for the repository, suggested: `pnpm dev`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm test:contract`, `pnpm bench:stream`, `pnpm make`. These scripts are actually provided by their respective phases. Also provide `pnpm test:integration` as the real-integration entry, with test address and identity injected through environment configuration. Passing test logs must state whether they ran against fixtures, the real service, or the installer.

Each handoff includes the card number, change scope, reproduction command, environment and versions, results and evidence paths, and the next card or blocker condition. Check the main paths with at least the following assertions.

- After sending in an existing Bot Chat, refreshing reads back one user message; the same persistent session is opened from another end; a reply while offline continues, reconnecting recovers, and Stop is reachable.
- Two clients of the same new Bot race for the title; any candidate must pass persistent confirmation before submission is allowed; pending or conflicting clients keep the draft.
- Late messages, authorization results, and attachments from Profile A never write into Profile B; old events are invalid after sign-out and account switch.
- Kanban status changes have server read-back, and after switching boards, replay is limited to the original cursor range; the computer viewer's control state matches the server lease.
- Approvals for unopened Bots can be discovered, and receipts sync after the other end handles them; background notifications do not duplicate, and old notifications after sign-out cannot open another account's data.
- Real attachments and artifacts remain accessible after reconnect/restart; in-place installation of a new version preserves drafts, sections, and preferences, and migration failure is recoverable.

# M1 · Chat Vertical Slice · Acceptance Summary

[简体中文](m1-summary-zh.md)

- Card: M1 (login, existing Bots, sending, Markdown, history pagination, approval/clarification, stop, recovery, background reminders, draft persistence)
- Status: **Code implementation complete and passing automated verification; the macOS notification banner/click is verified. Remaining: a real NIC disconnect and a real pointer click after the click fix.**
- Recorded: 2026-11-09 (history: 2026-11-04)
- Target service: `192.168.2.171:9119` (v0.22.5 / `bf0203a794`)

## Against Acceptance Items

| Acceptance item                                                                   | Status                               | Evidence                                                                                                       |
| --------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Real login (system browser + PKCE) and silent restore                             | ✅                                   | `m1-first-connection.md`, `capabilities.md`                                                                    |
| Existing Bot roster and Bot Chat history                                          | ✅                                   | `m1-roster-and-history.md`                                                                                     |
| Sending, streaming delta, Markdown, stop                                          | ✅                                   | `m1-chat-streaming.md` (real probe: delta, complete, interrupted)                                              |
| History pagination (load earlier)                                                 | ✅                                   | `m1-roster-and-history.md` (real: older=16, nextOffset=100)                                                    |
| Approval/clarification cards and replies by request id                            | ✅                                   | real request/deny/allow/receipt verified in `m1-background-approvals.md`                                       |
| Disconnect recovery and event replay                                              | ✅ implemented + injected unit tests | real offline scenario to be constructed                                                                        |
| Background discovery of pending requests for unopened Bots + system notifications | ✅                                   | real banner 2026-11-09; click fix + regression `scripts/gui-pending-open.mjs`; see `m1-notification-visual.md` |
| Draft/selection/right panel/preference persistence                                | ✅                                   | restart E2E `persistence.spec.ts`                                                                              |
| Work log grouping                                                                 | ✅                                   | `m1-chat-streaming.md`                                                                                         |
| Dual-end simultaneous observation/stop/approval                                   | ⏳ partial                           | title race and canonical verified in M0b; dual-end chat observation needs dedicated construction               |

## 2026-11-04 Real-Service Re-run

The auto-cleaned dedicated-profile `chat` probe passed again: sending, first delta, final state, stop, attachment upload and model reading, artifact indexing (with real `mtime`) and reading all pass; approval still not triggered naturally (the deployment auto-allows terminal tools, `approval_mode=unknown`), listed as an open item. Report: `docs/evidence/tmp/dashboard-chat-2026-11-04T06-39-26-736Z.json`.

## Automated Verification

- `pnpm test`: 173 cases (protocol, transport, PKCE, credentials, RPC, chat, persistence, pending watcher, pending-open, Markdown)
- `pnpm test:e2e`: 21 cases (M0a slice + M5 accessibility + restart persistence + upgrade)
- `pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `pnpm package`: pass

## Open Items

1. Real NIC disconnect/replay: the reconnection and `session.events.since` catch-up are covered with a simulated socket drop; a real network disconnect has not been constructed.
2. A real pointer click after the notification-click fix has not been repeated; the exact IPC handler is covered by `scripts/gui-pending-open.mjs`.
3. Dual-client observation/stop/approval has dedicated evidence (`m1-dual-client.md`, `m1-concurrency-and-crash.md`); no blocker remains for M1.

The above does not block starting M2; M2's create and organize capabilities proceed in parallel with M1 and are verified together before M5.

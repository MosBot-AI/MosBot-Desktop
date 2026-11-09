# M1 · Chat Vertical Slice · Acceptance Summary

[简体中文](m1-summary-zh.md)

- Card: M1 (login, existing Bots, sending, Markdown, history pagination, approval/clarification, stop, recovery, background reminders, draft persistence)
- Status: **Code implementation complete and passing automated verification; two real-world conditions await re-verification** (real manual approval trigger, real offline replay)
- Recorded: 2026-11-04
- Target service: `192.168.2.171:9119` (v0.22.5 / `bf0203a794`)

## Against Acceptance Items

| Acceptance item                                                                   | Status                                                      | Evidence                                                                                                 |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Real login (system browser + PKCE) and silent restore                             | ✅                                                          | `m1-first-connection.md`, `capabilities.md`                                                              |
| Existing Bot roster and Bot Chat history                                          | ✅                                                          | `m1-roster-and-history.md`                                                                               |
| Sending, streaming delta, Markdown, stop                                          | ✅                                                          | `m1-chat-streaming.md` (real probe: delta, complete, interrupted)                                        |
| History pagination (load earlier)                                                 | ✅                                                          | `m1-roster-and-history.md` (real: older=16, nextOffset=100)                                              |
| Approval/clarification cards and replies by request id                            | ✅ implemented + unit tests                                 | real request not triggered (deployment auto-allows echo-like commands), awaiting natural re-verification |
| Disconnect recovery and event replay                                              | ✅ implemented + injected unit tests                        | real offline scenario to be constructed                                                                  |
| Background discovery of pending requests for unopened Bots + system notifications | ✅ implemented + unit tests; GUI really shows "Pending · 1" | system notification banner and click still need the user present; cross-client receipts pending          |
| Draft/selection/right panel/preference persistence                                | ✅                                                          | restart E2E `persistence.spec.ts`                                                                        |
| Work log grouping                                                                 | ✅                                                          | `m1-chat-streaming.md`                                                                                   |
| Dual-end simultaneous observation/stop/approval                                   | ⏳ partial                                                  | title race and canonical verified in M0b; dual-end chat observation needs dedicated construction         |

## 2026-11-04 Real-Service Re-run

The auto-cleaned dedicated-profile `chat` probe passed again: sending, first delta, final state, stop, attachment upload and model reading, artifact indexing (with real `mtime`) and reading all pass; approval still not triggered naturally (the deployment auto-allows terminal tools, `approval_mode=unknown`), listed as an open item. Report: `docs/evidence/tmp/dashboard-chat-2026-11-04T06-39-26-736Z.json`.

## Automated Verification

- `pnpm test`: 130 cases (protocol, transport, PKCE, credentials, RPC, chat, persistence, pending watcher, Markdown)
- `pnpm test:e2e`: 11 cases (M0a slice + connection sheet + restart persistence)
- `pnpm typecheck` / `pnpm lint` / `pnpm format:check` / `pnpm package`: pass

## Open Items

1. Real manual approval: the deployment auto-allows `echo`-like commands; need a command that triggers manual confirmation or temporarily adjust that profile's approval policy (without changing global config).
2. Real offline replay: need to disconnect the local network and observe reconnection and `session.events.since` catch-up.
3. System notification display and click: need the user present to trigger an approval once and observe macOS notification permission/banner.
4. Dual-client observation, stop, and approval behavior when both open the same running Bot Chat (remaining part of M0b steps 3/5).

The above does not block starting M2; M2's create and organize capabilities proceed in parallel with M1 and are verified together before M5.

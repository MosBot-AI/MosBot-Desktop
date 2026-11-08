# M1 · Local State Persistence and Disconnect Replay · Evidence

- Card: M1 (draft persistence, disconnect recovery)
- Status: **Draft/selected Bot/right-panel/language-appearance persistence implemented and verified by restart E2E; disconnect replay implemented and covered by unit tests**; replay after a real network drop has not been constructed against a live service
- Recorded: 2026-11-04

## Local State Persistence

- Main process writes `userData/local-state.json` (version 1) single-writer: per connection (`displayUrl`, `fixture` for fixture) it saves `selectedProfile`, drafts, right panel (open/tab/width); globally it saves theme and language.
- Write path: temp file + atomic rename; backs up to `local-state.json.bak` before overwrite; corrupt files are treated as empty; refuses to write when a higher `version` is detected (no downgrade overwrite).
- IPC: only accepts the app's own top-level frame; validates structure, draft count/length, and the 2 MB limit.
- Renderer: reads and hydrates on startup; subscribes to the store and writes with a 600 ms debounce; flushes immediately on window `beforeunload`; re-hydrates with the new key when switching connections. Fixture and real connections are independent.

## Disconnect Replay

- `ChatManager` records the `replay_epoch` from `gateway.ready` and the `seq` of each event:
  - after reconnect it first `session.resume`, then `session.events.since {session_id,last_seen}` to replay missed increments;
  - dedupes by `seq` (duplicate frames are not applied twice); `latest_seq` advances the watermark;
  - on `truncated` or a changed `replay_epoch` it emits `history-stale`, and the renderer refetches history pages and resets the live segment;
  - `open_requests` (unanswered approvals/clarifications) in the replay result are re-delivered to cards so questions do not disappear after a disconnect;
  - if `resume` shows the turn is still running, it re-sends `turn-start` so Stop is available.
- Events are filtered by `session_id` to avoid cross-session mixing.

## Verification

| Check                                                | Result                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | Pass                                                                                                                            |
| `pnpm test`                                          | **127 cases pass** (new 4 local store, persistence projection/hydrate, replay dedupe and open_requests re-delivery)             |
| `pnpm test:e2e`                                      | **11 cases pass**, new `persistence.spec.ts`: select Bot + type draft → fully quit → restart, selection and draft both restored |
| Package                                              | `pnpm package` passes                                                                                                           |

## TODO

- Construct a real network drop on the live service (e.g. disable the network interface) to verify replay; replay is currently covered by injected-gateway unit tests.
- Persistence of unread position, attachment metadata, and pending-action ids will be added with M1/M4 follow-ups.
- The schema migration path only has version 1; add migration and failure-recovery tests when introducing version 2.

## 2026-11-04 Real-Connection Cold Start + Draft Restore

`scripts/gui-connected-draft.mjs` (packaged artifact + real service + dedicated Bot):

| Check                                           | Result                         |
| ----------------------------------------------- | ------------------------------ |
| Type a draft in the dedicated Bot (do not send) | ✅                             |
| Fully quit and restart                          | ✅                             |
| Cold start restores to the same Bot Chat        | ✅                             |
| Draft text restored as-is                       | ✅ `真实连接下的草稿-请勿发送` |

Report: `docs/evidence/tmp/connected-draft-2026-11-04T10-12-40-182Z.json`. This fills the earlier gap of "cold-start landing and draft restore under a real connection"; unread position across weeks is still unverified.

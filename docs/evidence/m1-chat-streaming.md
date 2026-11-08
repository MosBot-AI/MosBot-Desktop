# M1 · Real Sending, Streaming Replies, and Stop · Evidence

- Card: M1 (chat vertical slice)
- Status: **Send / streaming delta / final state / stop / approval and clarification cards / auto-reconnect implemented**; real approval triggering and disconnect replay still need dedicated construction and verification
- Recorded: 2026-11-04
- Data source: real Dashboard `192.168.2.171:9119` (v0.22.5 / `bf0203a794`); writes target only this round's `mosbot-chat-probe-<timestamp>` dedicated profile, deleted afterward
- Privacy: real reply bodies and session ids do not enter the repo; this file records only states and counts

## Implementation

- Main-process `ChatManager`: persistent Gateway connection (one-time ticket), `session.resume`/`session.create` + title claim, `prompt.submit`, `session.interrupt`, `client.capabilities {server_requests:true}` (actually returns 16 server request methods, including approval/clarify); normalizes `message.start|delta|interim|complete`, `tool.*`, `error`, `request.cancel` into renderer events, delivered one-way over IPC.
- Server requests: `approval` (choices: once/session/always/deny) and `clarify` (questions/choices) are presented as in-chat cards; answers are sent back over the same connection by request id. Other prompt types that cannot be rendered automatically return an empty value, avoiding agent hangs.
- Disconnect: after the socket closes, reconnects with 1/2/4/8/15 s backoff and `session.resume` on the same persistent session; the renderer shows "Connection interrupted, recovering…"; on successful reconnect live increments resume.
- Renderer: after sending, a local optimistic user bubble → streaming increments merge into a single Bot bubble → final state settles; "Stop" is shown while sending/streaming; approval/clarification cards fold into receipts after handling; connection errors show a banner.
- Work log: `tool.start/generating/complete` within the same turn merge into one expandable "Work log" (even if text segments are interleaved, they are merged into the same entry), avoiding per-tool noise interrupting the body; unit tests cover grouping order and dedupe.
- Markdown: renders headings, paragraphs, bold/italic, inline code, code blocks, lists, quotes, tables, horizontal rules, and links using `marked.lexer` tokens; raw HTML in messages is output as text only and is not injected; only `https:` links are clickable, opened via the main process `shell.openExternal`, and `http:`/other protocols are shown as plain text.

## Verification

| Check                                                | Result                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | Pass                                                                                                                                                                                                                                                   |
| `pnpm test`                                          | 112 cases pass (new ChatManager, event mapping, live transcript, approval/clarification card mapping)                                                                                                                                                  |
| `pnpm test:e2e`                                      | 10 fixture cases pass                                                                                                                                                                                                                                  |
| Real chat probe `MOSBOT_PROBE_MODE=chat`             | dedicated profile: open session ✅ → `prompt.submit` accepted ✅ → first `message.delta` ✅ → `message.complete status=complete` ✅ → second prompt interrupted after 500 ms via `session.interrupt`, final state `interrupted` ✅ → delete profile ✅ |
| Runtime observation                                  | The same-round `/api/status` once exceeded the 10 s timeout, then a separate retest took 0.7 s, judged as transient deployment load; the rest of the probe steps were unaffected                                                                       |

## TODO

- Real approval/clarification triggering and cross-client receipts: need a command that triggers manual approval (the current deployment auto-allows); add evidence when conditions allow.
- Disconnect replay (`session.events.since`) and background long-reply recovery.
- Work log (`tool.*` grouping), full Markdown rendering (M1 follow-up).
- User hands-on acceptance: send a message in the app and observe streaming and stop.

## 2026-11-04 Disconnect Replay (simulated socket drop, hidden window)

`scripts/gui-chat-reconnect.mjs` (`MOSBOT_DIAG=1` exposes the test-only `dropSocket()`; E2E/scripts hide the window by default):

| Check                                                                                     | Result |
| ----------------------------------------------------------------------------------------- | ------ |
| Received a real reply before the drop                                                     | ✅     |
| Auto-reconnect after closing the gateway socket (disconnected → reconnecting → connected) | ✅     |
| Existing transcript preserved after reconnect                                             | ✅     |
| New messages after reconnect still get real replies                                       | ✅     |
| Replay did not duplicate the message list                                                 | ✅     |

Report: `docs/evidence/tmp/chat-reconnect-2026-11-04T11-08-10-611Z.json`.

Note: this is a **simulated** socket drop (test seam), not a real network-interface drop; real network replay still needs a reproducible offline environment.

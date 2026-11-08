# M1 · Real Roster and Bot Chat History (read-only) · Evidence

- Card: M1 (first stage of real data integration)
- Status: **After connecting, roster and history are read from the real Dashboard and rendered**; history pagination implemented; sending/streaming/stop see `m1-chat-streaming.md`
- Recorded: 2026-11-04
- Data source: real Dashboard `192.168.2.171:9119` (v0.22.5 / `bf0203a794`)
- Privacy: real roster/conversation content does not enter repo screenshots; this file records only counts and redacted ids; raw reports are in `docs/evidence/tmp/` (Git-ignored).

## Implementation

- Main process adds `listBots()` and `openChat(profileName)`:
  - roster: Gateway `profiles.list {include_sessions:true}`, mapping `name/display_name/description/model/provider/is_default/canonical_session/last_session`.
  - history: exact query `session.list {profile,title:"Bot Chat",include_hidden:true}` → `GET /api/sessions/{storedId}/messages?limit=50&order=latest&inline_images=false`.
  - read-only mapping: only messages with `role=user|assistant` and text enter the transcript; tool/system lines and image data URIs do not enter the UI.
- After a successful connection the renderer automatically:
  1. loads the real roster and replaces the fixture roster (pins take the first 6, sections shown as a single `Bots`);
  2. selects the `is_default` profile by default, loads its Bot Chat history, and renders it into the existing bubbles;
  3. wires the composer to real sending and streaming replies (see `m1-chat-streaming.md`);
  4. on the computer page, real mode does not offer a wake entry (before M4 integration).
- History pagination: the scroll area top offers "Load earlier messages", pages older by offset, dedupes and prepends while keeping the first visible message position; while loading the button is disabled and shows a state.
- After disconnecting it falls back to the design-sample fixture, and the M0a demo is unaffected.

## Verification

| Check                                                | Result                                                                                                                      |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | Pass                                                                                                                        |
| `pnpm test`                                          | 120 cases pass (including profile/message mapping, remote roster, pagination, Markdown)                                     |
| `pnpm test:e2e`                                      | 10 cases pass (fixture mode unaffected)                                                                                     |
| Real roster probe                                    | `MOSBOT_PROBE_MODE=roster`: 10 profiles, default exists, 10 with canonical session, default model `gpt-6-luna-900k`         |
| Real history probe                                   | Default profile's Bot Chat: 25 visible messages, `hasMore=true` (latest page)                                               |
| Real history pagination                              | `loadOlderChat` (offset 50) returns the earlier 16, `hasMore=true`, `nextOffset=100`; the UI button keeps the scroll anchor |
| Silent restore                                       | The probe restores login first, then reads, without re-entering input                                                       |

## TODO (next M1 stage)

- Sending (`prompt.submit`), streaming delta/tool events, stop, approval/clarification replies, disconnect recovery and replay.
- Real roster pinning/sections/unread (M2 organization), real appearance (ui_meta).
- Real-data screenshots and user acceptance (include only after redacted samples or user consent).

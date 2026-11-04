# Changelog

All notable changes to MosBot Desktop are documented here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html). Source
changes, built artifacts and installed/released builds are listed separately so a
build is never implied by a source change.

The repository has no published remote yet; comparison links are local anchors
until the release repository exists.

## [Unreleased]

### Added

- Artifact library: the workspace listing now understands the deployment's
  `mtime` (epoch seconds) instead of only `modified_at`, so files sort by real
  modification time; dangling symlinks (`broken_link`) show a "resource deleted"
  badge and cannot be opened; library failures map to deleted / no-permission /
  too-large / session-expired messages with a retry action. The deployment's file
  API has no source-message field, recorded as a capability gap.

- Electron Forge + Vite + React 19 + TypeScript (strict) baseline with a sandboxed,
  context-isolated main window (1000 × 760, minimum 720 × 500), denied navigation,
  no remote module, a strict production CSP and a narrow preload bridge.
- Design system for the Bot-first window: warm neutral shell, MosBot lime accent,
  4/8/12/16/24 spacing, 10–14 px radii, light and dark token sets and reduced-motion
  behaviour.
- Typed message tables (zh-Hans and en) with a parity test, locales resolved from the
  system and a footer switch that keeps drafts and scroll state.
- Roster sidebar: search entry, create entry, attention chip for pending requests,
  six pinned faces in a three-column grid, "all pinned" popover, collapsible sections
  with counts, unread badges, presence dots and the MosBot connection footer.
- Conversation column: centred nameplate that opens the details panel, transcript
  with user/Bot bubbles, grouped and collapsible work records, inline approval and
  clarify cards that fold into receipts, stopped-reply state, minimal safe text
  formatting (paragraphs, lists, fenced code, inline code) and a growing composer
  with IME-safe Enter, Shift+Enter and send/stop.
- Deterministic, desensitised design-slice fixtures (two sections, six pinned slots,
  a very long Chinese name, an empty chat, a long reply, an offline Bot, a pending
  approval and a sleeping computer) plus a fixture-only reply/wake pacing.
- On-demand details column (details/library/computer) with drag-resize and overlay
  mode, keyboard search overlay and a live-preview create-Bot dialog.
- Brand assets copied from MosBot@3c118c4 with recorded provenance and the
  `pnpm assets:sync` command; procedural BotFace geometry ported from the mobile
  client.
- Tooling: `pnpm dev`, `pnpm package`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`,
  `pnpm lint`, `pnpm format`, Playwright Electron smoke tests and evidence capture.
- Bilingual `README.md` / `README_zh.md` with requirements, run and check commands,
  layout, documentation index and the M0a limitations.
- Hover feedback on roster and pinned avatars: a delayed preview card (name, last
  summary, presence, last activity) plus a `listening` face reaction and a small
  lift, triggered by pointer hover or keyboard focus.
- M0b protocol foundation: dashboard URL policy (https everywhere, one exact
  plain-http test origin), zod-validated REST transport over Electron's network
  stack with timeouts, size caps and manual redirects; RFC 8252 PKCE sign-in with a
  loopback receiver and state validation; refresh-token vault encrypted with
  safeStorage (access tokens stay in memory); dashboard IPC bridge restricted to
  the app's own top-level frame.
- M0b probe: reproducible `pnpm test:integration` that packages the app, runs the
  unauthenticated REST probe, signs in through the system browser, then runs the
  authenticated probe and a local sign-out check; capability matrix in
  `docs/evidence/capabilities.md`.
- Silent sign-in restore from the safeStorage vault (`dashboard.restore`) so later
  runs and app launches need no repeated password entry; probe modes for preflight,
  restore, login, WS and all, with the session kept by default.
- First-connection surface and silent restore: the footer shows the real account,
  a dialog handles address preflight, provider choice, browser handoff and the
  connected summary, and a successful sign-in is remembered (refresh token in
  safeStorage, last address in non-secret settings) so later launches restore
  without retyping. Tokens never reach the renderer.
- Live chat over the gateway: prompts are submitted to the real Bot Chat, streamed
  deltas merge into one Bot bubble, Stop interrupts the turn, approval and clarify
  requests render as inline cards answered by request id, and a closed socket
  reconnects with backoff and resumes the stored session. Tool events from one turn
  collapse into a single expandable work log, and the client advertises
  `server_requests` (16 methods on the test deployment). Older history pages load
  from the top of the transcript with scroll anchoring, and replies render as
  Markdown (headings, lists, tables, code) with raw HTML kept as text and only
  https links clickable.
- Local state persistence: the main process owns a versioned `local-state.json`
  (atomic writes, previous-version backup, corrupt/newer-schema guards) holding
  per-connection drafts, the selected Bot and the details column, plus theme and
  language. The renderer hydrates on launch and saves with a short debounce and a
  close-time flush.
- Reconnect replay: the chat manager tracks the gateway replay epoch and event
  sequence numbers, replays `session.events.since` after resuming, de-duplicates
  by sequence, re-delivers open approval/clarify requests, and refetches history
  when the replay ring or epoch has moved on.
- Background approvals: a separate gateway watcher polls the live session list,
  attaches read-only to waiting canonical Bot Chats, surfaces their pending
  approval/clarify requests as an attention count, and raises one system
  notification per request when the window is not focused. Clicking the
  notification restores the window and opens that Bot.
- M2 create flow: the create dialog submits a real fresh profile
  (`no_skills`/`no_alias`, no inherited credentials), writes the chosen shape and
  colour through the `ui_meta['hermes-bots']` compare-and-swap, selects the new Bot
  and shows a "finish setup / check again" banner while the Dashboard reports the
  model as not ready. Remote rows now render the appearance and title stored in
  `ui_meta`, and the appearance write reports revision conflicts.
- M2 organisation: connected Bots can be pinned, grouped into named sections
  (create/rename/delete, move in and out, collapse), and edited (look and name)
  through the same CAS appearance write plus the REST rename. The arrangement,
  including collapsed sections, is stored in the local-state document, which is
  now schema v2 with automatic v1 migration.
- M3 workbench: a full-window Hermes workbench (footer menu) with Profiles,
  Sessions and Kanban pages. Profiles show the real roster and model readiness;
  Sessions page through `/api/sessions`, search and read transcripts; Kanban lists
  boards and renders the board snapshot with its `latest_event_id`, with dedicated
  empty states when the plugin is unavailable. The chat shell stays mounted, so
  returning restores the Bot, draft, scroll position and details column.
- Workbench writes: the Kanban page creates tasks and moves them between workflow
  columns (re-reading the board snapshot afterwards), and the Profiles page writes
  the default provider/model through `PUT /api/profiles/{name}/model` and reads
  readiness back.
- Kanban live events: each open board tails `/api/plugins/kanban/events` over its
  own WebSocket with a re-signed ticket per reconnect and cursor resume; a board
  switch closes the old watcher so late frames cannot touch the new board, events
  debounce a snapshot refetch, and a cursor that moves backwards resubscribes from
  the new tail.
- M4 first slice: the composer attaches files through the system dialog and
  `file.attach` (10 MB cap, removable chips, refs sent with the prompt) and real
  inference read the uploaded file back in a dedicated-profile probe. The computer
  tab polls `display.status`, shows the `display.thumbnail` preview (hidden while
  someone else holds the lease), and offers an explicit wake via `display.start`.
- Artifact library: the details library indexes the open Bot Chat workspace through
  `/api/files`, shows name/type/size, previews text and images from
  `/api/files/read` data URLs, and saves a chosen artifact into Downloads before
  opening it explicitly. Verified with a dedicated-profile probe where the Bot
  created a file that the index found and read back.
- Remote-computer viewer: `display.observe` mints a single-use RFB ticket and a
  server viewer id, and a separate window renders the screen through noVNC. The
  control bar shows view-only / you-are-controlling / someone-else-controlling,
  acquires and releases the display lease explicitly, follows lease broadcasts,
  and releases control when the window closes. Verified with a real probe
  (observe ticket, acquire holder=human, preview suppressed while held, release
  holder=agent).
- Details routines: connected Bots read `/api/cron/jobs?profile=` and list each
  job's name, schedule and disabled state instead of the fixture routines.
- Packaging: `pnpm make` now produces an unsigned macOS ZIP through the Forge ZIP
  maker (`out/make/zip/darwin/arm64/`). Signing, notarization, DMG and the clean
  install/upgrade checks follow once a Developer certificate is available. The
  package ignore list now excludes build outputs and dev-only dependencies
  (ZIP 347 MB → 312 MB). Fixture windows keep the offline demo.
- Gateway WebSocket client (`ws`): one-time ticket handshake, `gateway.ready` first
  frame, JSON-RPC request/response with zod validation, typed server events, and
  ticket replay/expiry rejection checks. Verified against the test deployment:
  `profiles.list`, `client.capabilities` and the exact Bot Chat lookup pass; replay
  and expired tickets are rejected.

- Stream coalescing: the chat manager merges deltas per turn in a clamped 16–32 ms
  window (24 ms default) with frame and byte caps, and flushes pending text before
  any control event, terminal status or connection change. This keeps transcript
  order without one process hop and React render per raw token.
- Streaming Markdown: an in-progress reply renders finished blank-line blocks as
  Markdown (parsed once, memoised) and only the growing tail as plain text, then
  switches back to the full Markdown pass at the terminal event; the transcript
  stops announcing every token to screen readers while a turn is streaming.
- Performance gate: `pnpm bench:pipeline` replays four channels of desensitised
  frames (JSON parse + coalescing) and fails on batch-age/queue/loss regressions;
  `pnpm bench:stream` launches the packaged app with an in-process frame replayer
  and checks frame→visible-text p95, a 5 s ×5 burst, achieved frame rates,
  10,000-message history, 20-sample send/switch feedback and DOM text completeness,
  recording heap/RSS curves. Evidence is in `docs/evidence/m5-performance.md`.

- macOS application menu: New Bot (`Cmd+N`), Search Bots (`Cmd+K`), Settings
  (`Cmd+,`), zoom in/out/actual size (`Cmd+=`/`Cmd+-`/`Cmd+0`), show the main
  window and the standard edit/window roles. Labels follow the interface language,
  and the footer settings menu moves focus into the menu and back to its button.
- Keyboard and accessibility regression (`tests/e2e/m5-accessibility.spec.ts`):
  menu commands open their surfaces with focus in the right field, zoom changes the
  page and resets without horizontal overflow, Enter during Chinese IME composition
  is left to the IME while Shift+Enter inserts a newline, reduced motion removes the
  timed transitions, every visible control has an accessible name and Tab reaches
  all main surfaces. Evidence: `docs/evidence/m5-gui-a11y.md`.

- Packaging and signing: `forge.config.js` enables Developer ID signing, hardened runtime and
  notarization from `MOSBOT_MACOS_SIGN_IDENTITY` / `MOSBOT_NOTARY_*`, with a minimal entitlements
  file; without a certificate the build stays an unsigned ZIP and is reported as such.
- `pnpm test:install` extracts the packaged ZIP into a temporary directory, launches it with a
  fresh userData directory and checks title, version, bundle id, the offline roster and the
  connection dialog; the report records size, SHA-256 and the ad-hoc/Developer ID signature state.
- Local-state resilience: a corrupt primary document falls back to the last good `.bak` and is
  preserved as `.corrupt` before the next save, and a newer schema is still never overwritten.
- Upgrade migration E2E: a schema v1 document from the previous test build keeps drafts, the
  selected Bot and the theme, upgrades in place to v2, and recovers from a corrupt document via
  the backup. Evidence: `docs/evidence/m5-install-upgrade.md`.

- README/README_zh now include the user guide for connecting and signing in, Bots,
  chats and approvals, files and artifacts, local data and manual upgrades, plus the
  current limitations instead of the stale M0a list.

- Signing was verified end-to-end with the machine's local Apple Development
  certificate (hardened runtime, minimal entitlements, `codesign --verify --deep
--strict`, signed ZIP launch). Developer ID signing and notarization still await
  a Developer ID certificate and notarytool credentials.

- 60-minute reconnect/idle soak (`pnpm bench:soak`): four channels through the
  real coalescer, 90 s cycles of streaming, idle and reconnect replay with a
  rolling-hash text check, per-cycle batch age/queue and RSS/heap sampling. The
  full run completed 40 cycles / 960,000 frames with a 25 ms worst batch-age p95,
  bounded queues and RSS +13.8 MB. Evidence: `docs/evidence/m5-soak.md`.
- The chat probe now also reports the artifact `mtime` it indexed and whether the
  entry is a broken link, so a real-service run verifies the new metadata mapping.

- Real-service re-run (chat probe, dedicated profile cleaned up): send, first
  delta, terminal, interrupt, attachment read, artifact index with a real `mtime`
  and artifact read all pass. The approval request still does not fire because the
  deployment auto-approves the terminal tool; recorded as open.

### Changed

- `pnpm test` now also covers protocol/URL policy, transport error taxonomy, PKCE,
  credential vault, loopback state validation and the full sign-in/probe flow
  (89 tests).
- The app's dev dependency on pnpm keeps Electron Forge's package-manager check
  reproducible without a global install.

### Notes

- Source only: no signed installer, upgrade path or real Dashboard connection exists
  yet. M0a uses fixtures for interface review; M0b/M1 replace them with the real
  service at `192.168.2.171:9119`.
- All chat content in screenshots is desensitised fixture data.
- The M0b probes were run against the test deployment (`192.168.2.171:9119`,
  v0.22.5 / `bf0203a794`): health, status, auth flows, providers, native authorize,
  browser sign-in, identity, refresh rotation, invalid-refresh handling, ws tickets,
  WS handshake, `gateway.ready`, `client.capabilities`, `profiles.list` and the exact
  Bot Chat query all pass; replayed and expired tickets are rejected. A real turn
  (delta/stop/resume) is still unverified; see `docs/evidence/capabilities.md`.

## [0.1.0] - 2026-11-03

### Added

- Initial M0a design-slice baseline (see Unreleased for the current contents).

[Unreleased]: ./CHANGELOG.md#unreleased
[0.1.0]: ./CHANGELOG.md#010---2026-11-03

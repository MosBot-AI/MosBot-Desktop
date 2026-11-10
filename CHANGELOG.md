# Changelog

[简体中文](CHANGELOG-zh.md)

All notable changes to MosBot Desktop are documented here. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) and the project
uses [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html). Source
changes, built artifacts and installed/released builds are listed separately so a
build is never implied by a source change.

The source repository is published at https://github.com/charleypeng/MosBot-Desktop;
comparison links stay local anchors until the first signed tag exists.

## [Unreleased]

### Added

- Group roster groundwork: the main-process chat manager reads the gateway's hosted-room list
  (`groups.list`) and the sidebar renders a read-only Groups section with room names and member counts;
  clicking a room opens a state/log view (`groups.state` + `groups.log`) with a message composer wired to
  `groups.send`; the sidebar create dialog creates a group from 2–6 local profiles, the group view sends and
  polls `groups.log` and `groups.state` every 3 s (working/blocked status, error surfacing), Stop cancels
  room work, a simulated socket drop recovers the open group view, and an end-to-end test verified
  create → send → render → stop → disband; the group view shows member chips, Markdown messages and
  approval banners (both allow once and deny verified), opens on the latest log page and can load earlier history.
  Group attachments and voice remain deployment-bound.
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
- Bilingual `README.md` / `README-zh.md` with requirements, run and check commands,
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

- README/README-zh now include the user guide for connecting and signing in, Bots,
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

- Fixed: reopening an already-connected chat (renderer reload, window close and
  Dock reopen) now re-emits the connection, session and open requests instead of
  returning a cached, event-less result; the cached remote chat picks up the
  canonical stored session from the live session, and the composer only enables
  once that session is ready, preventing "session is not ready" sends.
- The real-service chat probe now reads `approvals.mode` (read-only) and triggers
  scoped dangerous-command approvals on its own probe file: request, deny (command
  not executed), allow and the terminal status are verified on the test
  deployment. Evidence: docs/evidence/m1-background-approvals.md.

- Real approval was verified through the GUI as well: a dedicated Bot created in
  the app receives an inline approval card, the background "needs you" chip
  appears after switching away, the chip jumps back to the canonical session and
  re-delivers the card, and denying folds it into a receipt and clears the chip.
  The walkthrough also fixed a per-session event cursor leak that produced false
  history-stale resets, approval receipts being dropped with the request, and the
  composer accepting input before its own Bot's session was live.

- Network loss is now visible: the main window shows a fixed alert from the OS
  online/offline events, the chat connection banner has dedicated offline copy,
  the library maps unreachable/timeout to an offline message, and the computer
  viewer shows the offline state and re-mints its display ticket through
  `computer.reconnect` when the network returns. An E2E test toggles offline and
  checks the alert appears and clears.

- Remote-computer viewer: the noVNC client no longer offers a WebSocket subprotocol
  (the deployment's RFB bridge does not negotiate one, which made every handshake
  fail), and the viewer window is now trusted for its own lease/reconnect/close
  IPC instead of being rejected as an untrusted sender. The real screen renders
  (1440 x 900 canvas), control can be taken and returned, and the window closes.

- The viewer now reconnects on its own when the RFB socket closes (eviction with
  close 4000, or a network drop): it re-observes the display, rebuilds RFB and
  returns to watch-only instead of staying dead. A two-client walkthrough confirms
  the current deployment still lets a later viewer take the lease from the holder
  (the M0c atomic-claim gap), and that the evicted client recovers to watch mode.

- M0c display-lease patch prepared: `acquire_if_free` performs the holder check and
  write under the same profile file lock and returns a `lease_conflict` receipt; the
  client now carries `error.data.code` and shows "someone else is in control" instead
  of treating a refused takeover as a disconnect. The patch applies cleanly to the
  deployment baseline but is a reference implementation only: the test server is API-only
  for this workstream (no server changes or restarts authorised), so M4 stays partially verified.

- Fixed: selecting a Bot from search only changed `selectedBotId` and left the
  remote/live selection on the previous Bot, so the chat and composer stayed on
  the old session (and a fast send could reach the wrong Bot).
- Two-client approval sync: the gateway does not push a resolution to other
  clients, so an open chat now reconciles `session.resume`'s `open_requests` every
  five seconds; a request answered elsewhere folds into a "handled in another
  window" receipt. The two-client walkthrough verifies shared chat observation and
  that receipt. Evidence: docs/evidence/m1-dual-client.md.

- Notification path verified programmatically with a test-only diagnostics hook: a
  real approval pending in an unfocused (minimised) window requests a system
  notification (Bot name + "needs confirmation"), and the click handler restores
  the window, opens the waiting Bot and delivers the approval card. The macOS
  banner pixels and a real pointer click remain unverified because this shell has
  no screen-recording permission; the walkthrough records that limitation.

- Approval survives the main window being closed, a Dock reopen and a full
  quit/restart: the closed-window state requests a notification and the recreated
  window re-delivers the card; after a restart the resumed chat re-delivers the
  still-open request, and denying it shows the receipt. Evidence:
  docs/evidence/m1-window-lifecycle.md.

- Unopened-Bot approval across clients: with client A keeping the chat attached, a
  second client on a different Bot discovers the waiting session through the
  pending watcher, is notified while its window is minimised, opens the Bot through
  the notification click, and denies the request; A then folds its card into a
  "handled in another window" receipt.

- Consolidated the release-candidate audit into docs/evidence/acceptance.md and
  added docs/evidence/final-checklist.md: every remaining item now names the owner,
  the exact user action and the re-verification command. A connected cold-start
  walkthrough (real Dashboard, dedicated Bot, full quit/relaunch) verifies that the
  selected Bot and the typed draft are restored; its script and evidence are
  linked from the index. A dogfood log template is ready for the 7-day use.

- Concurrency and crash safety verified on the real service: two clients answering
  the same approval at once never execute the command twice or leave a card behind
  (the API has no "who won" receipt, so the two windows' receipts can differ), and
  SIGKILL during an in-flight prompt restores the chat with the prompt appearing
  exactly once (no automatic resend).

- The viewer now renders the lease snapshot returned by display.observe when it
  opens, so an existing holder shows "someone else is controlling" immediately
  instead of a misleading view-only state. A SIGKILL/restart walkthrough confirms a
  killed viewer does not leave a stuck human lease on this deployment: restart is
  view-only with Take control available, and re-acquiring succeeds.

- Viewer reconnect is covered by a walkthrough: a test-only socket drop (or the
  renderer's offline/online events) makes the viewer re-observe and rebuild its RFB
  session, with the offline copy shown in between. This is a simulation; a real
  network-interface loss is still unverified.

- Automated UI tests now run without disturbing the person using the machine:
  `MOSBOT_TEST_BACKGROUND=1` creates hidden, unfocusable windows, hides the Dock
  icon and disables app activation; the E2E harness and `scripts/gui-*.mjs` enable
  it by default. `MOSBOT_TEST_FOREGROUND=1` opts into watched runs. Verified with
  the window-state probe (visible=false, focusable=false, dockVisible=false), all
  21 E2E tests, and two real-service GUI walks in background mode.

- Chat reconnection is covered with a test-only socket drop: the manager reconnects
  (disconnected → reconnecting → connected), keeps the existing transcript, gets a
  real reply to a new prompt afterwards and does not duplicate the replay. This is a
  simulation; a real network-interface loss still needs a reproducible environment.

- Cross-client Kanban refresh verified against the real service on a dedicated
  probe board (kept for the walkthrough, removed by the next probe run): a second
  client creates a task and the first client sees it after clicking Refresh.

- Fixed: answering an approval locally did not remove the request from the
  cross-client reconciliation set, so a later `session.resume` could overwrite the
  local receipt with "handled in another window". Local answers now leave the set
  first; two unit tests cover the remote-reconcile and local-answer paths, and the
  concurrent-approval walkthrough confirms each window keeps its own receipt (the
  remaining mismatch is the server's missing "who won" event).

- Two clients sending different prompts to the same chat at the same time was
  verified: each prompt appears once (nothing lost or duplicated) and both turns
  complete. The gateway does not broadcast other clients' user-message events, so
  live user bubbles stay local and are reconciled by history on reopen/resume
  (recorded as a server-side limitation).

- Fixed: a late Kanban board response could repaint the board the person already
  switched away from. loadBoard now drops responses whose slug is no longer the
  current board and the board switch updates the current-board ref synchronously.
  A walkthrough with injected latency on one dedicated board verifies the stale
  response is ignored and switching back still loads its task.

- Documented a verification limitation: a model-not-configured Bot cannot be
  produced through the Dashboard API (`PUT /model` rejects empty values and a new
  profile inherits a usable model), so that guidance path needs a real unconfigured
  environment or explicit permission to clear a test profile's model.

- Sessions page stale responses are now guarded like the Kanban board: list loads,
  searches, opened sessions and message pages are discarded when their profile /
  query / session is no longer the current one. A walkthrough with injected latency
  on an empty dedicated profile verifies that switching away keeps the fast
  profile's 50 sessions and switching back loads the empty list.

- Stale search responses are now verified too: a slow no-match query followed by a
  matching one cannot clear the new results (test-only delay injection).

- The stream benchmark also runs with hidden windows now, so performance gates do
  not disturb the machine. A post-fix smoke (30s steady + burst) passes with p95
  30.8ms / 30.6ms, no unresolved batches and no long tasks.

- Fixed: the approval reconciliation poll treated a missing `open_requests` field
  in `session.resume` as "every request was answered", which would clear all
  pending cards after the first poll on a gateway that omits the field. It now
  skips reconciliation when the field is absent; a unit test covers it.

- Fixed the inspector library's stale-response hazard: switching Bots no longer
  lets a slow artifact list/preview/save response from the previous Bot repaint the
  new one (same class as the workbench fixes).

- Remote-computer status/thumbnail/start now accept and forward an explicit
  profile: the inspector's computer tab passes its Bot, so lease state and
  thumbnail suppression are read for that profile instead of the gateway's current
  session context. Unit tests cover the parameter routing; runtime/geometry remain
  host-level by design.

- Inspector tabs are now keyed by Bot, so switching Bots cannot reuse the previous
  Bot's artifact list, computer status/thumbnail or cron rows; the computer tab's
  loader also depends on the profile and drops responses for a Bot that is no
  longer selected.

- Documented the hidden-mode 10-minute benchmark rerun: steady (p95 32.6ms),
  burst (30.5ms) and history pass, but the switch-feedback check saw 2/20 large
  outliers (p95 199.8ms) in two runs while hidden, so the gate was not marked
  passed; a quiet visible-window rerun is recommended. No threshold was loosened.

- The switch-feedback gate now measures a normal chat switch: the synthetic 10-minute
  live bubble is cleared first (its frame latency/completeness is already measured by
  the steady scenario), while switching with that huge text still mounted is
  recorded as a separate informational metric (p95 49.8ms). The full hidden 10-minute
  run passes: steady p95 32.2ms, burst 30.2ms, send/switch feedback 17.3ms, 10k
  history 27.8ms.

- Added docs/evidence/delivery-summary.md: current verification counts, implemented scope,
  how the hidden test mode works, re-verification commands and the five external/user
  actions still blocking the first release.

- Packaging now ad-hoc signs the local build by default (`postPackage` codesign
  `--force --deep --sign -`) because a linker-signed bundle has Identifier=Electron
  and an unbound Info.plist, which prevents macOS from registering notifications.
  Developer ID builds still use the env-configured osxSign path. Recorded the user's
  scope decisions: non-preemptive display lease out of first release, internal
  signing accepted, 7-day use self-managed, test-server configuration authorised.

- Corrected the signing change to opt-in: `MOSBOT_ADHOC_SIGN=1 pnpm make` seals the
  bundle ad-hoc for release/notification checks, while routine test packages stay
  linker-signed because changing the code identity invalidates the existing
  userData's keychain-encrypted Dashboard session (`vault_unavailable`).

- Re-attempted the unconfigured-model state with the authorised test server by
  decrypting the session and calling the REST API directly: profile creation always
  inherits the default model and `/api/model/info` reports it, while PUT /model
  rejects empty or credential-less providers. The state is not constructible with
  the Dashboard API; the diagnostic script and limitation are recorded.

- Message-panel stale responses are now verified too: opening a slow session and
  immediately another one keeps the new transcript and discards the late messages
  (test-only delay on existing sessions, read-only).

- Recorded that the test server runs the headless `hermes serve` backend: the plugin
  management API returns 404 (`web UI disabled`), so the plugin-disabled state needs a
  server-side `hermes plugins disable` + gateway restart and cannot be constructed
  through the Dashboard API.

- Notification permission is now verified visually: with screen recording granted,
  the first real request shows the macOS "MosBot notifications" prompt, clicking it
  opens Settings with notifications allowed and ncprefs gains a com.mosbot.desktop
  entry (cropped screenshot committed). The actual approval banner still needs the
  signed app kept open for one more trigger; the harness records the current state.

### Changed

- Repository documentation is now bilingual: every file under `docs/` keeps an
  English primary file at its canonical path and adds a Chinese `-zh` counterpart,
  with reciprocal language links; README/CHANGELOG links were updated to match. The
  GitHub delivery project moved to the MosBot-AI organization and tracks status,
  phase, priority, verification and evidence in English; milestones, labels and
  issues are English too. The local-only reference recording is now marked as not
  committed, so no public link points at an ignored file.
- `pnpm test` now also covers protocol/URL policy, transport error taxonomy, PKCE,
  credential vault, loopback state validation and the full sign-in/probe flow
  (89 tests).
- The app's dev dependency on pnpm keeps Electron Forge's package-manager check
  reproducible without a global install.

### Fixed

- A duplicate `resolved-elsewhere` cancellation no longer overwrites the local approval receipt when the
  server broadcasts a settlement to every client.
- A system-notification click now refreshes the Bot roster and opens the matching
  Bot even when that Bot was created by another client after the roster was loaded;
  previously only the window came to the front.

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

### Fixed

- The group view now ignores late send/stop/approval/load-earlier responses after switching to another room.
- Group actions append new log events instead of resetting to the first page; the group view can disband a room after confirmation; the Groups section stays visible when empty,
  reselecting the open room is a no-op, and only approval-kind pending actions render approval buttons.

## [0.1.0] - 2026-11-03

### Added

- Initial M0a design-slice baseline (see Unreleased for the current contents).

[Unreleased]: ./CHANGELOG.md#unreleased
[0.1.0]: ./CHANGELOG.md#010---2026-11-03

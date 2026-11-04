# MosBot Desktop

A macOS-first Electron client for Hermes Agent bots: open the app, land on your
Bots, and keep talking to the one you were using. Profiles, sessions and Kanban
live in a separate Hermes workbench you open when you need them.

**Status:** M0a design slice plus the M0b protocol foundation. The window, roster,
chat, details column, search and create-Bot dialog run on deterministic fixtures.
The Dashboard client (address policy, Electron-network REST transport, RFC 8252
PKCE sign-in, safeStorage credential vault, IPC bridge) is implemented, verified
against the test deployment (v0.22.5) including a real browser sign-in, refresh
rotation, the gateway WebSocket contract and dedicated-object write probes. The
first-connection dialog stores the sign-in securely and restores it silently on
the next launch. When connected, the roster and the selected Bot Chat come from the real Dashboard:
prompts are submitted, replies stream into the transcript with full Markdown
rendering, Stop interrupts the turn, approval/clarify cards answer over the same
gateway connection, older history pages load in place, and a dropped socket reconnects, replays
missed events and re-delivers pending requests. Drafts, the selected Bot, the
details column and language/appearance preferences survive a restart. A background
watcher finds approvals/questions waiting in Bot Chats you have not opened, shows
an attention count and sends a system notification (clicking it opens that Bot). Creating a Bot in a connected window now
runs the real fresh-profile flow (name, shape, colour), selects it and guides model
setup when the Dashboard reports it is not ready yet. Connected Bots can be pinned, grouped
into named sections (create/rename/delete), moved between them, and their look and name
edited through the compare-and-swap appearance write; the arrangement persists locally.
The footer opens a Hermes workbench with Profiles, Sessions and Kanban pages backed
by the Dashboard's REST APIs; returning to Bots keeps the chat, draft and scroll
position untouched. Attachments are picked with the system dialog, staged through
`file.attach` and sent with the prompt; the computer tab reads real status and a
preview and offers an explicit wake action; a separate viewer window renders the
RFB screen and can take or return the control lease explicitly.
The library indexes the Bot Chat workspace through `/api/files`, previews text
and images and saves artifacts to Downloads before opening them explicitly.
The Kanban page can create tasks and move them between
columns, Profiles can write the default model/provider and read readiness back, and
an open board keeps itself current through the Kanban event WebSocket (re-signed
tickets, cursor resume, snapshot refetch on gaps). Without a connection the window
keeps using fixtures. No signed installer or upgrade path
exists yet. See
[`docs/evidence/m0a-design-slice.md`](docs/evidence/m0a-design-slice.md) and
[`docs/evidence/capabilities.md`](docs/evidence/capabilities.md).

## Requirements

- macOS 13 or newer on Apple Silicon or Intel
- Node.js 24+ (the repo is developed on Node 26)
- pnpm 11.28.5 — installed here as a project devDependency, so `npx pnpm@11.28.5`
  works without a global install; Electron Forge reads it during packaging

## Run it

```bash
npx pnpm@11.28.5 install
npm run dev            # or: npx pnpm@11.28.5 dev
```

Run this from Terminal.app rather than a restricted build sandbox: Chromium needs
its own sandbox and GPU process, which a locked-down environment can block.

## Checks

| Command                                      | What it proves                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run typecheck`                          | strict TypeScript across renderer, preload and main                                       |
| `npm test`                                   | pure-function and reducer tests (colours, i18n parity, store, fixtures, BotFace geometry) |
| `npm run test:e2e`                           | packages the app, then drives the real Electron window with Playwright                    |
| `npm run lint` / `npm run format:check`      | ESLint 9 and Prettier                                                                     |
| `npm run package`                            | unsigned `out/MosBot-<platform>-<arch>/MosBot.app`                                        |
| `npm run screenshot`                         | packages and writes the evidence screenshots                                              |
| `npm run assets:sync`                        | re-copies MosBot brand assets from the pinned source commit                               |
| `npm run test:install`                       | packages, extracts the ZIP into a temp dir and launches it with fresh data                |
| `npm run bench:pipeline`                     | local coalescing benchmark: four channels of desensitised frames, batch age and memory    |
| `npm run bench:stream`                       | packages the app, then measures frame→visible-text p95 and burst/history scenarios        |
| `BENCH_SOAK_SECONDS=3600 npm run bench:soak` | four-channel stream/idle/reconnect soak with batch-age and memory assertions              |

## Menus and keyboard

The macOS application menu follows the interface language and exposes the main
actions with their shortcuts:

| Shortcut                    | Action                                                                  |
| --------------------------- | ----------------------------------------------------------------------- |
| `Cmd+N`                     | New Bot                                                                 |
| `Cmd+K`                     | Search Bots                                                             |
| `Cmd+,`                     | Settings (appearance and language)                                      |
| `Cmd+=` / `Cmd+-` / `Cmd+0` | Zoom in / zoom out / actual size                                        |
| `Shift+Cmd+M`               | Show the main window                                                    |
| `Enter` / `Shift+Enter`     | Send / newline; Enter during Chinese IME composition is left to the IME |

Standard edit, window and full-screen menu roles stay in place so copy/paste,
undo and the system input method keep their macOS behaviour.

## Connect and sign in

Pick a Dashboard from the footer entry (the address of the reference deployment is
pre-filled in development). The app checks the address, opens the system browser for
OAuth, and returns through a loopback callback; the refresh token is encrypted in the
macOS Keychain and later launches restore silently. Sign out from the same footer menu;
tokens never reach the page. When a new Bot needs model authorisation, the chat shows
"Finish setup / Check again" and opens the Dashboard's profile page in the browser.

## Bots, chats and approvals

The roster shows pinned faces, sections and the remaining Bots; the nameplate at the top
of the chat opens the on-demand details column (details, library, computer). Approvals and
clarifying questions appear inline in the transcript and as a system notification when the
window is not focused; the attention chip jumps straight to the waiting Bot. Streaming
replies can be stopped without losing the text already shown, and drafts, selection and
scroll survive restarts.

## Files and artifacts

The composer attaches files through the system picker (10 MB) and sends them with the next
prompt. The library lists files the Bot produced in its workspace, previews text and
images, and "save and open" writes a copy to Downloads before opening it.

## Layout

```
src/main       Electron main process: window, navigation hardening, lifecycle
src/preload    narrow contextBridge surface (no business data yet)
src/shared     domain types, colour/face helpers, bridge contract
src/renderer   React app, CSS Modules, tokens, fixtures and the UI features
tests/unit     Vitest; tests/e2e runs against the packaged app
docs           plans (Chinese), brand provenance, evidence
```

## Data and updates

Local state lives in `~/Library/Application Support/MosBot/` (`local-state.json`, atomic writes
with a `.bak` of the previous version; unreadable documents are kept as `.corrupt`). Drafts,
the selected Bot, sections and appearance survive restarts and manual upgrades. To update,
quit the app and replace `MosBot.app` with the new build; the next launch upgrades the local
state in place (v1 → v2) and falls back to the backup if the main document cannot be read.
Sign-in credentials stay in the macOS Keychain via `safeStorage` and are never copied between
machines.

## Documentation

- Delivery baseline and milestones: [`docs/plans/README.md`](docs/plans/README.md)
- Interface spec: [`docs/plans/01-bot-experience.md`](docs/plans/01-bot-experience.md)
- Dashboard integration: [`docs/plans/02-dashboard-integration.md`](docs/plans/02-dashboard-integration.md)
- Task cards: [`docs/plans/03-agent-handoff.md`](docs/plans/03-agent-handoff.md)
- Brand assets and licences: [`docs/assets/brand.md`](docs/assets/brand.md)
- Acceptance evidence index: [`docs/evidence/acceptance.md`](docs/evidence/acceptance.md)
- Performance evidence: [`docs/evidence/m5-performance.md`](docs/evidence/m5-performance.md)
- Keyboard/accessibility evidence: [`docs/evidence/m5-gui-a11y.md`](docs/evidence/m5-gui-a11y.md)
- Install/upgrade evidence: [`docs/evidence/m5-install-upgrade.md`](docs/evidence/m5-install-upgrade.md)
- Changelog: [`CHANGELOG.md`](CHANGELOG.md)

## Known limitations (M0a)

- Chat replies and computer wake-ups are fixture pacing, not inference or a remote
  session.
- Attachments, artifact preview/save/open and the computer viewer window arrive in
  M4; those buttons are disabled with an explanation instead of faking success.
- Real Chinese IME, VoiceOver order, window scaling and split screen have not been
  exercised yet.
- The build is unsigned and unpackaged for distribution; signing and the 7-day
  dogfood arrive with M5.

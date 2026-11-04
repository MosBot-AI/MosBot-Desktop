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
an attention count and sends a system notification (clicking it opens that Bot). Without a connection the window
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

| Command                                 | What it proves                                                                            |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run typecheck`                     | strict TypeScript across renderer, preload and main                                       |
| `npm test`                              | pure-function and reducer tests (colours, i18n parity, store, fixtures, BotFace geometry) |
| `npm run test:e2e`                      | packages the app, then drives the real Electron window with Playwright                    |
| `npm run lint` / `npm run format:check` | ESLint 9 and Prettier                                                                     |
| `npm run package`                       | unsigned `out/MosBot-<platform>-<arch>/MosBot.app`                                        |
| `npm run screenshot`                    | packages and writes the evidence screenshots                                              |
| `npm run assets:sync`                   | re-copies MosBot brand assets from the pinned source commit                               |

## Layout

```
src/main       Electron main process: window, navigation hardening, lifecycle
src/preload    narrow contextBridge surface (no business data yet)
src/shared     domain types, colour/face helpers, bridge contract
src/renderer   React app, CSS Modules, tokens, fixtures and the UI features
tests/unit     Vitest; tests/e2e runs against the packaged app
docs           plans (Chinese), brand provenance, evidence
```

## Documentation

- Delivery baseline and milestones: [`docs/plans/README.md`](docs/plans/README.md)
- Interface spec: [`docs/plans/01-bot-experience.md`](docs/plans/01-bot-experience.md)
- Dashboard integration: [`docs/plans/02-dashboard-integration.md`](docs/plans/02-dashboard-integration.md)
- Task cards: [`docs/plans/03-agent-handoff.md`](docs/plans/03-agent-handoff.md)
- Brand assets and licences: [`docs/assets/brand.md`](docs/assets/brand.md)
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

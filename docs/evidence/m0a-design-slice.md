# M0a · Clickable Design Slice · Evidence

[简体中文](m0a-design-slice-zh.md)

- Card: M0a (see `docs/plans/03-agent-handoff.md`)
- Status: **User confirmed the visual baseline on 2026-11-09; the baseline is frozen and M0a is closed**
- Recorded: 2026-11-03
- Data source: **fixture** (deterministic, redacted design samples); contains no real Dashboard data

## Environment

| Item              | Value                                                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Machine           | Apple Silicon (arm64), macOS 15.8.2                                                                                                              |
| Node              | 26.13.0 (Homebrew; the DSH-bundled Node 24 in this session cannot load rolldown native bindings, so the toolchain uses Homebrew Node throughout) |
| pnpm              | 11.28.5 (`packageManager` pinned; `node-linker=hoisted` for Electron Forge packaging)                                                            |
| Electron          | 45.2.1                                                                                                                                           |
| React / Vite / TS | 19.3.1 / 8.3.5 / 5.9.3 (strict)                                                                                                                  |
| Build artifact    | `out/MosBot-darwin-arm64/MosBot.app` (**unsigned directory build**, local acceptance only; not a release installer)                              |

## Commands and Results

| Command            | Result                   | Notes                                                                                    |
| ------------------ | ------------------------ | ---------------------------------------------------------------------------------------- |
| `pnpm typecheck`   | Pass (0 error)           | Two tsconfig sets: renderer and main/preload                                             |
| `pnpm test`        | Pass: 4 files / 64 cases | Colors, i18n, store/reducer, fixture coverage, BotFace geometry                          |
| `pnpm lint`        | Pass (0 problem)         | ESLint 9 + typescript-eslint                                                             |
| `pnpm test:e2e`    | Pass: 9 cases            | Runs `electron-forge package` first, then launches a real Electron window via Playwright |
| `pnpm package`     | Pass                     | Artifact `out/MosBot-darwin-arm64/MosBot.app`                                            |
| `pnpm screenshot`  | Pass: 10 images          | Written to `docs/evidence/screens/m0a/`                                                  |
| `pnpm assets:sync` | Pass                     | Syncs brand assets from `MosBot@3c118c4` and generates `artwork.ts`                      |

E2E coverage: default window and six pinned slots, section collapse, selecting a Bot from the pins and handling an approval, Enter to send / stop / stopped receipt, `⌘K` search filtering and navigation, creating a Bot (live preview) and selecting it, opening details → waking the computer → focus returning to the nameplate after close, light/dark and zh/en switching, 720×500 overlay details and empty chat.

## Screenshot Index (`docs/evidence/screens/m0a/`)

| File                                | State                                                                                                          | Reference recording                                |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `01-light-default.png`              | 1000×760 two-column, 288 px left column, six pinned slots, long Chinese name, work log, approval card          | 00:42                                              |
| `02-inspector-details.png`          | Expanded right-panel "Details": avatar, name, status, recent activity, bio, routine tasks (including disabled) | 01:04                                              |
| `03-inspector-computer-preview.png` | Computer page: wake → 16:10 read-only preview + disabled "Open" with reason                                    | 01:24                                              |
| `04-search.png`                     | Centered search overlay, instant filtering on input, results with avatar/name/one-line summary                 | 02:03                                              |
| `05-create-bot.png`                 | Create sheet: live preview, name counter, 9 shapes, 12-color palette, Cancel/Create                            | 02:14                                              |
| `06-dark.png`                       | Same layout in dark theme                                                                                      | 01:26 color reference for the dark computer window |
| `07-english.png`                    | English UI                                                                                                     | Bilingual requirement                              |
| `08-narrow-overlay.png`             | 720×500: details become a right-side overlay + scrim, chat remains readable                                    | 01:04 overlay details                              |
| `09-empty-chat.png`                 | Empty chat: brand illustration + one-line explanation, keyboard focus on the nameplate                         | Empty-state requirement                            |
| `10-library.png`                    | Library empty state (single selected tab, one line of empty-state copy)                                        | 01:50–02:02                                        |

Screenshots contain only content rendered inside the window; the native macOS title bar and traffic lights are not in the screenshots (this session has no screen-recording permission), so the user needs to confirm them in a real window.

## Covered UI States (fixture)

- Two sections (Products, Daily); Daily is collapsed by default and shows a count; "Pending · 3" aggregates approvals and clarifications.
- Six pinned slots (two rows of three) + an "All pinned" entry; extra-long Chinese names are truncated separately in the list / pins / nameplate.
- Conversation: user bubble (Bot color + dark ink), Bot bubble, merged and expandable work log, long reply (paragraphs/lists/code blocks), pending approval card (folds into a receipt after handling), clarification card, stopped, back to latest, per-Bot draft isolation.
- Offline Bot, connection offline (footer "Design sample · Not connected") and the pending-state dot.
- Computer: sleeping / waking / preview / view-only / another viewer; no fake frames.
- Light/dark tokens, zh/en copy, reduced motion (follows system).

## User Feedback (2026-11-03 supplementary recording)

- Hovering an avatar needs feedback: implemented — a preview overlay appears after 260 ms of hover (avatar, name, last summary, status, recent activity), while the face responds in the `listening` pose and lifts slightly; keyboard focus also shows the overlay. See `11-hover-preview.png`.
- Note: this item comes from the user's feedback against a reference app recording; the reference is GrokBot's hover-preview effect, redrawn with MosBot assets.

## Known Limitations and Pending Adjustments

1. Replies and computer wake are driven by fixture timing (1.4 s / 1.2 s), **not real inference**; remove once M1/M4 wire real events.
2. Attachment button disabled (M4), library has no preview/save/open (M4), computer "Open" disabled (M4); all show a reason instead of a fake entry point.
3. Not verified: real Chinese IME composition input, VoiceOver reading order, real 4K/scaling and split screen, native window traffic-light position. IME only implements composition protection and needs user testing.
4. Launching Electron in this session requires `--no-sandbox --disable-gpu --user-data-dir=.tmp/...` (the DSH file sandbox does not allow Chromium to write `~/Library` or initialize its own sandbox); running `pnpm dev` in the user's own terminal does not need these flags, and the E2E scripts only append them in the test environment.
5. Packaged as an unsigned directory build; signing/notarization/install-upgrade happen only in M5.

## User Acceptance (2026-11-09)

The user operated the current packaged build in a real window and **confirmed the visual baseline on 2026-11-09**. Layout, density, Bot switching and right-panel feel were accepted; the visual baseline is frozen and M0a is closed.

Manual follow-ups that do not block the baseline stay tracked by M5: hardware Chinese IME composition, VoiceOver reading order, 4K/split-screen scaling and native window traffic lights. See `m5-gui-a11y.md`.

## Not Verified / Blocked

- M0b (the `192.168.2.171:9119` probe) requires the user to complete OAuth login in a system browser and has not started; this card is unaffected.
- The real service capability matrix, protocol samples, and IPC contracts are frozen in M0b/M1 and are not included in this card.

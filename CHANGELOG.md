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

### Notes

- Source only: no signed installer, upgrade path or real Dashboard connection exists
  yet. M0a uses fixtures for interface review; M0b/M1 replace them with the real
  service at `192.168.2.171:9119`.
- All chat content in screenshots is desensitised fixture data.

## [0.1.0] - 2026-11-03

### Added

- Initial M0a design-slice baseline (see Unreleased for the current contents).

[Unreleased]: ./CHANGELOG.md#unreleased
[0.1.0]: ./CHANGELOG.md#010---2026-11-03

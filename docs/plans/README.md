# MosBot Desktop Implementation Plan from Scratch

[简体中文](README-zh.md)

2026-11-03 · Revised delivery baseline · macOS first

When users open MosBot, they see a familiar Bot and continue the conversation by tapping its avatar. To check what the Bot is doing, they tap the nameplate at the top of the chat, then look at the details or the computer. Profiles, Sessions, and Kanban live in a separate Hermes workbench that users enter deliberately.

## Agents Start Here

1. Read this page to establish the delivery boundaries, then start from the task cards in the [Agent execution handbook](03-agent-handoff.md). The handbook contains ready-to-use kickoff instructions, the deliverables of each phase, and how to handle capability blockers.
2. Using the [screen recording and UI specification](01-bot-experience.md), open `../scratch/录屏2026-11-03 19.25.26.mov` and build a runnable UI slice first. Reproduce the UI states from the recording with redacted, deterministic samples.
3. Use [Dashboard integration and streaming architecture](02-dashboard-integration.md) to build protocol samples and real integration, getting "connect → select Bot → send message → reconnect and recover → stop" working end to end first.
4. Submit reproducible evidence as each task card completes. Acceptance falls into four categories — screenshots, automated tests, real Dashboard integration, and post-packaging runs — each recorded with its environment and results.

The new directory is `~/dev/MosBot_Desktop`. Rebuild from scratch; do not carry over the old Desktop's UI or implementation-completion status. The UI references only the GrokBot recording, brand resources come from `~/dev/MosBot`, and the API follows `~/dev/hermes-agent` and the target deployment. UI fixtures and the real client switch through the same typed interface. Only the real Dashboard is wired into the installer.

## Delivery Layers

| Delivery | Scope | Definition of done |
| --- | --- | --- |
| Clickable design slice | Two-column layout, common avatars, collapsible sections, message bubbles, composer, search, Bot creation, and the on-demand right column | Provide real windows, comparison screenshots, and interaction recordings; freeze the UI baseline after the user confirms layout, density, and feel through hands-on use |
| First usable release | Dashboard login, new Bot configuration through first reply, persistent chat and recovery, approval alerts, Bot organization, attachments and artifacts, computer viewing and non-preemptive takeover, Hermes workbench, settings, and install/upgrade | All of M1–M5 pass with no unresolved blockers on required capabilities of the designated real service; users can complete daily tasks without developer tools |
| Capability expansion | Group chat, speech-to-text, expanded management scope on demand | Group chat and voice reuse the positions from the recording and ship independently after protocol probing. Sections are list organization; group chat is a separate conversation; each has its own identity |

The first release is macOS, single Dashboard, with light/dark support and Simplified Chinese/English; the data model preserves connection and profile identity. M0b fixes the minimum macOS, CPU architecture, minimum backend version, and required plugins; M5 declares support publicly only after item-by-item real testing. Group chat, voice, multiple Dashboards, third-party app connections, and billing are M6 and later scope, and do not block the first version.

## Definition of Done

The first version must let a new user, in the signed installer, independently complete "connect and log in → create Bot → configure model authorization → real reply → handle approvals → save artifacts → restart and continue using", plus workbench operations and computer wake, viewing, takeover, and return. Guiding the user to the same Dashboard's browser configuration page is allowed; after returning to the app, the configuration must be verified and the original task continued.

M0a is UI acceptance, M1–M4 are functional acceptance, and M5 is install, upgrade, and daily-use acceptance; they cannot substitute for one another. When a required capability is missing, register a resolution task and keep the blocker; hidden entry points, read-only degradation, and recorded failures do not count as done. Other unsupported deployments may degrade explicitly, but the first-version reference environment must still pass every required item. Only an explicit scope change by the user can remove something from the first version.

## Technical Baseline

Electron Forge + Vite + React 19 + TypeScript strict mode + pnpm lockfile. The UI uses CSS Modules, CSS custom properties, and small accessible base components, with core area components implemented in-house. React Router handles standalone pages, TanStack Query handles bounded REST queries, and TanStack Virtual handles variable-height long message lists. Streaming data is projected by an external store with fine-grained subscriptions; the renderer reads the current session and its messages through `useSyncExternalStore`.

Main manages windows, authentication, and system permissions. Chat and plugin streams run in a separate Electron Utility Process, using a persistent WebSocket, runtime validation, and a frame-batched MessagePort. HTTP uses Electron's Chromium network stack, with explicit tests for proxy, certificates, and URL prefixes. Run end-to-end stress tests against the TypeScript version first, and proceed to full release acceptance only after the performance thresholds are met. Introducing Rust or Workers is based on measured hot spots; see the integration specification. When choosing exact versions of Electron, Node, and packaging plugins, check the current security support and signing compatibility, then pin them in the lockfile. [React](https://react.dev/) · [Vite](https://vite.dev/guide/) · [Electron Forge](https://www.electronforge.io/) · [Electron Utility Process](https://www.electronjs.org/docs/latest/api/utility-process)

Suggested directories by responsibility are `src/main`, `src/preload`, `src/service`, `src/shared`, `src/renderer/features/{bots,chat,inspector,hermes,settings}`, and `tests/{contract,e2e,perf}`. The main app is served from locally packaged pages; login, model authorization configuration, and external links the user explicitly opens use the system browser.

## Implementation Tasks and Dependencies

| Card | Deliverable | Dependencies and merge conditions |
| --- | --- | --- |
| M0a · Design slice | Electron window, MosBot assets, two-column/right column layout, search, creation, and error states | Main Agent owns the shared build config; full-page implementation that depends on the visual baseline starts after the user accepts hands-on operation, while protocol and storage work may continue |
| M0b · Dashboard probe | On `192.168.2.171:9119`, verify OAuth, sessions, model configuration, files, pending requests, Kanban, and the computer; pin capabilities and the support matrix | Runs in parallel with M0a; write only to test objects dedicated to this round; freeze scope, event, and IPC types; all missing required capabilities move to M0c |
| M0c · Backend dependency closure | Provide adapters or backend patches for missing required capabilities, compatible versions, and deployment rollback notes, then re-verify on the designated service | Main Agent closes it out; the protocol owner locates issues, the implementation owner fixes them, the test owner re-verifies; stays blocked until deployed and re-verified |
| M1 · Chat vertical slice | Login, existing Bots, first send, Markdown, history pagination, approval/clarification, stop, recovery, background alerts, draft persistence | The corresponding M0b capabilities pass; first send for a newly created Bot also depends on M2's configuration readiness and title-claim verification; real-service and deterministic regression runs are recorded separately |
| M2 · Creation and organization | Creation, model authorization guidance and readiness detection, appearance, renaming, sections, pinning, search, partial success and conflict recovery | M0a + corresponding M0b/M0c; jointly verify with M1 the new Bot's first inference and restart-continued chat. Bot registration and canonical claim are implemented by the same owner; M2 owns configuration-readiness logic, reused by M3 |
| M3 · Hermes workbench | Standalone routes for the Profiles overview/details and permitted default model configuration, Sessions pagination/search/history, Kanban board switching/details/task creation/status changes, WS invalidation refresh | M0a + corresponding M0b/M0c; the configuration page reuses M2 logic; returning to the original chat restores draft, scroll, and selection |
| M4 · Details and computer | Details and recurring-task overview, attachment send/receive, artifact preview/save/open, computer wake/view/non-preemptive takeover/return | M1 + corresponding M0b/M0c; the details panel must not stop at listing names, and the computer cannot close as read-only viewing; dual-client acceptance is serial |
| M5 · Release and daily-use acceptance | Performance, GUI/accessibility/bilingual regression, signing and notarization, clean install, in-place upgrade and data recovery, 7 consecutive days of daily use | M1–M4 all complete with zero required blockers; provide the installer, checksums, user guide, evidence index, and known limitations for final user acceptance |
| M6 · Capability expansion | Group avatars and group-chat integration, recording transcription; enable real entry points when the capability exists | Prove the corresponding capability on the target Dashboard; deliver separately; M6 does not block the preceding chat loop |

Each card has exactly one write owner; the Main Agent centralizes shared types, real login, test writes, and releases. Deterministic fixtures are used only for UI, pure-function regression, and local performance replay; no mock server is started, and they do not replace real integration. Evidence records commands, versions, status, duration, window size, and recording timestamps; it does not include credentials, real conversation bodies, or remote screen content.

## Release Candidate Acceptance

- [ ] A brand-new user logs in through system-browser OAuth; after creating a Bot, completes model authorization and receives a real reply; cancel/failure lets the original configuration flow continue, without hand-editing configuration files.
- [ ] After a cold start, the app connects and stops at Bots or restores the most recently usable Bot. Tapping a pinned item, a section member, or a search result enters the same conversation; a restart restores the selection and draft.
- [ ] Key states from the recording are reproduced. Screenshots exist for the normal two-column view, expanded right column, narrowed sidebar, pinned and collapsed sections, search empty state and results, Bot creation, computer preview, and the standalone window. Long Chinese names, long text, split screen, and zoom are checked.
- [ ] The same Bot Chat is read from another client against the real Dashboard. Sending, tool events, question cards, stop, reconnect replay, and background long-reply recovery each have separate results; concurrent use from both ends never silently overwrites profile data or sends twice.
- [ ] A Bot awaiting approval in an unopened or collapsed section can be discovered and reached directly; background, closed main window, reopened from the Dock, and restarted after quit all have results; a denied notification does not affect in-app alerts.
- [ ] After uploading an attachment, real inference can read it; Bot artifacts can be previewed or saved and opened; pagination, expired authorization, no permission, and deleted resources are handled correctly.
- [ ] All three workbench pages actually issue requests. Kanban creation and status changes are read back; changes from another client can refresh; a disabled plugin gives clear feedback. When switching accounts, profiles, or boards, stale responses never write into the new page.
- [ ] Wake the computer on the designated real service, open the viewing window after the preview, and acquire and return control. A disconnect falls back to read-only; leases are re-verified in the background and after a restart. Test states where another operator is present.
- [ ] Meet the performance thresholds in the integration specification; keyboard, Chinese IME, zoom, reduced motion, and focus order are verified at runtime. The package has passed signing, notarization, and clean-system install verification, with supported OS and architecture combinations recorded.
- [ ] After an in-place upgrade from the previous beta of this rebuild, connections, drafts, sections, read positions, and preferences are retained; a failed migration does not wipe data; a pending unconfirmed send after a force quit is not automatically resent.
- [ ] The user confirms the UI and the complete flow; 7 consecutive days of daily-use records are complete, with no unresolved blockers, data loss, duplicate sends, or unauthorized operations; every required item has real evidence.

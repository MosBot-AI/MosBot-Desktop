# Repository instructions

These instructions apply throughout the MosBot Desktop repository. AGENTS.md files are English-only and do not require Chinese counterparts. Follow explicit user instructions when they override a repository convention.

## 0. Starting a session

1. Read `docs/plans/README.md` for the delivery baseline, then `docs/plans/03-agent-handoff.md` for the current task cards. Read `docs/evidence/acceptance.md` for the current acceptance status. Work the cards in order (M0a → M5) and do not bypass them.
2. Run `git status` and `git diff`; preserve uncommitted work from the user or other agents. Do not `checkout` or `reset` it away.
3. Locate the code you will change first (`grep`, `glob`, `read`), write a `todo_write` plan for multi-step work, then start.

## 1. Project context

- Product: an Electron desktop client for Hermes Agent, shipping on macOS first. It is not a browser wrapper for the Dashboard.
- Scope and acceptance sources of truth: `docs/plans/README.md` (delivery baseline), `docs/plans/01-bot-experience.md` (interface spec), `docs/plans/02-dashboard-integration.md` (protocol and streaming architecture) and `docs/plans/03-agent-handoff.md` (task cards and execution order). Evidence lives in `docs/evidence/`; brand provenance in `docs/assets/brand.md`.
- Technical baseline: Electron Forge + Vite + React 19 + TypeScript strict + pnpm. Layers and directories follow `docs/plans/README.md`: `main`, `preload`, `service`, `shared`, `renderer`, `tests`.
- Real service: the only integration target is `192.168.2.171:9119` with OAuth sign-in. Do not start a mock server and do not build a substitute Dashboard.
- References: protocol and implementation follow `~/dev/hermes-agent` (record the pinned SHA when citing it); brand assets come from `~/dev/MosBot` (record the Git SHA used); UI reference is GrokBot Desktop and the local recording under `docs/scratch/` (the recording is intentionally not committed).
- Knowledge base: for existing projects, people, decisions, research or historical conclusions, consult the user's llmwiki at `/Users/charleypeng/Library/Mobile Documents/iCloud~md~obsidian/Documents/llmwiki` first. If unavailable, state that limitation and continue with verifiable sources; never invent prior decisions.
- Distinguish planned, implemented, tested and released work. Documentation or passing mocks cannot establish that a product feature works against the real deployment.
- When unsure, inspect code and documentation before asking. If still unclear, ask the user with concrete options.

## 2. Delivery quality

The quality bar is "a user can pick it up and use it, and the design is visible", not "it runs".

- Build the interface to the hierarchy, density, motion and brand defined by `docs/plans/01-bot-experience.md`; take brand assets from `~/dev/MosBot` and record provenance plus conversion commands. Acceptance compares against recording timestamps (00:42, 00:46, 01:04, 01:24, 02:03, 02:14 and others).
- Every interaction covers at least: loading, empty, error, partial success, offline/reconnect, insufficient permission and conflict. Verify keyboard access, Chinese IME, light/dark, Chinese/English, long text and zoom.
- Real-window acceptance means screenshots or recordings plus the user actually operating the app. Fixtures only support UI replay and pure-function regression; they never replace real integration. M0a's visual slice is frozen only after user trial. UI, functional and installer acceptance cannot substitute for one another.
- Use the specified 4/8/12/16/24 spacing and existing dimensions; do not invent values. Motion only confirms operations; streaming content must not animate per character.
- Code: TypeScript strict; no `any` escapes or `@ts-ignore` without a written reason; no commented-out dead code, debug output or placeholder TODOs; small testable components; freeze shared types before parallel work.
- User-facing copy goes through message keys with matching zh-Hans and en content; never expose internal ids, stack traces or other technical noise.

## 3. Working loop

Use the same rhythm for every task to reduce rework:

1. **Locate**: read the relevant files and existing implementation first. Use read-only subagents for broad research in parallel.
2. **Plan**: use `todo_write` for multi-step work. For scope, architecture or irreversible operations, give the user a 3–5 line plan before acting.
3. **Slice**: land the smallest runnable vertical slice first, then add states and detail; keep every step revertible.
4. **Verify**: run only the checks relevant to this change (see section 6). Interface changes require real-window verification.
5. **Close**: bilingual changelog + evidence + commit, then report "done / not done + evidence + next step".

- Run long commands (builds, E2E, packaging, signing) as background jobs and keep working on independent steps. Do not idle-poll or repeat the same command.
- Independent reads and checks may run in the same turn; dependent writes run serially.
- Retry the same failure at most twice; if it still fails, escalate with evidence or change approach instead of trying endlessly.

## 4. Delegation (DSH Agent Teams)

Default to doing the work yourself. Do not reproduce a multi-role Codex organization: start agents only for genuine parallelism or an independent perspective.

**Start a teammate when one of these is true:**

- two or more independent write tasks in different directories or modules;
- the Lead must advance the main line while independent verification or review can run in parallel;
- a non-trivial diff needs an independent review before commit.

**Do not start one for:** single-file edits, typos, a copy change, one changelog line or a check that one command completes.

**Rules:**

- Usually one teammate at a time, at most two; never split work just to create parallelism.
- Two briefs are enough: **implementer** (writes to given files against acceptance criteria) and **verifier** (read-only review or independent verification). Use `subagent` for read-only research.
- Every brief states goal, owned paths, known facts, constraints, acceptance criteria and return format (what changed / evidence / blockers). Default to fresh context; fork only when this session's context is required.
- Write scopes must not overlap. The Lead owns shared types, IPC/DTO contracts, dependency manifests and lockfiles, and root build configuration. Dependent work is serial.
- Create shared cards with `team_task_*`, record write scopes and `blocked_by`; after a teammate finishes, the Lead reviews the diff, runs acceptance and commits.
- Only one agent may touch real sign-in, Electron E2E, GUI recording or native rebuild/packaging at a time.
- All agents inherit the same permissions. Without explicit Lead assignment, no agent may commit, push, change backend configuration or start another agent.
- Do not start large orchestration just to use a workflow tool; only when the user explicitly asks.

## 5. Boundaries

- Change only files relevant to the task; no opportunistic refactors or whole-file reformatting. One problem per change.
- Do not add or upgrade dependencies, change the build chain, signing or backend configuration without explaining the reason, impact and rollback first.
- Do not lower acceptance criteria, delete task cards or close blockers with "later"; scope changes are the user's decision.
- Do not commit half-finished work or present unverified, fixture-only or degraded paths as complete.

## 6. Testing and evidence

- Prefer the real chain: real service + OAuth. The user performs sign-in; credentials stay in Keychain/safeStorage and must never be printed, committed, logged or captured in screenshots/evidence.
- Write to the real service only with dedicated objects for this run (identifiable profile / board / task / file) and clean them up. Do not change the global active profile, restart a shared service or change configuration to manufacture failures.
- Check from small to large: typecheck/unit → relevant integration → E2E → packaging. Documentation or copy changes do not trigger builds or real integration.
- Script conventions (provided as each stage lands): `pnpm dev`, `pnpm typecheck`, `pnpm test`, `pnpm test:contract`, `pnpm test:e2e`, `pnpm bench:stream`, `pnpm make`; real integration uses `pnpm test:integration` with address and identity injected through environment variables.
- Record evidence under `docs/evidence/`: card, command, version/environment, result, duration and evidence path; label fixture / real service / installer explicitly.
- Reproduce a failure reliably before fixing it. Do not close a problem with hidden entry points, read-only degradation or deleted acceptance items. When the real service lacks a capability, record the blocker, owner, next step and re-verification condition.

## 7. Bilingual repository documentation

All authored documentation, READMEs and changelogs, except AGENTS.md instruction files, must have English and Simplified Chinese versions. English uses the base filename; Chinese adds `-zh` immediately before the extension, in the same directory.

| English                       | Simplified Chinese               |
| ----------------------------- | -------------------------------- |
| `README.md`                   | `README-zh.md`                   |
| `CHANGELOG.md`                | `CHANGELOG-zh.md`                |
| `docs/plans/README.md`        | `docs/plans/README-zh.md`        |
| `docs/evidence/acceptance.md` | `docs/evidence/acceptance-zh.md` |

- Create, update, rename or delete both versions in the same change. Translation is part of completion, not a later TODO.
- Match meaning, scope, requirements, examples, versions, dates, task/decision IDs and implementation status. Do not use a placeholder or a shortened summary as the translation.
- Add reciprocal language links near the top. Link to the same language's documents where available; update indexes and incoming links on rename.
- Keep commands, code identifiers, API names, paths and protocol values accurate. Translate explanatory prose without changing executable examples.
- Apply these rules to package READMEs, design documents, ADRs, contributor guides and implementation evidence as well as root documentation.
- Do not translate legal license text, vendored upstream files, generated output or machine-readable schemas/data merely to create pairs. Platform-facing issue/PR templates and automation text are English, as required below.

## 8. Commits

Use [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). Commit messages, including bodies and footers, are English.

```text
<type>(<optional-scope>): <imperative summary>
```

Repository style: lowercase types/scopes; concise imperative summary without a final period, preferably within 72 characters. Types: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `style`, `revert`. Use `style` only for formatting changes without behavioral changes.

Examples: `docs(architecture): define memory plugin contracts`, `fix(vault): reject expired input requests`.

Mark breaking changes with `!` and describe impact and migration in a `BREAKING CHANGE:` footer. Keep each commit cohesive; inspect the staged diff and preserve unrelated work. Reference only real Issue/PR identifiers.

- Commit each stage once it is verified; do not accumulate a large batch. One commit does one explainable, revertible logical change.
- Only the Lead commits; teammates do not commit. Do not push unless the user explicitly asks.
- Do not commit credentials/tokens, real conversation bodies, remote screen content, logs, caches, large fixtures or raw recordings.

## 9. Changelog and versions

Maintain `CHANGELOG.md` and `CHANGELOG-zh.md` using [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/). Use an `Unreleased` section, newest releases first and released headings in `[version] - YYYY-MM-DD` form. Use actual release dates, never invented releases or links.

| English category | Chinese category |
| ---------------- | ---------------- |
| Added            | 新增             |
| Changed          | 变更             |
| Deprecated       | 弃用             |
| Removed          | 移除             |
| Fixed            | 修复             |
| Security         | 安全             |

Write concise entries about meaningful user or developer impact, not a copied commit log. Update both unreleased sections for notable capability, behavior, compatibility, configuration, installation or security changes. Pure formatting and typo fixes need no entry. Describe plan changes as documentation changes, not implemented features. Explain breaking changes and migration steps; retain matching versions, dates and references across languages. Omit empty categories.

Use [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) for releases. Document compatibility changes explicitly, including during `0.x`; do not promise stable interfaces before they are declared stable. This convention does not itself request a version bump, tag or release.

## 10. English project coordination

Use English for all authored project-management and collaboration content:

- Projects: names, descriptions, roadmaps, milestones, updates, field names/options and automation text.
- Kanban: board names, columns, statuses, cards and checklists. Prefer `Todo`, `In progress`, `Blocked`, `In review`, `Done` where suitable.
- Issues: titles, descriptions, acceptance criteria, labels and comments.
- Pull requests: titles, descriptions, review comments, checklists and merge/squash commit messages. PR titles follow the commit format above.

Preserve proper names, identifiers and necessary verbatim evidence in their original form, with English explanation. Repository Chinese documentation remains required; these English-only rules do not change the user's preferred chat language (Chinese).

Issues should state the problem, scope and verifiable acceptance criteria; bug reports include reproduction and expected/actual behavior. PR descriptions lead with the problem and resulting behavior, then relevant validation, compatibility and linked Issues. Keep titles and descriptions aligned with the final diff. Report only checks actually run and explain skipped checks.

## 11. GitHub Project execution

- Use [MosBot Desktop Delivery Plan](https://github.com/orgs/MosBot-AI/projects/4) and its linked Issues as the live progress ledger. Read `docs/plans/03-agent-handoff.md` for card scope and `docs/evidence/` for acceptance evidence. `docs/github-project.json` maps Project/field/option/Issue/item IDs; it is a mapping, not live status.
- Use GitHub CLI for Project, Issue, PR and progress operations. Run `gh project item-list 4 --owner MosBot-AI --format json` to inspect live items. The task manifest, where present, owns scope and dependencies; never overwrite live progress with planned values.
- Claim one task before editing: re-read competing claims, self-assign, record the agent/run identity and branch in English, and set Status to `In progress`. Project fields are not atomic locks; resolve competing claims before proceeding.
- Report meaningful progress and blockers in the Issue, link real evidence, and keep Project fields current. Use `In review` for reviewable work; never mark a skipped mandatory live check as complete.
- Done requires merged implementation, verified applicable acceptance, an Evidence link, the `acceptance:verified` label and Issue closure as completed. Recheck downstream readiness. Do not treat not-planned closure as success.
- Status meanings: `Todo` — unclaimed, waiting on ordinary dependencies; `In progress` — claimed with assignee and claim comment; `Blocked` — a specific external condition or decision prevents progress, with the exact unblock condition recorded; `In review` — reviewable change and evidence supplied, review or required live acceptance pending; `Done` — merged, checked and verified, Issue completed with evidence linked.
- Project updates are not atomic. Staleness alone does not authorize stealing a task; use an explicit handoff. Do not automatically rerun unattended blockers.
- The Project is linked to the public repository. Public repository access does not imply Project write access; collaborating agents need Project access and `project`/`repo` CLI scopes. Never expose tokens in chat, committed files, logs or code.
- Milestones imply no dates. Closed-Issue counts cannot replace product acceptance.

## 12. Completion checks

- Review the affected English/Chinese pairs and their reciprocal links.
- Review changelog impact and update both versions when warranted.
- Verify commit/PR format and English project-management text when creating those artifacts.
- Run relevant checks and `git diff --check`. Documentation or copy changes do not require builds or real integration.
- Current checks do not enforce every rule in this file; manually review uncovered requirements. Do not claim an unexecuted check passed.

## 13. Definition of done (per card / delivery)

- [ ] The feature works to the card's acceptance criteria on the real chain.
- [ ] Relevant checks pass and the UI has real-window screenshots or recordings.
- [ ] Bilingual documentation and changelog are updated.
- [ ] Evidence is recorded; unresolved items have an owner and next step.
- [ ] The diff is self-reviewed: no unrelated changes, debug leftovers or leaked secrets.

## 14. Reporting format

- Report in Chinese, conclusion first, with evidence and next steps; link specific files.
- Do not paste whole logs; do not overstate completion; state blockers and risks directly.
- "Done" must include a verification command or evidence path. If unverified, say "not verified" explicitly.

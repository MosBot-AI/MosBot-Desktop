# M2 · Create and Appearance (backend vertical slice) · Evidence

[简体中文](m2-create-and-appearance-zh.md)

- Card: M2 (real creation, appearance CAS, rename, model-ready read-back, post-creation selection and configuration guidance)
- Status: **Creation / appearance / rename / ready read-back implemented and verified on the real service; the real submission and model guidance of the creation sheet are wired in**
- Recorded: 2026-11-04
- Target service: `192.168.2.171:9119` (v0.22.5 / `bf0203a794`); writes only against this round's
  dedicated `mosbot-m2-probe-<timestamp>` profile, deleted at the end

## Implementation

- Creation: WS `profiles.create` (`no_skills`, `no_alias`, `mirror_credentials:false`, fresh does not inherit credentials);
  then `profiles.configure` writes `ui_meta['hermes-bots']` (`title/shape/color/custom`) with
  `ui_meta_expected_revisions` CAS.
- Read-back: REST `/api/profiles` **does not include ui_meta**, so roster read-back goes through WS
  `profiles.list`; the revision from the configure response and the input appearance are merged into the
  returned row, avoiding roster read-cache lag.
- Conflict: when the CAS revision is stale, `conflict` is returned (retryable); the sheet shows "This Bot's appearance was changed elsewhere".
- Rename: REST `PATCH /api/profiles/{name}` `{new_name}` (the server stops the gateway before changing the directory).
- Readiness: REST `/api/model/info?profile=` → non-empty `provider/model` means ready; the configuration page address is
  `${dashboard}/profiles`, validated by the main process and then opened with `shell.openExternal`.
- Renderer:
  - In connected mode the creation sheet calls the real backend: submit is disabled while creating, a duplicate name maps to "already exists", other failures keep the input;
  - On success the new Bot is upserted and selected; when not ready, the chat shows "Finish configuration / Re-check" and sending is disabled;
  - Model readiness is re-checked automatically when the window regains focus;
  - The remote roster reads title/shape/color and revision from `ui_meta['hermes-bots']`; real appearance is shown directly.

## Verification

| Check                               | Result                                                                     |
| ----------------------------------- | -------------------------------------------------------------------------- |
| Real creation + appearance          | ✅ `shape=circle`, `color=#4f86d6`, `revision=1`, `appearanceApplied=true` |
| Appearance CAS write and read-back  | ✅ wrote `pill`/`#e05c5c` → revision=2, WS read-back consistent            |
| Stale revision                      | ✅ returned `conflict` (actual revision=2)                                 |
| Model readiness read-back           | ✅ `ready=true` (provider `openai-codex`, model `gpt-6-luna-900k`)         |
| Rename                              | ✅ findable in WS roster after `…-r`                                       |
| Cleanup                             | ✅ deletion succeeded, leftovers=0                                         |
| `pnpm test`                         | **131 cases passed**                                                       |
| `pnpm test:e2e`                     | 11 cases passed (fixture path unaffected)                                  |
| typecheck / lint / format / package | passed                                                                     |

## Incomplete / limitations

- New profiles on this deployment inherit model routing; the measured `modelReady` is true. The "model not configured"
  guidance path is covered only by the store/unit tests; not-ready was never observed on the real service.
- Appearance editing (changing shape/color of an existing Bot), rename, and the real organizing UI for
  sections/pinning/search are still pending in later M2 work.
- The roster read cache may lag after creation; currently an upsert selects the Bot immediately and the background
  refresh aligns on the next roster tick.

## 2026-11-04 Reachability note for the "model not configured" state

Attempts to construct a dedicated "model not configured" Bot through the Dashboard API in order to verify the
configuration guidance all failed:

- `PUT /api/profiles/<name>/model` with an empty provider/model returns 400;
- after creating through `profiles.create` (`mirror_credentials:false`, no model), the Bot still inherits a usable
  model from the environment (`checkModelReady.ready=true`);
- all 13 existing Bots have a provider/model.

Therefore this acceptance scenario **cannot be constructed with only Dashboard API authorization**; it needs a
genuinely unconfigured environment, or explicit authorization to temporarily clear the model of a test profile;
the client has no "fake not-ready state" test bypass. For the remaining creation / appearance / model-ready
read-back evidence, see above.

## 2026-11-04 Second attempt at "model not configured" after authorized configuration (not reachable at the API layer)

The user authorized direct use of the test server configuration. By decrypting the existing session in the
Electron main process and calling the test server REST directly:

| Attempt                                           | Result                                                                                                                  |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `PUT /api/profiles/<name>/model` with empty value | 400                                                                                                                     |
| `PUT` with ollama/openai/anthropic/custom         | all 400 (profile has no credentials; validation rejected)                                                               |
| `POST /api/profiles` without provider/model       | 200, but both `/api/profiles` and `/api/model/info` report the inherited default model `gpt-6-luna-900k / openai-codex` |
| `POST /api/profiles` with another provider/model  | same as above; still reports the default model                                                                          |

Conclusion: the profile creation path on this deployment automatically inherits the default model, and
`/api/model/info` also returns that inherited value, so the "model not configured" state **cannot be constructed
through the existing API**; this is not a client logic issue. The script is kept as a diagnostic:
`scripts/probe-model-not-ready-api.mjs`. The plugin-disabled state likewise requires server-side plugin
configuration/restart; the API does not expose it.

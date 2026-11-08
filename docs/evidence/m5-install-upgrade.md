# M5 · Signing Configuration, Clean Install and In-place Upgrade · Evidence

- Card: M5 (signing and notarization, clean install, in-place upgrade and data recovery; README release-candidate acceptance items 9 and 10)
- Status: **Clean install of the unsigned (ad-hoc) ZIP on this machine passed; v1→v2 in-place upgrade and corruption fallback passed**;
  Developer ID signing/notarization configuration is ready but **not verified without a certificate**; a real clean system / another Mac has not been tested
- Recorded: 2026-11-04
- Data nature: packaged artifact (ZIP extraction + fresh userData) + E2E (local state migration)

## Environment

| Item         | Value                                                     |
| ------------ | --------------------------------------------------------- |
| Machine / OS | Apple M4 (`Mac16,10`), macOS 15.8.2 (24H232), AC power    |
| Runtime      | Node v26.13.0; Electron 45.2.1; app 0.1.0                 |
| Artifact     | `out/make/zip/darwin/arm64/MosBot-darwin-arm64-0.1.0.zip` |

## Signing and notarization configuration

`forge.config.js` now enables signing and notarization from environment variables; by default it
still produces an unsigned ZIP, and does not treat the ad-hoc signature as a release signature:

| Environment variable         | Purpose                                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `MOSBOT_MACOS_SIGN_IDENTITY` | Developer ID Application certificate identity; enables `osxSign` + hardened runtime + `build/entitlements.mac.plist` |
| `MOSBOT_NOTARY_APPLE_ID`     | Apple ID for notarytool                                                                                              |
| `MOSBOT_NOTARY_PASSWORD`     | app-specific password                                                                                                |
| `MOSBOT_NOTARY_TEAM_ID`      | Apple Team ID                                                                                                        |

`build/entitlements.mac.plist` keeps only the two entries required by Electron/hardened runtime:
`allow-jit`, `allow-unsigned-executable-memory` (`@electron/osx-sign` only recognizes
`optionsForFile`; a top-level `entitlements` is ignored — fixed accordingly, and the helpers keep
their own default entitlements).

### Local certificate trial (2026-11-04, local certificate used with user authorization)

This machine only has an **Apple Development** certificate (no Developer ID Application); the signing
chain was verified with it:

| Check                                | Result                                                                                                                 |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Build command                        | `MOSBOT_MACOS_SIGN_IDENTITY="Apple Development: 345330319@qq.com (G5S2BZ4NZ6)" pnpm make`                              |
| Signing identity                     | `Authority=Apple Development: 345330319@qq.com (G5S2BZ4NZ6)`, `TeamIdentifier=8G993L24AS`                              |
| Hardened runtime                     | ✅ `flags=0x10000(runtime)`                                                                                            |
| entitlements                         | ✅ `allow-jit`, `allow-unsigned-executable-memory` actually signed in (only effective after the fix)                   |
| `codesign --verify --deep --strict`  | ✅ exit code 0                                                                                                         |
| Signed ZIP                           | 313 MB, SHA-256 `ad688e8a611d7b10a9e6364c50004171b05faaa72960bfd58ca2294c5d6019af`                                     |
| Extract + launch with fresh userData | ✅ title/version/bundle, fixture roster, offline connect overlay all normal                                            |
| Gatekeeper (`spctl`)                 | ❌ rejected — Apple Development is not a Developer ID, so it cannot be distributed externally                          |
| Notarization                         | ❌ not done: notarytool requires Developer ID and an Apple ID app-specific password, neither of which this machine has |

Conclusion: **the signing configuration, hardened runtime, entitlements, signature verification and
clean launch of the signed artifact are verified**; Developer ID signing + notarization + passing
Gatekeeper for external distribution are still blocked on a certificate.

## Clean install (ZIP extraction on this machine + fresh userData)

Command: `pnpm test:install` (`electron-forge make` → `scripts/verify-install.mjs`)

| Check                                   | Result                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------ |
| ZIP                                     | `MosBot-darwin-arm64-0.1.0.zip`, 327,730,764 B (about 313 MB)            |
| SHA-256                                 | `a9f7965ca0f2fc0ca6c3be063d1c669ca114d91b7747cd3a4f35666fe04f735f`       |
| Extraction                              | `ditto -x -k` to a temporary directory, 1.3 s                            |
| Launch to DOM ready                     | 4.8 s (window first appears; launch outside extraction included)         |
| Total                                   | 9.8 s                                                                    |
| Window title / version / bundle id      | MosBot / 0.1.0 / `com.mosbot.desktop` ✅                                 |
| fixture roster, footer, connect overlay | all visible, can open offline ✅                                         |
| No credential file before login         | ✅ (`dashboard-credentials.json` does not exist)                         |
| Signature                               | **ad-hoc, rejected by `spctl`** (no Developer ID certificate configured) |

Note: the shell of this execution environment rejects Chromium's own sandbox; the script launches
with `--no-sandbox` by default and records that in the report
(`isolatedRendererSandbox:false`); `MOSBOT_TRY_SANDBOX=1` can attempt an isolated launch in
environments that allow the sandbox. This difference does not affect the signature-state judgement
of the packaged artifact itself.

Raw report: `docs/evidence/tmp/install-verify-2026-11-04T05-18-53-891Z.json`.

## In-place upgrade and data recovery

Command: `pnpm test:e2e tests/e2e/upgrade.spec.ts` (packaged artifact + userData simulating the
previous test version)

| Scenario                                                                      | Result                                                                                                                                                                                    |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Previous test version `local-state.json` v1 (draft, selected Bot, dark theme) | On launch the draft and selected Bot are restored and the theme stays dark; after the 600 ms debounce it is upgraded in place to v2, `organization` is filled in and the draft is kept ✅ |
| Main document corrupted + previous-version backup intact                      | Loading falls back to `.bak` and restores the draft rather than defaulting; the main document is not overwritten before the next successful write ✅                                      |
| Main document corrupted and no backup                                         | The app does not crash; before the next save the corrupt file is kept as `local-state.json.corrupt`, then a new document is written (unit test) ✅                                        |
| Newer schema refuses overwrite                                                | A newer-version document is not overwritten; `save` returns `newer-schema` (unit test) ✅                                                                                                 |

Implementation: `src/main/local/store.ts` gains two paths — "fall back to the backup when the main
document is unreadable / a newer version" and "save a corrupt document as `.corrupt`"; local state
remains an atomic write plus a previous-version `.bak` backup.

## Not covered / closing conditions

- **Developer ID signing, notarization, Gatekeeper**: the Apple Development signing chain was tested
  with a local certificate; closing still needs a Developer ID Application certificate and notarytool
  credentials (Apple ID app-specific password + Team ID), then `pnpm test:install` to check
  `kind=developer-id` and that `spctl` accepts.
- **A real clean system**: this run simulated extraction-install on this machine with a temporary
  directory + fresh userData; it was not verified on another Mac or under a new macOS user, nor was
  the post-download quarantine attribute (blocked by Gatekeeper without a signature).
- **Previous test-version installer**: there is currently no distributed old-version installer; the
  upgrade was simulated with a "v1 local state document"; a real in-place install (preserving
  connections/read positions/preferences) still needs re-verification once an old package is available.
- **DMG / installer**: still ZIP only (extract and use); no maker-dmg dependency was added.
- **Force-quit pending send**: release-candidate acceptance requires that "pending sends are not
  automatically resent after a force quit"; this run did not construct it; it needs a test that kills
  the process during a real send.
- **Size**: the ZIP is about 313 MB (the Electron runtime accounts for most of it); dependency trimming
  inside asar still needs evaluation.

# M5 · Packaged Artifact · Evidence

[简体中文](m5-package-zh.md)

- Status: **The Apple Development–signed ZIP is built and passes the clean-install check on this machine** (hardened runtime + minimal
  entitlements + `codesign --verify` passing); Developer ID signing/notarization still blocked on a certificate; DMG not done
- Recorded: 2026-11-04
- Reference machine: Apple M4, macOS 15.8.2, Node v26.13.0, pnpm 11.28.5

## Implementation

- Forge `makers` uses `@electron-forge/maker-zip` (darwin); `pnpm package` serves E2E/probes, and
  `pnpm make` produces the distributable package.
- `forge.config.js` enables Developer ID signing, hardened runtime and notarization from environment
  variables; **release builds can optionally use a complete ad-hoc signature** (`MOSBOT_ADHOC_SIGN=1
pnpm make` makes `postPackage` run `codesign --force --deep --sign -`), while routine test builds
  stay linker-signed (otherwise the keychain credentials in existing userData cannot be decrypted).
  ad-hoc is not a release signature and `spctl` still rejects it;
  see `build/entitlements.mac.plist` for entitlements (only `allow-jit`,
  `allow-unsigned-executable-memory`).
- The packaging ignore list excludes build artifacts, docs, tests and dev-only dependencies (ZIP about
  313 MB, asar enabled).

## Results

| Check                                                           | Result                                                                                  |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm make`                                                     | ✅ passed                                                                               |
| Artifact                                                        | `out/make/zip/darwin/arm64/MosBot-darwin-arm64-0.1.0.zip`, 327,730,764 B (about 313 MB) |
| SHA-256                                                         | `a9f7965ca0f2fc0ca6c3be063d1c669ca114d91b7747cd3a4f35666fe04f735f`                      |
| Signature                                                       | ad-hoc, rejected by `spctl` (no Developer ID certificate configured)                    |
| Clean install (extract + fresh userData)                        | ✅ see `m5-install-upgrade.md`                                                          |
| In-place upgrade and data recovery (v1→v2, corruption fallback) | ✅ see `m5-install-upgrade.md`                                                          |
| DMG / installer                                                 | ⏳ not done (the current ZIP is extract-and-use)                                        |

## TODO

- Once a Developer ID Application certificate is available: set `MOSBOT_MACOS_SIGN_IDENTITY` and
  `MOSBOT_NOTARY_*`, run `pnpm make`, and use `pnpm test:install` to verify `kind=developer-id` and
  Gatekeeper acceptance; then re-verify download, quarantine and installation on another Mac / under a
  new user (the signing chain has been verified on this machine with an Apple Development certificate,
  see `m5-install-upgrade.md`).
- Evaluate whether to add DMG and size optimization; use a real old test-version installer for the
  in-place upgrade.

## 2026-11-04 Optional ad-hoc signing

With `MOSBOT_ADHOC_SIGN=1 pnpm make` and no `MOSBOT_MACOS_SIGN_IDENTITY` set, `postPackage` applies a
complete ad-hoc signature to the artifact:

```
Identifier=com.mosbot.desktop
Info.plist entries=31
Signature=adhoc
codesign --verify --deep --strict  → 0
```

This fixes the artifact having `Identifier=Electron` and an unbound Info.plist (one prerequisite for
macOS notification registration); but changing the code identity invalidates the safeStorage
credentials in old userData (`vault_unavailable`), so it is only a release-build switch and test
packages are unsigned by default. `spctl` still rejects it (no Developer ID); a second Mac needs
right-click → Open.

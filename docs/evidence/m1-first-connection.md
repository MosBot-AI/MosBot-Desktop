# M1 · First Connection and Silent Restore · Evidence

[简体中文](m1-first-connection-zh.md)

- Card: M1 (first connection, login, and credential storage); the M0b protocol foundation has been verified against the real service
- Status: **First-connection UI and credential persistence complete and verified**; M1's switch to real roster/chat data has not started
- Recorded: 2026-11-04
- Data source: real Dashboard `192.168.2.171:9119` (v0.22.5 / `bf0203a794`); the chat in the UI screenshots is still redacted fixture

## Implemented

- Bottom-left connection entry: the footer shows the real account and connection status dot (still shows the design-sample marker when disconnected).
- First-connection sheet (`ConnectionDialog`): Dashboard address input, preflight state, login method selection, browser handoff, connection summary (account/address/session validity), sign-out and retry; errors show zh/en copy by type.
- Login chain: `preflight → /auth/native/authorize (system browser) → loopback callback → /auth/native/token` (RFC 8252 PKCE + state validation); select a provider first when there are multiple.
- Credential storage: the refresh token is encrypted via Electron safeStorage (Keychain) and written to `dashboard-credentials.json` in userData; the access token stays in memory only; **non-secret** preferences (last address) go to `dashboard-settings.json`.
- Silent restore: on app startup, read the last address and call `dashboard.restore`; on success the footer shows the account without prompting for input; on failure it prompts to sign in again by type such as `session_expired`.
- Security boundary: the renderer only receives the account snapshot and never sees the token; IPC only accepts the app's own top-level frame.

## Verification

| Check                                                | Result                                                                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck` / `pnpm lint` / `pnpm format:check` | Pass                                                                                                                              |
| `pnpm test`                                          | 96 cases pass (including protocol, transport, PKCE, credential store, RPC, store)                                                 |
| `pnpm test:e2e`                                      | 10 cases pass, new "open connection sheet → invalid address error → Esc closes and returns focus"                                 |
| Real login                                           | The user completed one `basic` login in the system browser; `/api/auth/me`, refresh rotation, ws-ticket all pass                  |
| Silent restore                                       | No browser, no input; after restarting the app the footer directly shows account `research`; screenshot `12-connected-footer.png` |
| Credentials not in plaintext                         | The credential file is safeStorage ciphertext; the renderer cannot read the token                                                 |

## Screenshots

- `docs/evidence/screens/m0a/12-connection.png`: first-connection sheet (disconnected, address prefilled with the test deployment)
- `docs/evidence/screens/m1/12-connected-footer.png`: silent restore after restart, footer shows the account
- `docs/evidence/screens/m1/13-connection-connected.png`: connected summary (account/address/session validity/sign-out)

## TODO (M1 follow-up)

- Replace the fixture roster with real `profiles.list`; real Bot Chat history, streaming replies, stop, and resume.
- Draft isolation, notifications, and window lifecycle after in-app re-login/sign-out.
- User hands-on acceptance (currently only automated screenshots and probe verification).

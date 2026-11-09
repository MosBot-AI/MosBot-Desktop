# M0c · Computer Lease Atomic Conditional Claim · Patch and Deployment Notes

[简体中文](m0c-atomic-lease-zh.md)

- Status: **The patch is kept only as a reference proposal; not deployed and the test server is not modified** (user 2026-11-04 clarification: the authorization scope is only the Dashboard API, not server code/deployment/restart)
- Conclusion: M0c's "non-preemptive atomic claim" must be implemented server-side; it cannot be completed from the client within the existing API scope. The corresponding M4 item remains an external dependency; the user must decide whether to have the server team implement it or adjust the v1 scope
- Recorded: 2026-11-04
- Deployed source baseline: `bf0203a794` (test server v0.22.5, `~/.hermes/hermes-agent` working tree clean)
- Patch: `docs/patches/0001-display-lease-atomic-claim.patch`

## Problem (confirmed on the specified deployment)

Two viewers open the same profile's computer screen at the same time: after A acquires control, B's direct `display.lease.acquire` still succeeds, and A is kicked offline by RFB close(4000) (certificate: `tmp/computer-dual-2026-11-04T08-41-37-535Z.json`). The existing `lease.acquire` is last-writer-wins; although `_transition` has a file lock, the semantics of acquire itself allow later arrivals to overwrite, so the "read-then-acquire" check has a race and the server has no rejection path.

## Patch Contents

`tools/bot_desktop/lease.py`

- Adds `LeaseConflict(lease)`: carries the authoritative lease and means "another human viewer currently holds it".
- Adds `acquire_if_free(viewer_id, reason)`: completes "read current holder → determine conflict or write new holder → epoch+1" inside the **same** per-profile file lock; on conflict the lease is not modified. Repeated acquire by the same viewer is idempotent (does not bump epoch).
- Keeps the original `acquire(...)` as an explicit forced path and notes in the docstring that it must not be used as a regular Take over entry (the first-version client does not use it).

`tui_gateway/methods_display.py`

- `display.lease.acquire` now uses `acquire_if_free`; after catching `LeaseConflict` it returns `_err(..., data={"code": "lease_conflict", "lease": public_view(conflict.lease)})`. The client shows "Someone else is controlling" instead of treating the failure as a disconnect.

## Client-side Companion (committed)

- RPC errors now carry `error.data.code` (`ProtocolError.serverCode`); the machine-readable code is no longer dropped.
- When the viewing window's acquire receives `lease_conflict`, it stays read-only and shows "Someone else is controlling; they need to hand it back first.", without marking the state as disconnected; non-conflict errors still follow the original logic.
- Unit tests: `tests/unit/rpc.test.ts` covers error.data.code passthrough.

## Deployment Steps (requires SSH/server permissions)

```bash
# 1. Apply the patch in the test server source directory (bf0203a794 clean working tree)
cd ~/.hermes/hermes-agent      # source path on the test server
git apply --check /path/to/0001-display-lease-atomic-claim.patch
git apply /path/to/0001-display-lease-atomic-claim.patch

# 2. Restart the gateway/Dashboard process so it loads the Python changes (choose per deployment)
#    systemd: sudo systemctl restart hermes-dashboard   (example; use the actual unit name)
#    or supervisorctl restart ...

# 3. Do not modify global config; re-verify with two clients
```

## Impact and Rollback

- Scope: only the lease acquire path in bot-desktop. Normal chat, Kanban, and approvals do not go through this code; other clients that rely on "later arrival overwrites" will be rejected (exactly the purpose of this patch; client copy must be updated in sync).
- Rollback: run `git apply -R docs/patches/0001-display-lease-atomic-claim.patch` then restart the process; no config/data modified and the lease file structure is unchanged (still `holder/viewer_id/since/reason/epoch`).
- Compatibility: `acquire_if_free` is added and the old `acquire` is kept, so rollback does not affect existing callers.

## Re-verification Conditions (closing the M0c / M4 blocker)

1. Two viewers: A acquires first successfully; B's acquire then returns `lease_conflict`, **A is not kicked**, and B shows another person's control.
2. After A releases, B can acquire.
3. Late receipts / closing the window / disconnect: losing the viewer identity must not release someone else's lease; closing the window releases one's own lease.
4. Record the dual-viewer script output and the new report on this page, and update item 8 of `acceptance.md` and `capabilities.md`.

Re-verification script: `node scripts/gui-computer-dual.mjs` (currently expected to output `takeover-allowed`; after the patch it should be `takeover-refused`).

## Authorization Scope and Next Steps

- The user clarified: only the test server's Dashboard API may be used (login, messaging, approvals, Kanban, display RPC/REST/WS, etc.); **modifying or deploying server code and restarting the service are not authorized**.
- Therefore the patch and deployment steps in this doc are kept only as a "reviewable reference implementation" and are not executed. `scripts/gui-computer-dual.mjs` will still record `takeover-allowed` on the unpatched deployment.
- M0c blocker ownership: server capability (to be implemented by the Hermes server team/deployment owner); the client has completed conflict-receipt handling and automatic read-only recovery after being kicked, and this is as far as the API scope allows. Only an explicit change of the v1 scope by the user can move this item out of the required set.

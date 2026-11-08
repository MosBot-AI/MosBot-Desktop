# UI Test Background Mode (without disturbing the user)

- Purpose: make all automated UI tests not steal focus, not show windows, and not occupy the Dock, so the user can keep
  using the computer normally.
- Change: the main process supports `MOSBOT_TEST_BACKGROUND=1`; the E2E harness and all `scripts/gui-*.mjs` enable it by default.
- Only checks that need a human to watch use `MOSBOT_TEST_FOREGROUND=1` (for example, confirming macOS notification banners
  and screen-recording screenshots).

## Implementation

- Main window and computer viewer window: `show:false` and never `show()`; `focusable:false`, `skipTaskbar:true`,
  `hasShadow:false`; `backgroundThrottling:false` keeps timers/rAF running normally while hidden.
- On startup `app.setActivationPolicy('accessory')` + `app.dock.hide()`: no Dock icon and the app is not activated.
- `ensureWindow()` / `activate` only recreate the window in background mode, without show/focus.
- Notification decisions rely on "window not visible / not focused", which hidden windows satisfy naturally; the
  notification request/click paths remain testable.

## Verification

Runtime environment probe (packaged artifact, `MOSBOT_TEST_BACKGROUND=1`):

```json
{
  "windows": [{ "visible": false, "focusable": false, "minimized": false }],
  "dockVisible": false,
  "active": false
}
```

Regression in hidden mode:

| Check                                                                                                   | Result   |
| ------------------------------------------------------------------------------------------------------- | -------- |
| Full E2E (fixture + packaged artifact)                                                                  | ✅ 21/21 |
| Real-service cold start + draft restore (`gui-connected-draft`)                                         | ✅       |
| Real approval window close / notification request / Dock reopen / quit restart (`gui-window-lifecycle`) | ✅ 11/11 |

Reports: `docs/evidence/tmp/connected-draft-2026-11-04T10-59-36-265Z.json`,
`docs/evidence/tmp/window-lifecycle-2026-11-04T11-01-27-248Z.json`.

## Scenarios that still need the foreground

- Viewing macOS notification banner pixels and clicking notifications with a real mouse;
- Screen-recording/screenshot acceptance (`screencapture` also needs screen-recording permission);
- Actual user trial and visual-baseline confirmation.

These scenarios will ask the user first, or explicitly run with `MOSBOT_TEST_FOREGROUND=1` with an explanation.

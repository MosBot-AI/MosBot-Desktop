# M1 · Main Window Close / Dock Reopen / Quit and Restart · Approval Lifecycle Evidence

[简体中文](m1-window-lifecycle-zh.md)

- Card: M1 / release-candidate acceptance "background, closing the main window, reopening from the Dock, and restarting after quit all have results"
- Status: **Real-service GUI full chain passes** (packaged artifact + dedicated Bot, auto-cleaned)
- Recorded: 2026-11-04
- Data nature: real Dashboard `192.168.2.171:9119`; notification banner pixels not collected (no screen-recording permission)

## Method

`scripts/gui-window-lifecycle.mjs` (`MOSBOT_DIAG=1`, test diagnostics only):

1. Trigger a real approval inside the dedicated Bot and confirm the inline card is pending;
2. Close the main window (macOS keeps the app process);
3. Wait for the pending watcher to request a system notification (recorded by the diagnostics hook);
4. Simulate Dock reopen via the main process `app.emit('activate')` and verify the approval card is re-delivered and can be denied;
5. Trigger another approval and then **fully quit the app**, relaunch the same userData, and verify the session is restored, the approval is still pending and can be denied.

## Results

| Phase        | Check                                                               | Result                                             |
| ------------ | ------------------------------------------------------------------- | -------------------------------------------------- |
| Close window | Close the main window while an approval is pending                  | ✅ process still running, window count 0           |
| Close window | Main process requests a system notification (no window → unfocused) | ✅ `Needs your confirmation`                       |
| Dock reopen  | `activate` rebuilds the main window                                 | ✅                                                 |
| Dock reopen  | Approval card re-delivered                                          | ✅                                                 |
| Dock reopen  | Deny receipt                                                        | ✅ "Denied"                                        |
| Quit/restart | Full quit then relaunch                                             | ✅ session restored (Bot Chat nameplate correct)   |
| Quit/restart | **Approval still pending after restart and re-delivered**           | ✅ (gateway keeps the request; resume re-delivers) |
| Quit/restart | Deny receipt after restart                                          | ✅ "Denied"                                        |

Report: `docs/evidence/tmp/window-lifecycle-2026-11-04T10-00-29-380Z.json`.

## Conclusion and Limitations

- Closing the main window does not lose approvals: the main-process connection stays, the watcher requests a notification when there is no window; Dock reopen rebuilds the window and re-delivers the card.
- Full quit then restart: the gateway keeps unanswered approvals and re-delivers them as `open_requests` on resume; the client displays and handles them on the same session.
- **Notification banner pixels and a real mouse click are still not verified** (this machine's shell has no screen-recording permission); see `m1-background-approvals.md` for the notification request and click handling path.
- "Approvals for unopened Bots" still requires another client to keep attached (see the behavior notes in `m1-background-approvals.md`).

# M1 · System Notification Visual Verification (Permission Prompt Confirmed, Approval Banner Awaiting Re-verification)

- Status: **Partially verified**. The macOS notification permission prompt did appear and was captured; the approval notification banner was not captured in this trigger (the signed app was restarted/window state not restored, see below).
- Recorded: 2026-11-04
- Data nature: real Dashboard + signed package (`out/MosBot-signed.app`, complete ad-hoc signature); screenshots cropped to the notification banner area, no other desktop content.

## Completed

1. After the user granted screen-recording permission, `screencapture` can capture the real screen; previously black.
2. The user launched `MosBot-signed.app` from Finder and signed in again; the process runs under `/Users/charleypeng/Library/Application Support/MosBot`.
3. After creating a real approval with a hidden test instance, macOS showed for the first time the ""MosBot" Would Like to Send You Notifications / Notifications may include alerts, sounds, and icon badges." permission prompt; after clicking it, System Settings → Notifications → MosBot opened, showing "Allow Notifications" on and banner style selected.
4. `defaults read com.apple.ncprefs` showed a `com.mosbot.desktop` entry.

Screenshot: `screens/m1/notification-permission.png`.

## Not Completed

- **The pixels of the real approval notification banner and a real mouse click have not been captured**:
  - Signed instance launched by the user from Finder: after the test instance made an approval and the signed app's main window lost focus/was minimized, the main-process diagnostics recorded that a notification was requested (title=dedicated Bot name, body="Needs your confirmation", shown=true), but 20 consecutive screen captures (every 700 ms) showed no banner.
  - Retried with the signed binary + a copy of the user userData launched in Playwright: it likewise recorded `shown=true`, with no banner in the captures; after a synthetic click (Swift CGEvent) the window was still minimized (the click did not hit the banner).
  - Possible causes: differences in notification authorization sync for processes not launched via LaunchServices, or the system's notification display style not as expected; the user needs to confirm on their own instance (whether Notification Center has a MosBot entry, whether the notification style is "Banners"), then decide whether to continue verification.
- The committed screenshot is only the macOS permission prompt (`screens/m1/notification-permission.png`), **not the approval banner**.

# M1 · System Notification Visual Verification (Permission Prompt Confirmed, Approval Banner Awaiting Re-verification)

[简体中文](m1-notification-visual-zh.md)

- Status: **Banner visually verified and the click navigation fixed on 2026-11-09.** A real pointer click after the fix has not been repeated, but the exact notification-click IPC path is covered by a real-service regression.
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

## 2026-11-09 Re-run

- Command: `node scripts/gui-notification-signed.mjs` while the user's signed app was running from Finder and the system screen-recording permission was available.
- The `com.mosbot.desktop` notification preference entry was present before and after the run.
- The script created a real approval from a hidden test instance and captured 20 full-screen frames at 700 ms intervals. **No notification banner pixels appeared in the top-right region of any frame**, and no MosBot window was restored during capture.
- Report (ignored working data): `docs/evidence/tmp/notification-signed-2026-11-09T14-31-32-486Z.json`.
- Next checks before another attempt: confirm Focus/Do Not Disturb is off, System Settings → Notifications → MosBot uses "Banners", and the signed app is signed in to the same account as the probe (probe selected profile `mosbot-qa2`; the signed app currently selects `default`).

## 2026-11-09 Successful Trigger

- After the user checked the notification settings, the same command produced a real macOS banner at 22:42: title `mosbot-probe-gui-224024`, body `需要你确认`, MosBot icon.
- Screenshot (cropped to the banner): `screens/m1/notification-banner-2026-11-09.png`.
- The signed app showed the in-app "待确认 · 1" badge while the request was pending.
- Click path: the signed app window came to the front and showed the pending badge, but the captured frames show `mosbot-qa2` selected with an empty chat rather than the probe Bot's approval card. User confirmation is needed: whether they clicked the banner, and whether the probe Bot's approval card opened.

## 2026-11-09 Click Path Regression

- Script: `node scripts/gui-pending-open.mjs` (real service, probe profile).
- It creates a Bot that is absent from the renderer roster, then sends the same `pendingEvent {type:"open", profile}` IPC that a system-notification click sends.
- Before the click: the renderer roster did not contain the new profile. After the click: the roster refreshed, `selectedProfile` changed to the new profile and the nameplate showed the new Bot. This is the exact case that previously only restored the window.
- Report (ignored working data): `docs/evidence/tmp/pending-open-2026-11-09T15-45-09-989Z.json`.
- Unit coverage: `tests/unit/pending-open.test.ts` (known, new, refresh-failure and deleted-profile cases).

# M5 · Keyboard / IME / Zoom / Reduced Motion / Focus Order · Evidence

- Card: M5 (GUI and accessibility regression; README release-candidate acceptance item 9 "keyboard, Chinese IME, zoom, reduced motion and focus order have runtime verification")
- Status: **Automated regression passed** (packaged artifact + real Electron window); VoiceOver manual walkthrough and system display scaling pending user acceptance on a real machine
- Recorded: 2026-11-04
- Data nature: fixture design slice (no Dashboard connection); command: `pnpm test:e2e` (after `electron-forge package`)

## Environment

| Item         | Value                                                           |
| ------------ | --------------------------------------------------------------- |
| Machine / OS | Apple M4 (`Mac16,10`), macOS 15.8.2 (24H232)                    |
| Runtime      | Node v26.13.0; Electron 45.2.1; app 0.1.0                       |
| Window       | 1000 × 760 (default), Playwright driving a real Electron window |

## Implementation

- **macOS application menu** (`src/main/menu.ts`): app menu (About / Settings… / Hide / Quit),
  File (New Bot `Cmd+N`, Search Bots `Cmd+K`, Close Window), Edit (Undo / Redo / Cut / Copy /
  Paste / Select All, preserving the system Chinese IME and clipboard behavior), View (Zoom In /
  Zoom Out / Actual Size / Enter Full Screen), Window (Show Main Window `Shift+Cmd+M`, Minimize,
  Zoom, Bring All to Front).
- Menu commands reach the renderer over narrow IPC and reuse the existing overlay actions: New Bot,
  search, footer "Appearance & Language"; menu copy switches between Simplified Chinese / English
  with the UI language (`setMenuLanguage`).
- **Zoom**: zoom in / zoom out / actual size use `webContents.setZoomLevel`, `Cmd+=` / `Cmd+-` / `Cmd+0`,
  range −2…+3.
- **Focus**: after a menu command opens the footer menu, focus enters the menu's first item and
  returns to the footer entry after Esc/close; the search and new-bot overlays keep their existing
  "focus on open, refocus on close" behavior.
- Tests add `tests/e2e/m5-accessibility.spec.ts` (6 cases).

## Verification results

| Check                                                                                                                                                                                     | Result                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Menu → New Bot: overlay opens with the name input focused; Esc closes it                                                                                                                  | ✅                                                        |
| Menu → Search Bots: overlay opens with the input (combobox) focused; Esc closes it                                                                                                        | ✅                                                        |
| Menu → Settings: footer "Appearance & Language" opens with focus on the menu's first item; after Esc focus returns to the footer entry                                                    | ✅                                                        |
| Language switch: after clicking English the native menu items become `New Bot` / `Settings…`; after switching back they are `新建 Bot`                                                    | ✅                                                        |
| Zoom: `Cmd+=` twice → 1.2×; no horizontal overflow of the page (1000 × 760); `Cmd+0` back to 1.0×; `Cmd+-` → 0.91× then reset                                                             | ✅                                                        |
| Chinese IME: Enter during composition does not send (draft and transcript unchanged); after compositionend Enter sends normally                                                           | ✅                                                        |
| Shift+Enter inserts a newline in the composer and does not send                                                                                                                           | ✅                                                        |
| Reduced motion: with `prefers-reduced-motion: reduce`, `data-reduce-motion=true` and `--duration-press` is `0ms`; after restoring it is non-zero                                          | ✅                                                        |
| Accessible names: every visible `button / a / input / textarea / select` has a non-empty accessible name (including aria-label, labelledby, text, placeholder, title fallbacks)           | ✅                                                        |
| Keyboard reachability: the Tab order covers search, new bot, pending approvals, pinned, section row, footer settings, detail, work log, approval buttons, composer; every stop has a name | ✅ (see below)                                            |
| Full E2E regression                                                                                                                                                                       | **18 cases passed** (M0a 11 + persistence 1 + this run 6) |
| `pnpm test` / `typecheck` / `lint` / `format:check`                                                                                                                                       | ✅ (152 unit tests, see below)                            |

### Tab order excerpt (40 Tabs, abridged)

```text
停止 → 搜索 → 新建 Bot → 待确认 · 3 → 置顶头像 ×6 → 全部置顶
→ 产品分区（3 个 Bot）→ 分区行 ×3 → 日常分区（4 个 Bot）
→ 外观与语言 → 打开 … 的详情 → 工作记录 … → 允许 → 拒绝
→ 给 … 发消息 → 停止 →（回到起点）
```

Note: the first stop is "Stop" because a send before the test triggered the fixture reply
cadence and the composer was streaming; there is no hidden focus, and focus was never moved
outside the visible area.

## Network-disconnection notice (added 2026-11-04)

After a real disconnection the user reported that the viewing window only showed "the screen
connection was disconnected", with no clear indication that this was a network problem. Added:

- Main window: listens to `online/offline`; while offline a fixed `role="alert"` notice at the top
  reads "The network is disconnected; it will reconnect automatically when the network recovers.";
  the chat connection banner shows dedicated copy while offline instead of the generic
  "connection disconnected".
- Library: `unreachable` / `timeout` map to "The network is disconnected; please restore the network
  and retry.".
- Computer viewing window: while offline the status becomes "The network is disconnected; the screen
  will reconnect automatically when the network recovers."; after the network recovers the main
  process calls `display.observe` again for a new ticket (`computer.reconnect`) and the renderer
  rebuilds the RFB connection.
- Verification: E2E "losing the network shows a visible alert and recovers" passes (21 E2E cases
  all green); the viewing window's real network-recovery reconnect still needs re-verification in a
  network environment where the disconnection is reproducible.

## Not covered / next steps

- **VoiceOver manual walkthrough**: currently only names and Tab order are checked automatically;
  VoiceOver has not been used to actually read aloud / walk the rotor order. The user needs to be
  present for a real walkthrough and record it (window order, name reading, overlay focus).
- **Real Chinese IME**: composition events are synthetic events; a real macOS IME (Pinyin candidate
  window) was not tested. Before release, type a passage of Chinese manually and confirm the
  candidate window, Enter commit and Shift+Enter behavior.
- **System display scaling / Split View**: this run only verified in-app page zoom (1.0–1.2×); macOS
  "Display scaling" and Split View window-size combinations are not covered; the M5 support matrix
  needs additional testing before it can be stated.
- **Native menu screenshot**: the macOS menu bar cannot be captured with a window screenshot, so the
  evidence is automated assertions and menu-item copy assertions instead; the user can confirm
  manually during acceptance.
- **Accessible-name details**: the pinned button's name comes from the visible Bot name + `title`
  state, with no separate spoken state; approval/work-log button names come from visible text;
  `aria-describedby` with detailed state can be added later.

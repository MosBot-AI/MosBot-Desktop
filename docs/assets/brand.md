# Brand Asset Provenance and Usage

The MosBot brand assets in this repository come from the mobile project `~/dev/MosBot`, pinned at commit **`3c118c4`**. Assets are copied verbatim, without resampling; the UI colors them through CSS `mask`, so the same files serve both the light and dark themes.

## Sync Method

```bash
pnpm assets:sync   # node scripts/sync-brand-assets.mjs
```

The script verifies that the current HEAD of `~/dev/MosBot` is the pinned commit above, copies the files to `src/renderer/assets/brand/`, writes `provenance.json` (file, source path, SHA-256), and generates `artwork.ts`, which turns the path data of the wordmark and empty-chat artwork into inlinable SVG constants. When upgrading the source commit, review the code, artwork, and provenance diffs together.

## Asset Inventory

| File                          | Source (MosBot@3c118c4)                                           | License                | Purpose                                                                            |
| ----------------------------- | ----------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------- |
| `app-icon.png`                | `AppScope/resources/base/media/app_icon.png` (1024²)              | MIT (`MosBot-LICENSE`) | App/Dock/installer icon; M5 generates the multi-resolution `.icns`                 |
| `empty-chat.svg`              | `entry/src/main/resources/base/media/empty_chat_bubbles.svg`      | MIT (`MosBot-LICENSE`) | Empty-chat illustration; paths inlined by `artwork.ts`, strokes use `currentColor` |
| `wordmark-letters.svg`        | `entry/src/main/resources/base/media/mosbot_wordmark_letters.svg` | MIT (`MosBot-LICENSE`) | Wordmark glyphs in the bottom-left corner; paths inlined, fill `currentColor`      |
| `wordmark-eyes.svg`           | `entry/src/main/resources/base/media/mosbot_wordmark_eyes.svg`    | MIT (`MosBot-LICENSE`) | Wordmark eyes; paths inlined, fill `--accent-brand`                                |
| `artwork.ts`                  | Generated from the three SVGs above                               | Same as above          | Inline SVG path constants (do not edit by hand)                                    |
| `hermes-desktop-bots-LICENSE` | `licenses/hermes-desktop-bots-LICENSE`                            | MIT (Nous Research)    | License for the ported BotFace shapes/poses                                        |
| `MosBot-LICENSE`              | `LICENSE`                                                         | MIT                    | Brand artwork license                                                              |

## BotFace Port

The Bot faces in chat, the pinned grid, the nameplate, details, and the creation preview are not bitmaps but procedural SVG ported from mobile:

- Shapes and colors: `entry/src/main/ets/state/bot/BotFaceShapes.ets`
- Eyes and motion: `entry/src/main/ets/state/bot/BotFacePose.ets`
- Component structure: `entry/src/main/ets/components/bot/BotFace.ets`
- Appearance defaults/seed rules: `entry/src/main/ets/state/bot/BotRoster.ets`

The implementation lives in `src/renderer/features/bots/face/` and is used uniformly through `BotAvatar` / `BotLookFace`; porting details and tests are in that directory and `tests/unit/face.test.ts`. Rendering keeps a 40×40 viewBox, and shape and motion semantics match mobile.

## Constraints

- Do not repeat the brand wordmark throughout the chat navigation; chat shows only small avatars and the nameplate.
- Text on light Bot colors (for example MosBot's default `#AFE17B`) uses dark ink, see `readableInk` in `src/shared/color.ts`.
- Assets are sourced and registered only here; do not lift artwork from other projects or screenshots.
- The wordmark and empty-chat artwork do not use CSS `mask` + `?url`: packaged `file://` pages drop data-URI masks (found during M0a real-window verification), so the script generates inline SVG paths (`artwork.ts`). Small icons may still use inline SVG components.

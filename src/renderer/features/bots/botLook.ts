import type { BotProfile } from '../../../shared/domain';
import { normalizeColor, readableInk } from '../../../shared/color';

/**
 * The MosBot default look samples the app icon's lime; every other Bot keeps
 * the colour stored in its profile metadata.
 */
export const MOSBOT_BRAND_COLOR = normalizeColor('hsl(82 62% 68%)', '#afe17b');

export interface BotLook {
  readonly shape: BotProfile['shape'];
  readonly color: string;
  readonly seed: string;
}

/** The colour a face is painted with, resolving the MosBot default look. */
export function botFaceColor(bot: Pick<BotProfile, 'color' | 'useMosbotDefault'>): string {
  return bot.useMosbotDefault ? MOSBOT_BRAND_COLOR : normalizeColor(bot.color, MOSBOT_BRAND_COLOR);
}

/** User bubbles borrow the Bot colour; ink is chosen for legibility. */
export function userBubbleTheme(bot: Pick<BotProfile, 'color' | 'useMosbotDefault'>): {
  background: string;
  color: string;
} {
  const background = botFaceColor(bot);
  return { background, color: readableInk(background) };
}

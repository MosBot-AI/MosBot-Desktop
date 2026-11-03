/**
 * Body and eye colours for the Bot face, ported from the MosBot mobile client
 * (`entry/src/main/ets/state/bot/BotFaceShapes.ets`, MosBot @ 3c118c4, MIT).
 * Hex parsing and WCAG luminance come from `src/shared/color.ts` so the
 * renderer and the tests share one implementation.
 */

import { hexToRgb, luminance } from '../../../../shared/color';

const LIGHT_EYES = '#FFFFFF';
const DARK_EYES = '#111111';
/**
 * The mobile client puts white eyes on bodies whose plain luma is below 110
 * (of 255). Expressed as WCAG relative luminance that sits at ~0.16; 0.18 is
 * where white and near-black eyes have equal contrast, so the eyes stay
 * legible on mid-tone brand colours.
 */
const EYE_INK_LUMINANCE_LIMIT = 0.18;

/** White eyes on a dark body, near-black eyes on a light one. Unparseable input gets white eyes. */
export function eyeColorFor(bodyColor: string): string {
  if (hexToRgb(bodyColor) === null) {
    return LIGHT_EYES;
  }
  return luminance(bodyColor) < EYE_INK_LUMINANCE_LIMIT ? LIGHT_EYES : DARK_EYES;
}

function hexByte(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)));
  return (clamped < 16 ? '0' : '') + clamped.toString(16);
}

/** Mixes the colour toward its own gray (same luma) by `amount` in 0..1; unparseable input is returned as is. */
export function desaturate(hex: string, amount: number): string {
  const color = hexToRgb(hex);
  if (color === null) {
    return hex;
  }
  const mix = Math.max(0, Math.min(1, amount));
  const gray = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  return (
    '#' +
    hexByte(color.r + (gray - color.r) * mix) +
    hexByte(color.g + (gray - color.g) * mix) +
    hexByte(color.b + (gray - color.b) * mix)
  );
}

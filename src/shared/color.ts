/**
 * Colour helpers shared by the renderer, fixtures and unit tests. Pure: no DOM
 * or Electron APIs so the same functions run in the main process and in Vitest.
 */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const HEX_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/;
const HSL_PATTERN =
  /^hsla?\(\s*(-?\d+(?:\.\d+)?)(?:deg)?[\s,]+(\d+(?:\.\d+)?)%[\s,]+(\d+(?:\.\d+)?)%\s*(?:[,/]\s*\d+(?:\.\d+)?%?\s*)?\)$/;

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function toHexByte(value: number): string {
  const clamped = clampByte(value);
  return (clamped < 16 ? '0' : '') + clamped.toString(16);
}

/** Turns a CSS hex colour (`#rgb` or `#rrggbb`) into channels, else `null`. */
export function hexToRgb(value: string): Rgb | null {
  const match = HEX_PATTERN.exec(value.trim().toLowerCase());
  if (!match) {
    return null;
  }
  const digits = match[1];
  if (digits === undefined) {
    return null;
  }
  if (digits.length === 3) {
    return {
      r: parseInt(digits.charAt(0) + digits.charAt(0), 16),
      g: parseInt(digits.charAt(1) + digits.charAt(1), 16),
      b: parseInt(digits.charAt(2) + digits.charAt(2), 16),
    };
  }
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  };
}

/** CSS `hsl(...)` / `hsla(...)` to `#rrggbb`; hex input is normalised. */
export function hslToHex(hsl: string): string {
  const text = hsl.trim().toLowerCase();
  const hex = hexToRgb(text);
  if (hex) {
    return '#' + toHexByte(hex.r) + toHexByte(hex.g) + toHexByte(hex.b);
  }
  const match = HSL_PATTERN.exec(text);
  if (!match) {
    return '';
  }
  const hue = (((Number(match[1]) % 360) + 360) % 360) / 360;
  const saturation = Math.min(100, Number(match[2])) / 100;
  const lightness = Math.min(100, Number(match[3])) / 100;

  if (saturation === 0) {
    const channel = toHexByte(lightness * 255);
    return '#' + channel + channel + channel;
  }
  const amount = saturation * Math.min(lightness, 1 - lightness);
  const channelAt = (n: number): number => {
    const k = (n + hue * 12) % 12;
    const a = amount * Math.min(Math.max(Math.min(k - 3, 9 - k), -1), 1);
    return (lightness - a) * 255;
  };
  return '#' + toHexByte(channelAt(0)) + toHexByte(channelAt(8)) + toHexByte(channelAt(4));
}

/** `#rrggbb` for any accepted colour input, or `fallback`. */
export function normalizeColor(value: string, fallback = '#8b5cf6'): string {
  const normalized = hslToHex(value);
  return normalized === '' ? fallback : normalized;
}

/** Relative luminance (WCAG 2.1) in [0, 1]. */
export function luminance(value: string): number {
  const rgb = hexToRgb(normalizeColor(value));
  if (!rgb) {
    return 0;
  }
  const channel = (raw: number): number => {
    const c = raw / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** Contrast ratio between two colours, 1–21. */
export function contrastRatio(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Readable ink for text drawn on `background` (used for user bubbles, whose
 * colour is the Bot's colour). Keeps the Bot hue visible for light brands.
 */
export function readableInk(background: string): string {
  const base = normalizeColor(background);
  return contrastRatio(base, '#ffffff') >= 4.5 ? '#ffffff' : '#1b1a17';
}

/** The twelve edit-sheet swatches: `hsl(i*30 68% 58%)` as hex. */
export function botColorSwatches(): string[] {
  const swatches: string[] = [];
  for (let index = 0; index < 12; index += 1) {
    swatches.push(hslToHex(`hsl(${index * 30} 68% 58%)`));
  }
  return swatches;
}

/** A stable colour derived from a profile name, matching the mobile client. */
export function profileColor(name: string): string {
  const key = name.trim();
  if (key === '' || key === 'default') {
    return '';
  }
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return `hsl(${hash % 360} 68% 58%)`;
}

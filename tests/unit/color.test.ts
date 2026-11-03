import { describe, expect, it } from 'vitest';
import {
  botColorSwatches,
  contrastRatio,
  hexToRgb,
  hslToHex,
  luminance,
  normalizeColor,
  profileColor,
  readableInk,
} from '../../src/shared/color';

describe('colour conversion', () => {
  it('parses short and long hex', () => {
    expect(hexToRgb('#abc')).toEqual({ r: 170, g: 187, b: 204 });
    expect(hexToRgb('#AABBCC')).toEqual({ r: 170, g: 187, b: 204 });
    expect(hexToRgb('nope')).toBeNull();
  });

  it('converts hsl to hex and normalises hex through the same path', () => {
    expect(hslToHex('hsl(0 68% 58%)')).toBe('#dd4b4b');
    expect(hslToHex('hsl(0 0% 100%)')).toBe('#ffffff');
    expect(hslToHex('#ABCDEF')).toBe('#abcdef');
    expect(hslToHex('rgb(1 2 3)')).toBe('');
    expect(normalizeColor('not-a-colour', '#123456')).toBe('#123456');
  });

  it('computes WCAG luminance and contrast', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('#000000')).toBeCloseTo(0, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 3);
    expect(contrastRatio('#af e17b'.replace(' ', ''), '#ffffff')).toBeLessThan(4.5);
  });

  it('chooses a readable ink for light and dark bubbles', () => {
    expect(readableInk('#afe17b')).toBe('#1b1a17');
    expect(readableInk('#1b1c1e')).toBe('#ffffff');
    expect(readableInk('hsl(210 68% 18%)')).toBe('#ffffff');
  });

  it('generates twelve unique swatches and stable profile colours', () => {
    const swatches = botColorSwatches();
    expect(swatches).toHaveLength(12);
    expect(new Set(swatches).size).toBe(12);
    expect(profileColor('项目助理')).toBe(profileColor('项目助理'));
    expect(profileColor('a')).not.toBe(profileColor('b'));
    expect(profileColor('default')).toBe('');
  });
});

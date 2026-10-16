import { describe, expect, it } from 'vitest';

import { PALETTE } from '../../core/defaults';
import { accentTones, contrast, isHex, mix, readableOn, textOn } from '../palette';

const THEMES = [
  { dark: false, bg: '#F3F4F8', card: '#FFFFFF' },
  { dark: true, bg: '#0A0C12', card: '#151822' },
];

describe('colores personalizables', () => {
  it('calcula contraste y mezclas', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
    expect(contrast('#FFFFFF', '#FFFFFF')).toBeCloseTo(1, 5);
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
    expect(isHex('#4F46E5')).toBe(true);
    expect(isHex('rojo')).toBe(false);
    expect(textOn('#FFEE00')).toBe('#0A0C12');
    expect(textOn('#1E1B4B')).toBe('#FFFFFF');
  });

  it('con cualquier color de la paleta el texto se lee, en claro y en oscuro', () => {
    for (const accent of PALETTE) {
      for (const theme of THEMES) {
        const tones = accentTones(accent, theme.dark, theme.bg, theme.card);
        const label = `${accent} ${theme.dark ? 'oscuro' : 'claro'}`;
        expect(contrast(tones.primary, theme.card), `enlace sobre tarjeta ${label}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(tones.primary, theme.bg), `botón sobre fondo ${label}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(tones.onPrimary, tones.primary), `texto del botón ${label}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(tones.primary, tones.primarySoft), `botón suave ${label}`).toBeGreaterThanOrEqual(3.5);
        expect(contrast('#FFFFFF', tones.heroNeutral), `encabezado ${label}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('un color ya legible no se toca', () => {
    expect(readableOn('#1E1B4B', '#FFFFFF', 4.5)).toBe('#1E1B4B');
  });
});

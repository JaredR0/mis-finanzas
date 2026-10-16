/**
 * Matemática de color para el tema personalizable (sin dependencias).
 * A partir del color que elige el usuario se derivan los demás tonos,
 * cuidando siempre que el texto se pueda leer.
 */

export type RGB = [number, number, number];

export const isHex = (value: unknown): value is string => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);

export function toRGB(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export const toHex = ([r, g, b]: RGB): string =>
  '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();

/** Mezcla `a` con `b`; `amount` = cuánto de `b` (0 a 1). */
export function mix(a: string, b: string, amount: number): string {
  const x = toRGB(a);
  const y = toRGB(b);
  return toHex([0, 1, 2].map((i) => x[i] + (y[i] - x[i]) * amount) as RGB);
}

export function luminance(hex: string): number {
  const [r, g, b] = toRGB(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contraste WCAG entre dos colores (1 a 21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Oscurece o aclara `color` poco a poco hasta que se lea bien sobre `background`. */
export function readableOn(color: string, background: string, minimum: number): string {
  const toward = luminance(background) > 0.4 ? '#000000' : '#FFFFFF';
  let result = color;
  for (let step = 0; step < 20 && contrast(result, background) < minimum; step++) {
    result = mix(result, toward, 0.08);
  }
  return result;
}

/** Blanco o casi negro, el que mejor se lea encima de `background`. */
export const textOn = (background: string): string =>
  contrast('#FFFFFF', background) >= contrast('#0A0C12', background) ? '#FFFFFF' : '#0A0C12';

export interface AccentTones {
  primary: string;
  primarySoft: string;
  onPrimary: string;
  heroNeutral: string;
}

/** Tonos derivados del color elegido, para fondo claro u oscuro. */
export function accentTones(accent: string, dark: boolean, bg: string, card: string): AccentTones {
  // Debe leerse como texto sobre las tarjetas y distinguirse como botón sobre el fondo.
  const primary = readableOn(readableOn(accent, card, 4.5), bg, 4.5);
  return {
    primary,
    primarySoft: mix(accent, card, dark ? 0.78 : 0.86),
    onPrimary: textOn(primary),
    heroNeutral: readableOn(mix(accent, '#000000', dark ? 0.45 : 0.3), '#FFFFFF', 4.5),
  };
}

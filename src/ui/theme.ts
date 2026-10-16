import { useColorScheme } from 'react-native';

import { DEFAULT_ACCENT } from '@/core/defaults';
import { useStore } from '@/data/store';

import { accentTones, isHex } from './palette';

/**
 * Sistema de diseño: todos los colores, espacios y radios salen de aquí.
 * Cambiar la apariencia de la app = cambiar este archivo.
 */

const light = {
  bg: '#F3F4F8',
  card: '#FFFFFF',
  cardAlt: '#F1F3F8',
  text: '#0F172A',
  muted: '#64748B',
  faint: '#94A3B8',
  border: '#E3E6EE',
  primary: '#4F46E5',
  primarySoft: '#E7E6FD',
  onPrimary: '#FFFFFF',
  positive: '#12924F',
  positiveSoft: '#DCF5E6',
  negative: '#D92D3A',
  negativeSoft: '#FCE3E5',
  warning: '#B86A00',
  warningSoft: '#FCEBCB',
  heroPositive: '#0D7A4A',
  heroNegative: '#B3212D',
  heroNeutral: '#3730A3',
  onHero: '#FFFFFF',
  overlay: 'rgba(15, 23, 42, 0.45)',
};

const dark: typeof light = {
  bg: '#0A0C12',
  card: '#151822',
  cardAlt: '#1D212E',
  text: '#F4F6FB',
  muted: '#9AA4B8',
  faint: '#6B7489',
  border: '#272C3B',
  primary: '#8B87FF',
  primarySoft: '#25244A',
  onPrimary: '#0A0C12',
  positive: '#3DDC91',
  positiveSoft: '#11301F',
  negative: '#FF6B76',
  negativeSoft: '#3A161A',
  warning: '#FFC043',
  warningSoft: '#3A2C0E',
  heroPositive: '#0F6B43',
  heroNegative: '#8E1F28',
  heroNeutral: '#2F2A8C',
  onHero: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export type Colors = typeof light;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

/** Altura reservada al final de cada pantalla para que la barra de pestañas no tape contenido. */
export const TAB_BAR_SPACE = 104;
export const MAX_WIDTH = 560;

/** true si la app debe verse oscura, según el ajuste del usuario (o el teléfono si eligió "sistema"). */
export function useIsDark(): boolean {
  const system = useColorScheme();
  const choice = useStore((s) => s.settings.theme);
  return choice === 'oscuro' || (choice === 'sistema' && system === 'dark');
}

const cache = new Map<string, Colors>();

/** Colores de un tema con el color principal elegido por el usuario. */
export function buildColors(isDark: boolean, accent: string): Colors {
  const key = `${isDark ? 'd' : 'l'}${accent}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const base = isDark ? dark : light;
  const colors: Colors = isHex(accent) && accent.toUpperCase() !== DEFAULT_ACCENT ? { ...base, ...accentTones(accent, isDark, base.bg, base.card) } : base;
  cache.set(key, colors);
  return colors;
}

export function useColors(): Colors {
  const isDark = useIsDark();
  const accent = useStore((s) => s.settings.accent);
  return buildColors(isDark, accent);
}

/** Color para un monto: verde si es positivo, rojo si es negativo. */
export function toneColor(colors: Colors, value: number): string {
  if (value > 0) return colors.positive;
  if (value < 0) return colors.negative;
  return colors.text;
}

/** Aclara un color hexadecimal mezclándolo con transparencia (para fondos de iconos). */
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return hex;
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0');
  return `#${clean}${a}`;
}

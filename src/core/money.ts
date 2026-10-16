import type { Cents } from './types';

/**
 * Convierte texto a centavos. Acepta "1,234.50", "1234.5", "Q 85", "1.234,50" y "12,5".
 * Devuelve null si no hay un número.
 */
export function parseAmount(input: string): Cents | null {
  let s = input.replace(/[^\d.,]/g, '');
  s = s.replace(/^[.,]+|[.,]+$/g, '');
  if (!/\d/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let decimalAt = -1;

  if (lastDot >= 0 && lastComma >= 0) {
    decimalAt = Math.max(lastDot, lastComma);
  } else if (lastDot >= 0) {
    // Un solo punto = decimal. Varios puntos = separadores de miles.
    decimalAt = s.indexOf('.') === lastDot ? lastDot : -1;
  } else if (lastComma >= 0) {
    // Una coma seguida de 3 dígitos es separador de miles ("1,234").
    const digitsAfter = s.length - lastComma - 1;
    decimalAt = s.indexOf(',') === lastComma && digitsAfter !== 3 ? lastComma : -1;
  }

  const whole = (decimalAt >= 0 ? s.slice(0, decimalAt) : s).replace(/[.,]/g, '') || '0';
  const frac = decimalAt >= 0 ? s.slice(decimalAt + 1).replace(/[.,]/g, '') : '';
  const fracPadded = (frac + '000').slice(0, 3);
  const cents = Number(whole) * 100 + Math.round(Number(fracPadded) / 10);
  return Number.isFinite(cents) ? cents : null;
}

export interface MoneyFormat {
  symbol?: string;
  /** Muestra "+" en positivos. */
  sign?: boolean;
  /** Oculta los centavos (redondea). */
  compact?: boolean;
}

export function formatMoney(cents: Cents, opts: MoneyFormat = {}): string {
  const { symbol = 'Q', sign = false, compact = false } = opts;
  const safe = Number.isFinite(cents) ? Math.round(cents) : 0;
  const abs = Math.abs(safe);
  const units = compact ? Math.round(abs / 100) : Math.floor(abs / 100);
  const whole = String(units).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const frac = compact ? '' : '.' + String(abs % 100).padStart(2, '0');
  const prefix = safe < 0 ? '-' : sign && safe > 0 ? '+' : '';
  return `${prefix}${symbol}${whole}${frac}`;
}

/** Texto para precargar un campo de monto ("1234.50"); vacío si es 0. */
export function amountToInput(cents: Cents): string {
  if (!cents) return '';
  return (cents / 100).toFixed(2).replace(/\.00$/, '');
}

export const sum = (values: Cents[]): Cents => values.reduce((a, b) => a + b, 0);

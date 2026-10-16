import type { ISODate } from './types';

/**
 * Utilidades de fecha sobre textos 'AAAA-MM-DD'.
 * La aritmética se hace en UTC para que los cambios de horario nunca muevan un día.
 */

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, '0');

export const iso = (y: number, m: number, d: number): ISODate => `${y}-${pad(m)}-${pad(d)}`;

export function parts(date: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d };
}

export const isValidISO = (s: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parts(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
};

export const isoFromDate = (date: Date): ISODate =>
  iso(date.getFullYear(), date.getMonth() + 1, date.getDate());

export const todayISO = (): ISODate => isoFromDate(new Date());

const toUTC = (date: ISODate): number => {
  const { y, m, d } = parts(date);
  return Date.UTC(y, m - 1, d);
};

export const daysInMonth = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

export function addDays(date: ISODate, n: number): ISODate {
  const t = new Date(toUTC(date) + n * DAY_MS);
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Días de `from` a `to` (positivo si `to` es posterior). */
export const diffDays = (from: ISODate, to: ISODate): number => Math.round((toUTC(to) - toUTC(from)) / DAY_MS);

export function shiftMonth(y: number, m: number, n: number): { y: number; m: number } {
  const index = y * 12 + (m - 1) + n;
  return { y: Math.floor(index / 12), m: (index % 12 + 12) % 12 + 1 };
}

/** Fecha con ese día en el mes dado; si el mes es más corto usa su último día. */
export const dayInMonth = (y: number, m: number, day: number): ISODate =>
  iso(y, m, Math.min(Math.max(day, 1), daysInMonth(y, m)));

/** 'AAAA-MM' */
export const monthKey = (date: ISODate): string => date.slice(0, 7);

export function shiftMonthKey(key: string, n: number): string {
  const [y, m] = key.split('-').map(Number);
  const r = shiftMonth(y, m, n);
  return `${r.y}-${pad(r.m)}`;
}

export const monthStart = (key: string): ISODate => `${key}-01`;

export function monthEnd(key: string): ISODate {
  const [y, m] = key.split('-').map(Number);
  return iso(y, m, daysInMonth(y, m));
}

/** 0 = domingo … 6 = sábado */
export const weekday = (date: ISODate): number => new Date(toUTC(date)).getUTCDay();

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const monthName = (m: number): string => capitalize(MONTHS[m - 1]);
export const monthShort = (m: number): string => MONTHS[m - 1].slice(0, 3);

/** "15 oct" */
export function formatShort(date: ISODate): string {
  const { m, d } = parts(date);
  return `${d} ${monthShort(m)}`;
}

/** "jueves 15 de octubre" */
export function formatLong(date: ISODate): string {
  const { m, d } = parts(date);
  return `${WEEKDAYS[weekday(date)]} ${d} de ${MONTHS[m - 1]}`;
}

/** "Octubre 2026" */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${monthName(m)} ${y}`;
}

/** "hoy", "mañana", "en 5 días", "ayer", "hace 3 días" */
export function relativeDay(date: ISODate, today: ISODate): string {
  const n = diffDays(today, date);
  if (n === 0) return 'hoy';
  if (n === 1) return 'mañana';
  if (n === -1) return 'ayer';
  return n > 0 ? `en ${n} días` : `hace ${-n} días`;
}

/** Encabezado para agrupar movimientos: "Hoy", "Ayer" o "Jueves 15 de octubre". */
export function dayHeading(date: ISODate, today: ISODate): string {
  const n = diffDays(today, date);
  if (n === 0) return 'Hoy';
  if (n === -1) return 'Ayer';
  return capitalize(formatLong(date));
}

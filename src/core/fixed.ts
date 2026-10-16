import { addDays, dayInMonth, diffDays, monthEnd, monthKey, monthStart, shiftMonthKey, weekday } from './dates';
import type { Cents, FixedExpense, ISODate, Transaction } from './types';

/**
 * Cuándo se paga un gasto fijo.
 *  - 'mes': el día `day` de cada mes (lo de siempre: renta, internet, cuotas).
 *  - 'semana': cada semana, el mismo día de la semana que `anchor` (gasolina, mercado).
 *  - 'dos_semanas': cada 14 días contando desde `anchor`.
 * En los semanales, `anchor` es el primer cobro: no hay cobros antes de esa fecha.
 *
 * Cada cobro tiene una "clave de periodo": el mes ('AAAA-MM') si es mensual, o la
 * fecha exacta ('AAAA-MM-DD') si es semanal. Un pago marca como hecho ese periodo.
 */

export type FixedEvery = 'mes' | 'semana' | 'dos_semanas';

export const FIXED_EVERY: FixedEvery[] = ['mes', 'semana', 'dos_semanas'];

export const fixedEvery = (fixed: FixedExpense): FixedEvery => (fixed.every === 'semana' || fixed.every === 'dos_semanas' ? fixed.every : 'mes');

const stepDays = (every: FixedEvery): number => (every === 'semana' ? 7 : 14);

export interface FixedOccurrence {
  date: ISODate;
  /** Periodo que cubre: 'AAAA-MM' (mensual) o 'AAAA-MM-DD' (semanal). */
  key: string;
}

/** true si ese gasto fijo se cobra en ese mes (activo y dentro de sus fechas, si tiene). */
export function fixedActiveIn(fixed: FixedExpense, key: string): boolean {
  if (!fixed.active) return false;
  if (fixed.startMonth && key < fixed.startMonth) return false;
  if (fixed.endMonth && key > fixed.endMonth) return false;
  return true;
}

/** Fecha de un gasto fijo mensual en un mes ('AAAA-MM'). */
export function fixedDateIn(fixed: FixedExpense, key: string): ISODate {
  const [y, m] = key.split('-').map(Number);
  return dayInMonth(y, m, fixed.day);
}

/** Todos los cobros de un gasto fijo entre dos fechas (incluidas), en orden. */
export function fixedOccurrences(fixed: FixedExpense, from: ISODate, to: ISODate): FixedOccurrence[] {
  if (to < from) return [];
  const every = fixedEvery(fixed);
  const out: FixedOccurrence[] = [];
  if (every === 'mes') {
    for (let key = monthKey(from); key <= monthKey(to); key = shiftMonthKey(key, 1)) {
      if (!fixedActiveIn(fixed, key)) continue;
      const date = fixedDateIn(fixed, key);
      if (date >= from && date <= to) out.push({ date, key });
    }
    return out;
  }
  // `anchor` es el primer cobro: antes de esa fecha el gasto no existía.
  const anchor = fixed.anchor ?? from;
  const step = stepDays(every);
  let date = from <= anchor ? anchor : addDays(anchor, Math.ceil(diffDays(anchor, from) / step) * step);
  for (let guard = 0; date <= to && guard < 400; guard++, date = addDays(date, step)) {
    if (fixedActiveIn(fixed, monthKey(date))) out.push({ date, key: date });
  }
  return out;
}

/** Cobros de un gasto fijo dentro de un mes ('AAAA-MM'). */
export const fixedOccurrencesInMonth = (fixed: FixedExpense, key: string): FixedOccurrence[] =>
  fixedOccurrences(fixed, monthStart(key), monthEnd(key));

/** Movimiento que pagó ese cobro, si existe. */
export function fixedPaymentFor(fixed: FixedExpense, occurrence: FixedOccurrence, txs: Transaction[]): Transaction | undefined {
  const every = fixedEvery(fixed);
  return txs.find((tx) => {
    if (tx.fixedId !== fixed.id) return false;
    if (tx.fixedPeriod) return tx.fixedPeriod === occurrence.key;
    // Pagos sin periodo anotado (versiones anteriores o editados a mano).
    if (every === 'mes') return monthKey(tx.date) === occurrence.key;
    const half = stepDays(every) / 2;
    const gap = diffDays(occurrence.date, tx.date);
    return gap > -half && gap <= half;
  });
}

/** Movimiento que pagó ese gasto fijo mensual en ese mes, si existe. */
export function fixedPayment(fixed: FixedExpense, key: string, txs: Transaction[]): Transaction | undefined {
  return fixedPaymentFor(fixed, { date: fixedDateIn(fixed, key), key }, txs);
}

/** Lo que cuesta un gasto fijo en un mes (un semanal cae 4 o 5 veces). */
export const fixedCostIn = (fixed: FixedExpense, key: string): Cents => fixedOccurrencesInMonth(fixed, key).length * fixed.amount;

/** Cobros del mes que aún no se pagan. */
export const fixedUnpaidIn = (fixed: FixedExpense, key: string, txs: Transaction[]): FixedOccurrence[] =>
  fixedOccurrencesInMonth(fixed, key).filter((o) => !fixedPaymentFor(fixed, o, txs));

/**
 * Desde cuándo se toma en cuenta un cobro atrasado. Los mensuales, todo el mes
 * en curso; los semanales, solo la última semana (o dos), para que un cobro
 * olvidado hace un mes no se quede para siempre como pendiente.
 */
export function overdueFrom(fixed: FixedExpense, today: ISODate): ISODate {
  const every = fixedEvery(fixed);
  return every === 'mes' ? monthStart(monthKey(today)) : addDays(today, -(stepDays(every) - 1));
}

/** El cobro que toca pagar ahora: el atrasado más antiguo o, si no hay, el próximo. */
export function nextFixedDue(fixed: FixedExpense, today: ISODate, txs: Transaction[]): FixedOccurrence | null {
  const horizon = addDays(today, 62);
  return fixedOccurrences(fixed, overdueFrom(fixed, today), horizon).find((o) => !fixedPaymentFor(fixed, o, txs)) ?? null;
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "Día 15 de cada mes", "Cada lunes", "Cada 2 semanas (viernes)". */
export function describeFixedSchedule(fixed: FixedExpense): string {
  const every = fixedEvery(fixed);
  if (every === 'mes') return fixed.day >= 31 ? 'Último día de cada mes' : `Día ${fixed.day} de cada mes`;
  const day = WEEKDAYS[weekday(fixed.anchor ?? '2026-01-05')];
  return every === 'semana' ? `Cada ${day}` : `Cada 2 semanas (${day})`;
}

/** Cuánto sale al mes en promedio (para mostrar "≈ Q433 al mes" en los semanales). */
export function fixedMonthlyAverage(fixed: FixedExpense): Cents {
  const every = fixedEvery(fixed);
  if (every === 'mes') return fixed.amount;
  return Math.round((fixed.amount * 365.25) / 12 / stepDays(every));
}

/** Fecha válida para `anchor` a partir de un día de la semana (la más próxima, hoy incluido). */
export function anchorForWeekday(today: ISODate, day: number): ISODate {
  return addDays(today, (day - weekday(today) + 7) % 7);
}

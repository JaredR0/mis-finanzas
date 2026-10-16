import { addDays, dayInMonth, daysInMonth, diffDays, iso, parts, shiftMonth, weekday } from './dates';
import type { ISODate } from './types';

/**
 * Cuándo te pagan. Hay dos formas de decirlo:
 *  - `payDays`: días del mes (quincena, mensual, diario u otros); 31 = "último día del mes".
 *  - `payWeekly`: cada semana o cada dos, el mismo día de la semana que la fecha `anchor`.
 * Sin ninguna de las dos (ingreso variable) el periodo es el mes calendario.
 */

export const QUINCENAL = [15, 31];
export const MENSUAL = [31];
/** Pago diario: todos los días del mes son día de pago. */
export const DIARIO: number[] = Array.from({ length: 31 }, (_, i) => i + 1);

export interface WeeklyPay {
  /** Una fecha en que cayó (o caerá) un pago; de ahí se cuentan las semanas. */
  anchor: ISODate;
  /** Cada cuántas semanas: 1 = semanal, 2 = cada dos semanas. */
  every: number;
}

export interface PaySchedule {
  payDays: number[];
  payWeekly?: WeeklyPay;
}

/** Se acepta también solo la lista de días del mes. */
type ScheduleInput = PaySchedule | number[];
const norm = (input: ScheduleInput): PaySchedule => (Array.isArray(input) ? { payDays: input } : input);
const weeklyOf = (s: PaySchedule): WeeklyPay | null =>
  s.payWeekly && s.payWeekly.every >= 1 ? { anchor: s.payWeekly.anchor, every: Math.min(8, Math.floor(s.payWeekly.every)) } : null;

const same = (a: number[], b: number[]) => a.length === b.length && [...a].sort((x, y) => x - y).every((day, i) => day === b[i]);

export type PayFrequency = 'diario' | 'semanal' | 'catorcenal' | 'quincenal' | 'mensual' | 'otro' | 'variable';

/** A qué forma de pago corresponde. */
export function payFrequency(input: ScheduleInput): PayFrequency {
  const s = norm(input);
  const weekly = weeklyOf(s);
  if (weekly) return weekly.every === 1 ? 'semanal' : 'catorcenal';
  if (s.payDays.length === 0) return 'variable';
  if (same(s.payDays, DIARIO)) return 'diario';
  if (same(s.payDays, QUINCENAL)) return 'quincenal';
  if (same(s.payDays, MENSUAL)) return 'mensual';
  return 'otro';
}

function payDatesAround(today: ISODate, input: ScheduleInput): ISODate[] {
  const s = norm(input);
  const weekly = weeklyOf(s);
  if (weekly) {
    const step = 7 * weekly.every;
    const k = Math.floor(diffDays(weekly.anchor, today) / step);
    return Array.from({ length: 21 }, (_, i) => addDays(weekly.anchor, (k + i - 10) * step));
  }
  const { y, m } = parts(today);
  const days = s.payDays.length ? s.payDays : [1];
  const dates = new Set<ISODate>();
  for (let offset = -2; offset <= 2; offset++) {
    const mm = shiftMonth(y, m, offset);
    for (const day of days) dates.add(dayInMonth(mm.y, mm.m, day));
  }
  return [...dates].sort();
}

/** Primer día de pago estrictamente después de `today`. */
export function nextPayday(today: ISODate, schedule: ScheduleInput): ISODate {
  const found = payDatesAround(today, schedule).find((d) => d > today);
  return found ?? addDays(today, 15);
}

/** Último día de pago en `today` o antes. */
export function previousPayday(today: ISODate, schedule: ScheduleInput): ISODate {
  const past = payDatesAround(today, schedule).filter((d) => d <= today);
  return past.length ? past[past.length - 1] : today;
}

/** Días de pago que caen en un mes ('AAAA-MM'). Vacío si el ingreso es variable. */
export function paydaysIn(schedule: ScheduleInput, key: string): ISODate[] {
  const s = norm(schedule);
  const [y, m] = key.split('-').map(Number);
  const weekly = weeklyOf(s);
  if (weekly) {
    const first = iso(y, m, 1);
    const last = iso(y, m, daysInMonth(y, m));
    const step = 7 * weekly.every;
    const out: ISODate[] = [];
    for (let date = addDays(weekly.anchor, Math.ceil(diffDays(weekly.anchor, first) / step) * step); date <= last; date = addDays(date, step)) out.push(date);
    return out;
  }
  return [...new Set(s.payDays.map((day) => dayInMonth(y, m, day)))].sort();
}

/** Pagos que caen en un mes típico (para estimar el ingreso mensual). */
export function monthlyPayCount(schedule: ScheduleInput): number {
  const s = norm(schedule);
  const weekly = weeklyOf(s);
  if (weekly) return 52 / 12 / weekly.every;
  return s.payDays.length;
}

export interface PayPeriod {
  start: ISODate;
  /** Próximo día de pago (el periodo termina el día anterior). */
  end: ISODate;
  totalDays: number;
  /** Días que faltan para el próximo pago, contando hoy. */
  daysLeft: number;
  /** 0–1: qué tanto del periodo ha transcurrido. */
  progress: number;
}

export function payPeriod(today: ISODate, schedule: ScheduleInput): PayPeriod {
  const start = previousPayday(today, schedule);
  const end = nextPayday(today, schedule);
  const totalDays = Math.max(1, diffDays(start, end));
  const daysLeft = Math.max(1, diffDays(today, end));
  return { start, end, totalDays, daysLeft, progress: Math.min(1, Math.max(0, 1 - daysLeft / totalDays)) };
}

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** "15 y último de cada mes", "Cada viernes", "Todos los días"… */
export function describePayDays(input: ScheduleInput): string {
  const s = norm(input);
  const weekly = weeklyOf(s);
  if (weekly) {
    const day = WEEKDAYS[weekday(weekly.anchor)];
    return weekly.every === 1 ? `Cada ${day}` : `Un ${day} sí y otro no`;
  }
  const payDays = s.payDays;
  if (!payDays.length) return 'Ingreso variable: sin días de pago fijos';
  if (payFrequency(payDays) === 'diario') return 'Todos los días';
  const names = [...payDays].sort((a, b) => a - b).map((d) => (d >= 31 ? 'último' : String(d)));
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}` : names[0];
  return `${list} de cada mes`;
}

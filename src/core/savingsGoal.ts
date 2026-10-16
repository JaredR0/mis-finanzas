import { addDays, dayInMonth, diffDays, parts, shiftMonth } from './dates';
import type { Cents, Envelope, ISODate, SavingsPlan, SavingsStep, Transaction } from './types';

/**
 * Meta de ahorro con fecha: se aporta una cantidad fija cada cierto tiempo
 * desde una fecha de inicio hasta la fecha en que se quiere tener la meta.
 *
 * Si se saca dinero del ahorro (o se deja de aportar) el plan se atrasa, y hay
 * dos formas de arreglarlo:
 *   - mantener la fecha → se aporta más cada vez;
 *   - aplazar → se aporta lo mismo y la fecha se mueve.
 */

const MAX_STEPS = 2000;

/** Fecha del aporte número `index` (0 = el primero). */
export function stepDate(start: ISODate, step: SavingsStep, index: number): ISODate {
  const every = Math.max(1, Math.floor(step.every));
  if (step.unit === 'dia') return addDays(start, index * every);
  if (step.unit === 'semana') return addDays(start, index * every * 7);
  const { y, m, d } = parts(start);
  const target = shiftMonth(y, m, index * every);
  return dayInMonth(target.y, target.m, d);
}

/** Todas las fechas de aporte entre `start` y `end` (inclusive). */
export function contributionDates(start: ISODate, end: ISODate, step: SavingsStep): ISODate[] {
  const dates: ISODate[] = [];
  for (let i = 0; i < MAX_STEPS; i++) {
    const date = stepDate(start, step, i);
    if (date > end) break;
    dates.push(date);
  }
  return dates;
}

/** "cada día", "cada 3 días", "cada semana", "cada 2 meses"… */
export function describeStep(step: SavingsStep): string {
  const n = Math.max(1, Math.floor(step.every));
  const names = { dia: ['día', 'días'], semana: ['semana', 'semanas'], mes: ['mes', 'meses'] }[step.unit];
  return n === 1 ? `cada ${names[0]}` : `cada ${n} ${names[1]}`;
}

/** Cuánto hay que aportar cada vez para juntar `missing` en las fechas que hay de `start` a `targetDate`. */
export function amountNeeded(missing: Cents, start: ISODate, targetDate: ISODate, step: SavingsStep): Cents {
  const count = contributionDates(start, targetDate, step).length;
  if (missing <= 0) return 0;
  return Math.ceil(missing / Math.max(1, count));
}

/** En qué fecha se junta `missing` aportando `amount` cada vez desde `start`. */
export function dateReached(missing: Cents, start: ISODate, amount: Cents, step: SavingsStep): ISODate {
  if (missing <= 0 || amount <= 0) return start;
  const count = Math.min(MAX_STEPS, Math.ceil(missing / amount));
  return stepDate(start, step, count - 1);
}

export type PlanState = 'cumplida' | 'adelantado' | 'al_dia' | 'atrasado' | 'vencida';

export interface PlanProgress {
  state: PlanState;
  target: Cents;
  balance: Cents;
  /** Lo que falta para la meta. */
  missing: Cents;
  /** Lo que debería haber hoy según el plan. */
  expected: Cents;
  /** Diferencia con lo esperado (negativo = atrasado). */
  gap: Cents;
  /** Próxima fecha de aporte (hoy incluido); null si ya no quedan. */
  nextDate: ISODate | null;
  /** Aportes que quedan de hoy a la fecha meta. */
  stepsLeft: number;
  daysLeft: number;
  /** Mantener la fecha: cuánto habría que aportar cada vez de aquí en adelante. */
  keepDateAmount: Cents;
  /** Aplazar: en qué fecha se llegaría aportando lo mismo. */
  postponedDate: ISODate;
  /** true si con el aporte actual ya no se llega a tiempo. */
  needsAdjustment: boolean;
}

/** Primera fecha de aporte en `today` o después, siguiendo el calendario del plan. */
function nextStepFrom(plan: SavingsPlan, today: ISODate): ISODate {
  for (let i = 0; i < MAX_STEPS; i++) {
    const date = stepDate(plan.startDate, plan.step, i);
    if (date >= today) return date;
  }
  return today;
}

/** Lo que se sacó (o gastó) de este ahorro desde que empezó o se reajustó su plan. */
export function takenOutOfPlan(envelope: Envelope, txs: Transaction[]): Cents {
  const plan = envelope.plan;
  if (!plan) return 0;
  let total = 0;
  for (const tx of txs) {
    if (tx.envelopeId !== envelope.id || (tx.type !== 'retiro' && tx.type !== 'gasto')) continue;
    if (plan.since !== undefined ? tx.createdAt >= plan.since : tx.date >= plan.startDate) total += tx.amount;
  }
  return total;
}

/**
 * Cómo va el plan. `takenOut` es lo que se sacó del ahorro durante el plan
 * (ver `takenOutOfPlan`): sacar dinero no borra un aporte que ya se hizo, así
 * que el hueco que deja se nota y la app pregunta si mantener o aplazar.
 */
export function planProgress(envelope: Envelope, balance: Cents, today: ISODate, takenOut: Cents = 0): PlanProgress | null {
  const plan = envelope.plan;
  if (!plan || envelope.target <= 0) return null;
  const target = envelope.target;
  const missing = Math.max(0, target - balance);

  const all = contributionDates(plan.startDate, plan.targetDate, plan.step);
  // Un aporte que toca hoy todavía no cuenta como atraso: hay todo el día para hacerlo.
  const due = all.filter((date) => date < today).length;
  const expected = Math.min(target, plan.baseBalance + due * plan.amount);
  const gap = balance - expected;

  let next = nextStepFrom(plan, today);
  // Si el aporte de hoy ya se hizo, el próximo es el siguiente del calendario.
  if (next === today && balance + takenOut >= Math.min(target, plan.baseBalance + (due + 1) * plan.amount)) {
    next = nextStepFrom(plan, addDays(today, 1));
  }
  const remaining = contributionDates(next, plan.targetDate, plan.step);
  const stepsLeft = next <= plan.targetDate ? remaining.length : 0;
  const keepDateAmount = Math.ceil(missing / Math.max(1, stepsLeft));
  const postponedDate = dateReached(missing, next, plan.amount, plan.step);
  const onTrackAtCurrentPace = stepsLeft * plan.amount >= missing;

  let state: PlanState;
  if (missing === 0) state = 'cumplida';
  else if (today > plan.targetDate) state = 'vencida';
  else if (!onTrackAtCurrentPace || gap < -Math.floor(plan.amount / 2)) state = 'atrasado';
  else if (gap > plan.amount) state = 'adelantado'; // más de un aporte por delante
  else state = 'al_dia';

  return {
    state, target, balance, missing, expected, gap,
    nextDate: missing > 0 ? next : null,
    stepsLeft,
    daysLeft: Math.max(0, diffDays(today, plan.targetDate)),
    keepDateAmount,
    postponedDate,
    needsAdjustment: missing > 0 && (!onTrackAtCurrentPace || today > plan.targetDate),
  };
}

/** Datos para reajustar: lo sacado durante el plan y la hora del ajuste (desde ahí se vuelve a contar). */
export interface PlanAdjust {
  takenOut?: Cents;
  now?: number;
}

/** Mantener la fecha: el plan sigue terminando el mismo día, con un aporte mayor desde hoy. */
export function keepDate(envelope: Envelope, balance: Cents, today: ISODate, adjust: PlanAdjust = {}): SavingsPlan | null {
  const progress = planProgress(envelope, balance, today, adjust.takenOut);
  if (!envelope.plan || !progress || !progress.nextDate) return null;
  const targetDate = envelope.plan.targetDate < progress.nextDate ? progress.nextDate : envelope.plan.targetDate;
  return {
    ...envelope.plan,
    startDate: progress.nextDate,
    targetDate,
    baseBalance: balance,
    since: adjust.now,
    amount: amountNeeded(progress.missing, progress.nextDate, targetDate, envelope.plan.step),
  };
}

/** Aplazar: se sigue aportando lo mismo y la fecha se mueve a cuando se complete. */
export function postpone(envelope: Envelope, balance: Cents, today: ISODate, adjust: PlanAdjust = {}): SavingsPlan | null {
  const progress = planProgress(envelope, balance, today, adjust.takenOut);
  if (!envelope.plan || !progress || !progress.nextDate) return null;
  return { ...envelope.plan, startDate: progress.nextDate, targetDate: progress.postponedDate, baseBalance: balance, since: adjust.now };
}

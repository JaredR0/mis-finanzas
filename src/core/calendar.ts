import { debtRemaining, envelopeBalances, fixedActiveIn, fixedDateIn, fixedPayment } from './balances';
import { cardObligations } from './creditCard';
import { daysInMonth, iso, monthKey, weekday } from './dates';
import { extraDateIn, extraDueIn, extraReceipt } from './extraIncome';
import { forecast, type ForecastMonth } from './forecast';
import { paydaysIn } from './payCycle';
import { plannedDateIn, plannedDueIn, plannedPayment } from './planned';
import { contributionDates } from './savingsGoal';
import type { Cents, Database, ID, ISODate } from './types';

/**
 * Calendario: todo lo que entra y sale en cada día de un mes, pasado o futuro.
 * Junta lo que la app ya sabe (días de pago, ingresos extra, gastos fijos y
 * cuotas, gastos planeados, pagos de tarjeta, deudas y aportes de ahorro).
 */

export type CalendarKind = 'sueldo' | 'extra' | 'fijo' | 'planeado' | 'tarjeta' | 'deuda' | 'ahorro';
/** 'in' = entra dinero; 'out' = sale; 'save' = se aparta (sigue siendo tuyo). */
export type CalendarFlow = 'in' | 'out' | 'save';

export interface CalendarEvent {
  id: string;
  date: ISODate;
  kind: CalendarKind;
  title: string;
  amount: Cents;
  flow: CalendarFlow;
  /** Ya se recibió o ya se pagó. */
  done: boolean;
  /** Monto aún no definitivo (corte de tarjeta sin cerrar). */
  estimate: boolean;
  refId?: ID;
}

export interface CalendarDay {
  date: ISODate;
  events: CalendarEvent[];
  /** Lo que de verdad se gastó y entró ese día (movimientos registrados). */
  spent: Cents;
  earned: Cents;
}

export interface CalendarMonth {
  key: string;
  /** Casillas vacías antes del día 1 (la semana empieza en domingo, igual que el selector de fechas). */
  leading: number;
  days: CalendarDay[];
  /** Lo que falta por entrar y por salir en el mes (lo que aún no se marca como hecho). */
  toCome: Cents;
  toGo: Cents;
}

const ORDER: Record<CalendarFlow, number> = { in: 0, out: 1, save: 2 };

export function calendarMonth(db: Database, key: string, today: ISODate): CalendarMonth {
  const [y, m] = key.split('-').map(Number);
  const count = daysInMonth(y, m);
  const days: CalendarDay[] = Array.from({ length: count }, (_, i) => ({ date: iso(y, m, i + 1), events: [], spent: 0, earned: 0 }));
  const add = (event: CalendarEvent) => {
    if (monthKey(event.date) === key) days[Number(event.date.slice(8)) - 1].events.push(event);
  };

  const { payAmount, startedOn, skippedPaydays } = db.settings;
  if (payAmount > 0) {
    for (const date of paydaysIn(db.settings, key)) {
      if (date < startedOn || skippedPaydays.includes(date)) continue;
      const done = db.transactions.some((tx) => tx.type === 'ingreso' && tx.payDate === date);
      add({ id: `sueldo-${date}`, date, kind: 'sueldo', title: 'Día de pago', amount: payAmount, flow: 'in', done, estimate: false });
    }
  }

  for (const extra of db.extraIncomes) {
    if (!extraDueIn(extra, key)) continue;
    const done = !!extraReceipt(extra, key, db.transactions);
    add({ id: `extra-${extra.id}`, date: extraDateIn(extra, key), kind: 'extra', title: extra.name, amount: extra.amount, flow: 'in', done, estimate: false, refId: extra.id });
  }

  for (const fixed of db.fixedExpenses) {
    if (!fixedActiveIn(fixed, key)) continue;
    const done = !!fixedPayment(fixed, key, db.transactions);
    add({ id: `fijo-${fixed.id}`, date: fixedDateIn(fixed, key), kind: 'fijo', title: fixed.name, amount: fixed.amount, flow: 'out', done, estimate: false, refId: fixed.id });
  }

  for (const planned of db.plannedExpenses) {
    if (!plannedDueIn(planned, key)) continue;
    const done = !!plannedPayment(planned, key, db.transactions);
    add({ id: `planeado-${planned.id}`, date: plannedDateIn(planned, key), kind: 'planeado', title: planned.name, amount: planned.amount, flow: 'out', done, estimate: false, refId: planned.id });
  }

  for (const card of db.cards) {
    for (const o of cardObligations(card, db.transactions, today)) {
      add({ id: `tarjeta-${card.id}-${o.cutoff}`, date: o.due, kind: 'tarjeta', title: `Pago ${card.name}`, amount: o.amount, flow: 'out', done: false, estimate: o.estimate, refId: card.id });
    }
  }

  for (const debt of db.debts) {
    if (!debt.dueDate) continue;
    const rest = debtRemaining(debt, db.transactions);
    if (rest <= 0) continue;
    const mine = debt.direction === 'debo';
    add({ id: `deuda-${debt.id}`, date: debt.dueDate, kind: 'deuda', title: mine ? debt.name : `Te paga: ${debt.name}`, amount: rest, flow: mine ? 'out' : 'in', done: false, estimate: false, refId: debt.id });
  }

  // Aportes de las metas de ahorro con fecha: solo los que faltan (de hoy en adelante).
  const saved = envelopeBalances(db);
  for (const envelope of db.envelopes) {
    const plan = envelope.plan;
    if (!plan || envelope.target <= 0) continue;
    let missing = envelope.target - (saved[envelope.id] ?? 0);
    for (const date of contributionDates(plan.startDate, plan.targetDate, plan.step)) {
      if (date < today) continue;
      if (missing <= 0 || monthKey(date) > key) break;
      const amount = Math.min(plan.amount, missing);
      missing -= amount;
      add({ id: `ahorro-${envelope.id}-${date}`, date, kind: 'ahorro', title: `Apartar para ${envelope.name}`, amount, flow: 'save', done: false, estimate: false, refId: envelope.id });
    }
  }

  for (const tx of db.transactions) {
    if (monthKey(tx.date) !== key) continue;
    const day = days[Number(tx.date.slice(8)) - 1];
    if (tx.type === 'gasto') day.spent += tx.amount;
    else if (tx.type === 'ingreso') day.earned += tx.amount;
  }

  let toCome = 0;
  let toGo = 0;
  for (const day of days) {
    day.events.sort((a, b) => ORDER[a.flow] - ORDER[b.flow] || b.amount - a.amount);
    for (const event of day.events) {
      if (event.done) continue;
      if (event.flow === 'in') toCome += event.amount;
      else if (event.flow === 'out') toGo += event.amount;
    }
  }

  return { key, leading: weekday(days[0].date), days, toCome, toGo };
}

/** Tope de meses hacia adelante que se proyectan. */
export const MAX_MONTHS_AHEAD = 36;

/** Cómo cerraría un mes futuro según la proyección; null si es el mes actual, uno pasado o muy lejano. */
export function monthAhead(db: Database, today: ISODate, key: string): ForecastMonth | null {
  const current = monthKey(today);
  if (key <= current) return null;
  const ahead = (Number(key.slice(0, 4)) - Number(current.slice(0, 4))) * 12 + Number(key.slice(5)) - Number(current.slice(5));
  if (ahead > MAX_MONTHS_AHEAD) return null;
  return forecast(db, today, ahead)[ahead - 1] ?? null;
}

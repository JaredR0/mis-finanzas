import { debtRemaining } from './balances';
import { monthKey, shiftMonthKey } from './dates';
import { extraDueIn, extraReceipt } from './extraIncome';
import { baseline, monthlyMargin } from './forecast';
import type { Cents, Database, ID, ISODate } from './types';

/**
 * Plan para salir de deudas: con un monto fijo al mes, en qué orden pagarlas,
 * cuándo se termina cada una y cuánto se va en intereses.
 *
 *  - Bola de nieve: primero la más pequeña (se ven resultados rápido).
 *  - Avalancha: primero la de mayor interés (se paga menos en total).
 * En ambas, a todas se les paga su mínimo y lo que sobra va a una sola; cuando
 * esa se termina, todo lo que se le pagaba pasa a la siguiente.
 */

export type PayoffStrategy = 'bola_de_nieve' | 'avalancha';

export interface PayoffInput {
  id: ID;
  name: string;
  balance: Cents;
  /** Interés anual como fracción (0.24 = 24 % al año). */
  rate: number;
  /** Pago mínimo mensual; 0 si no tiene. */
  min: Cents;
}

export interface PayoffDebt extends PayoffInput {
  /** Posición en el orden de pago (1 = a esta va todo lo extra primero). */
  order: number;
  /** Cuánto abonarle este mes. */
  payNow: Cents;
  /** Meses hasta terminarla y mes en que se termina; null si con ese monto no se termina. */
  months: number | null;
  paidOffIn: string | null;
  /** Intereses que se pagan en esta deuda durante el plan. */
  interest: Cents;
}

export interface PayoffResult {
  debts: PayoffDebt[];
  /** Meses hasta quedar libre de deudas y mes en que pasa; null si no se llega. */
  months: number | null;
  debtFreeIn: string | null;
  totalInterest: Cents;
  /** El monto mensual no cubre ni los pagos mínimos. */
  shortfall: boolean;
  /** Con ese monto la deuda no baja (los intereses se comen el pago). */
  stuck: boolean;
}

const MAX_MONTHS = 600;

/** Deudas propias que aún tienen saldo. */
export function payoffInputs(db: Database): PayoffInput[] {
  return db.debts
    .filter((d) => d.direction === 'debo')
    .map((d) => ({
      id: d.id,
      name: d.name,
      balance: debtRemaining(d, db.transactions),
      rate: Math.max(0, Number(d.rate) || 0) / 100,
      min: Math.max(0, Math.round(Number(d.minPayment) || 0)),
    }))
    .filter((d) => d.balance > 0);
}

const byStrategy = (strategy: PayoffStrategy) => (a: { balance: number; rate: number; name: string }, b: { balance: number; rate: number; name: string }) =>
  strategy === 'avalancha'
    ? b.rate - a.rate || a.balance - b.balance || a.name.localeCompare(b.name)
    : a.balance - b.balance || b.rate - a.rate || a.name.localeCompare(b.name);

/**
 * Simula el plan mes a mes desde `startKey`.
 * `monthly` es todo lo que se destina a deudas cada mes (mínimos incluidos);
 * `bonus(mes)` es dinero extra de ese mes (bonos); con `rollover` en false cada
 * deuda recibe solo su mínimo (sirve para comparar contra "pagar solo mínimos").
 */
export function simulatePayoff(
  inputs: PayoffInput[],
  startKey: string,
  monthly: Cents,
  strategy: PayoffStrategy,
  bonus: (key: string) => Cents = () => 0,
  rollover = true,
): PayoffResult {
  const state = inputs.map((d) => ({ ...d, left: d.balance, interest: 0, months: null as number | null, paidOffIn: null as string | null, payNow: 0 }));
  const order = [...state].sort(byStrategy(strategy)).map((d) => d.id);
  const minimums = state.reduce((sum, d) => sum + Math.min(d.min, d.balance), 0);
  const startTotal = state.reduce((sum, d) => sum + d.balance, 0);
  let months: number | null = null;

  for (let i = 0; i < MAX_MONTHS && state.some((d) => d.left > 0); i++) {
    const key = shiftMonthKey(startKey, i);
    for (const d of state) {
      if (d.left <= 0) continue;
      const interest = Math.round((d.left * d.rate) / 12);
      d.left += interest;
      d.interest += interest;
    }
    let available = Math.max(0, monthly) + Math.max(0, bonus(key));
    const pay = (d: (typeof state)[number], amount: Cents) => {
      const paid = Math.max(0, Math.min(d.left, amount, available));
      d.left -= paid;
      available -= paid;
      if (i === 0) d.payNow += paid;
      if (d.left <= 0 && d.months === null) {
        d.months = i + 1;
        d.paidOffIn = key;
      }
    };
    const active = () => state.filter((d) => d.left > 0).sort(byStrategy(strategy));
    for (const d of active()) pay(d, d.min);
    if (rollover) for (const d of active()) pay(d, available);
    if (state.every((d) => d.left <= 0)) months = i + 1;
  }

  const endTotal = state.reduce((sum, d) => sum + Math.max(0, d.left), 0);
  return {
    debts: state
      .map((d) => ({ id: d.id, name: d.name, balance: d.balance, rate: d.rate, min: d.min, order: order.indexOf(d.id) + 1, payNow: d.payNow, months: d.months, paidOffIn: d.paidOffIn, interest: d.interest }))
      .sort((a, b) => a.order - b.order),
    months,
    debtFreeIn: months === null ? null : shiftMonthKey(startKey, months - 1),
    totalInterest: state.reduce((sum, d) => sum + d.interest, 0),
    shortfall: monthly < minimums,
    stuck: months === null && endTotal >= startTotal,
  };
}

export interface PayoffPlan {
  inputs: PayoffInput[];
  /** Suma de los pagos mínimos de hoy. */
  minimums: Cents;
  /** Lo que la app sugiere destinar al mes (lo que sobra en un mes típico, o al menos los mínimos). */
  suggested: Cents;
  /** Monto usado en el cálculo. */
  monthly: Cents;
  plan: PayoffResult;
  /** El mismo plan pagando solo los mínimos, para comparar; null si ninguna deuda tiene mínimo. */
  minimumOnly: PayoffResult | null;
  /** Deudas sin interés anotado (el cálculo las trata como sin interés). */
  withoutRate: number;
}

export interface PayoffOptions {
  monthly?: Cents;
  strategy: PayoffStrategy;
  /** Sumar a ese mes los ingresos extra que no son de cada mes (bonos, aguinaldo). */
  useExtras: boolean;
}

export function payoffPlan(db: Database, today: ISODate, options: PayoffOptions): PayoffPlan {
  const inputs = payoffInputs(db);
  const minimums = inputs.reduce((sum, d) => sum + Math.min(d.min, d.balance), 0);
  const base = baseline(db, today);
  const margin = base.noData || base.income <= 0 ? 0 : Math.max(0, monthlyMargin(db, today));
  const suggested = Math.max(minimums, margin);
  const monthly = options.monthly && options.monthly > 0 ? options.monthly : suggested;
  const startKey = monthKey(today);
  const bonus = (key: string): Cents =>
    options.useExtras
      ? db.extraIncomes.reduce(
          (sum, x) => sum + (x.frequency !== 'mensual' && extraDueIn(x, key) && !extraReceipt(x, key, db.transactions) ? x.amount : 0),
          0,
        )
      : 0;
  return {
    inputs,
    minimums,
    suggested,
    monthly,
    plan: simulatePayoff(inputs, startKey, monthly, options.strategy, bonus),
    minimumOnly: minimums > 0 ? simulatePayoff(inputs, startKey, minimums, options.strategy, () => 0, false) : null,
    withoutRate: inputs.filter((d) => d.rate <= 0).length,
  };
}

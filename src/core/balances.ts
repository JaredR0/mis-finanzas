import { cardObligations, cardStatus } from './creditCard';
import { dayInMonth, diffDays, monthKey, parts, shiftMonth, shiftMonthKey } from './dates';
import { nextPayday, payFrequency, payPeriod, type PayPeriod } from './payCycle';
import { plannedOccurrences } from './planned';
import type { Cents, Database, Debt, FixedExpense, ID, ISODate, Transaction } from './types';

/** Saldos y obligaciones: todo se deriva de los movimientos. */

export function accountBalances(db: Database): Record<ID, Cents> {
  const balances: Record<ID, Cents> = {};
  for (const a of db.accounts) balances[a.id] = a.initialBalance;
  const debts = new Map(db.debts.map((d) => [d.id, d]));
  const add = (id: ID | undefined, delta: Cents) => {
    if (id && id in balances) balances[id] += delta;
  };

  for (const tx of db.transactions) {
    switch (tx.type) {
      case 'gasto':
      case 'pago_tarjeta':
        add(tx.accountId, -tx.amount);
        break;
      case 'ingreso':
        add(tx.accountId, tx.amount);
        break;
      case 'transferencia':
        add(tx.accountId, -tx.amount);
        add(tx.toAccountId, tx.amount);
        break;
      case 'abono_deuda': {
        // Abonar a lo que debo saca dinero; que me abonen lo mete.
        const debt = tx.debtId ? debts.get(tx.debtId) : undefined;
        if (debt) add(tx.accountId, debt.direction === 'debo' ? -tx.amount : tx.amount);
        break;
      }
      case 'prestamo': {
        // Recibir un préstamo mete dinero; prestar lo saca.
        const debt = tx.debtId ? debts.get(tx.debtId) : undefined;
        if (debt) add(tx.accountId, debt.direction === 'debo' ? tx.amount : -tx.amount);
        break;
      }
      case 'aporte':
      case 'retiro':
        break; // Los apartados no mueven dinero de la cuenta, solo lo reservan.
    }
  }
  return balances;
}

export function envelopeBalances(db: Database): Record<ID, Cents> {
  const balances: Record<ID, Cents> = {};
  for (const e of db.envelopes) balances[e.id] = 0;
  for (const tx of db.transactions) {
    if (!tx.envelopeId || !(tx.envelopeId in balances)) continue;
    if (tx.type === 'aporte') balances[tx.envelopeId] += tx.amount;
    else if (tx.type === 'retiro' || tx.type === 'gasto') balances[tx.envelopeId] -= tx.amount;
  }
  return balances;
}

/** Lo que falta por pagar (o cobrar) de una deuda. */
export function debtRemaining(debt: Debt, txs: Transaction[]): Cents {
  let paid = 0;
  for (const tx of txs) if (tx.type === 'abono_deuda' && tx.debtId === debt.id) paid += tx.amount;
  return Math.max(0, debt.amount - paid);
}

export function debtTotals(db: Database): { owe: Cents; owed: Cents } {
  let owe = 0;
  let owed = 0;
  for (const d of db.debts) {
    const rest = debtRemaining(d, db.transactions);
    if (d.direction === 'debo') owe += rest;
    else owed += rest;
  }
  return { owe, owed };
}

/** Fecha de un gasto fijo en un mes ('AAAA-MM'). */
export function fixedDateIn(fixed: FixedExpense, key: string): ISODate {
  const [y, m] = key.split('-').map(Number);
  return dayInMonth(y, m, fixed.day);
}

/** true si ese gasto fijo se cobra en ese mes (activo y dentro de sus fechas, si tiene). */
export function fixedActiveIn(fixed: FixedExpense, key: string): boolean {
  if (!fixed.active) return false;
  if (fixed.startMonth && key < fixed.startMonth) return false;
  if (fixed.endMonth && key > fixed.endMonth) return false;
  return true;
}

/** Movimiento que pagó ese gasto fijo en ese mes, si existe. */
export function fixedPayment(fixed: FixedExpense, key: string, txs: Transaction[]): Transaction | undefined {
  return txs.find((tx) => tx.fixedId === fixed.id && monthKey(tx.date) === key);
}

export type UpcomingKind = 'tarjeta' | 'fijo' | 'deuda' | 'planeado';

export interface UpcomingItem {
  key: string;
  kind: UpcomingKind;
  refId: ID;
  title: string;
  subtitle: string;
  date: ISODate;
  amount: Cents;
  /** Monto aún no definitivo (corte de tarjeta sin cerrar). */
  estimate: boolean;
  overdue: boolean;
  /** Vence antes del próximo día de pago: hay que cubrirlo con el dinero de hoy. */
  beforePayday: boolean;
  /** Sale del dinero en cuentas (false = gasto fijo cargado a tarjeta). */
  fromAccounts: boolean;
}

/** Todo lo que hay que pagar próximamente, ordenado por fecha. */
export function upcoming(db: Database, today: ISODate, horizonDays = 45): UpcomingItem[] {
  const payday = nextPayday(today, db.settings);
  const items: UpcomingItem[] = [];
  const push = (item: Omit<UpcomingItem, 'overdue' | 'beforePayday'>) =>
    items.push({ ...item, overdue: item.date < today, beforePayday: item.date < payday });

  for (const card of db.cards) {
    for (const o of cardObligations(card, db.transactions, today)) {
      push({
        key: `tarjeta-${card.id}-${o.cutoff}`,
        kind: 'tarjeta',
        refId: card.id,
        title: `Pago ${card.name}`,
        subtitle: o.estimate ? 'Estimado · el corte aún no cierra' : 'Pago para no generar intereses',
        date: o.due,
        amount: o.amount,
        estimate: o.estimate,
        fromAccounts: true,
      });
    }
  }

  const { y, m } = parts(today);
  const months = [0, 1, 2].map((n) => {
    const mm = shiftMonth(y, m, n);
    return `${mm.y}-${String(mm.m).padStart(2, '0')}`;
  });
  for (const fixed of db.fixedExpenses) {
    for (const key of months) {
      if (!fixedActiveIn(fixed, key) || fixedPayment(fixed, key, db.transactions)) continue;
      push({
        key: `fijo-${fixed.id}-${key}`,
        kind: 'fijo',
        refId: fixed.id,
        title: fixed.name,
        subtitle: fixed.cardId ? 'Gasto fijo · se carga a tarjeta' : 'Gasto fijo',
        date: fixedDateIn(fixed, key),
        amount: fixed.amount,
        estimate: false,
        fromAccounts: !fixed.cardId,
      });
    }
  }

  for (const debt of db.debts) {
    if (debt.direction !== 'debo' || !debt.dueDate) continue;
    const rest = debtRemaining(debt, db.transactions);
    if (rest <= 0) continue;
    push({
      key: `deuda-${debt.id}`,
      kind: 'deuda',
      refId: debt.id,
      title: debt.name,
      subtitle: 'Deuda',
      date: debt.dueDate,
      amount: rest,
      estimate: false,
      fromAccounts: true,
    });
  }

  // Gastos planeados sin pagar: desde el mes pasado (por si quedó uno pendiente) en adelante.
  for (const o of plannedOccurrences(db, shiftMonthKey(monthKey(today), -1), 4)) {
    if (o.paid) continue;
    push({
      key: `planeado-${o.planned.id}-${o.key}`,
      kind: 'planeado',
      refId: o.planned.id,
      title: o.planned.name,
      subtitle: o.planned.cardId ? 'Gasto planeado · se carga a tarjeta' : 'Gasto planeado',
      date: o.date,
      amount: o.planned.amount,
      estimate: false,
      fromAccounts: !o.planned.cardId,
    });
  }

  return items
    .filter((i) => diffDays(today, i.date) <= horizonDays)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key.localeCompare(b.key)));
}

export interface Overview {
  period: PayPeriod;
  /** Dinero en cuentas y efectivo. */
  inAccounts: Cents;
  /** Reservado en apartados (ahorro y guardaditos). */
  inEnvelopes: Cents;
  /** Pagos de tarjeta que vencen antes del próximo día de pago. */
  cardsDue: Cents;
  /** Gastos fijos sin pagar antes del próximo día de pago. */
  fixedDue: Cents;
  /** Deudas que vencen antes del próximo día de pago. */
  debtsDue: Cents;
  /** Gastos planeados que caen antes del próximo día de pago. */
  plannedDue: Cents;
  /** Lo que de verdad se puede gastar hasta el próximo pago. */
  free: Cents;
  /** `free` repartido en los días que faltan. */
  perDay: Cents;
  /** Deuda total en tarjetas hoy. */
  cardDebt: Cents;
  upcoming: UpcomingItem[];
}

/**
 * Resumen principal: "libre para gastar" =
 *   dinero en cuentas − apartados − todo lo que vence antes del próximo día de pago
 *   (tarjetas, gastos fijos, deudas y gastos planeados).
 */
export function overview(db: Database, today: ISODate): Overview {
  const period = payPeriod(today, db.settings);
  const inAccounts = Object.values(accountBalances(db)).reduce((a, b) => a + b, 0);
  const inEnvelopes = Object.values(envelopeBalances(db)).reduce((a, b) => a + Math.max(0, b), 0);
  const list = upcoming(db, today);

  let cardsDue = 0;
  let fixedDue = 0;
  let debtsDue = 0;
  let plannedDue = 0;
  for (const item of list) {
    if (!item.beforePayday || !item.fromAccounts) continue;
    if (item.kind === 'tarjeta') cardsDue += item.amount;
    else if (item.kind === 'fijo') fixedDue += item.amount;
    else if (item.kind === 'planeado') plannedDue += item.amount;
    else debtsDue += item.amount;
  }

  const free = inAccounts - inEnvelopes - cardsDue - fixedDue - debtsDue - plannedDue;
  const cardDebt = db.cards.reduce(
    (total, card) => total + Math.max(0, cardStatus(card, db.transactions, today).debt),
    0,
  );
  return {
    period,
    inAccounts,
    inEnvelopes,
    cardsDue,
    fixedDue,
    debtsDue,
    plannedDue,
    free,
    perDay: free > 0 ? Math.floor(free / period.daysLeft) : 0,
    cardDebt,
    upcoming: list,
  };
}

/** Día de pago ya ocurrido que aún no se registra ni se descarta (el más reciente). */
export function pendingPayday(db: Database, today: ISODate): ISODate | null {
  const { payAmount, startedOn, skippedPaydays, pendingFirstPay } = db.settings;
  if (payFrequency(db.settings) === 'variable' || payAmount <= 0) return null;
  // El pago que se dijo "todavía no me cae" al configurar la app va primero.
  if (
    pendingFirstPay &&
    pendingFirstPay <= today &&
    !skippedPaydays.includes(pendingFirstPay) &&
    !db.transactions.some((tx) => tx.type === 'ingreso' && tx.payDate === pendingFirstPay)
  ) {
    return pendingFirstPay;
  }
  const last = payPeriod(today, db.settings).start;
  if (last < startedOn || skippedPaydays.includes(last)) return null;
  if (db.transactions.some((tx) => tx.type === 'ingreso' && tx.payDate === last)) return null;
  return last;
}

/** Pago por el que Inicio debe preguntar hoy: el pendiente, salvo que se haya dicho "todavía no" hace poco. */
export function paydayPrompt(db: Database, today: ISODate): ISODate | null {
  const pending = pendingPayday(db, today);
  if (!pending) return null;
  const { payAskAfter } = db.settings;
  return payAskAfter && today < payAskAfter ? null : pending;
}

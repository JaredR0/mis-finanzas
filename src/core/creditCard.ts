import { addDays, dayInMonth, parts, shiftMonth } from './dates';
import type { Cents, CreditCard, ISODate, Transaction } from './types';

/**
 * Ciclos de tarjeta de crédito.
 *
 * Cada tarjeta tiene su propio día de corte y de pago, así que cada una se
 * calcula por separado:
 *   - Lo comprado hasta el día de corte (inclusive) entra en ese estado de cuenta.
 *   - La fecha límite es la primera vez que cae `paymentDay` al menos
 *     MIN_GRACE_DAYS después del corte (los bancos dan ~20–25 días).
 *   - Lo pendiente de un corte = todo lo cargado hasta ese corte − todo lo pagado.
 */

export const MIN_GRACE_DAYS = 10;

export const cutoffInMonth = (card: CreditCard, y: number, m: number): ISODate =>
  dayInMonth(y, m, card.cutoffDay);

/** Último corte ocurrido en `today` o antes. */
export function lastCutoff(card: CreditCard, today: ISODate): ISODate {
  const { y, m } = parts(today);
  const thisMonth = cutoffInMonth(card, y, m);
  if (thisMonth <= today) return thisMonth;
  const prev = shiftMonth(y, m, -1);
  return cutoffInMonth(card, prev.y, prev.m);
}

/** Próximo corte, estrictamente después de `today`. */
export function nextCutoff(card: CreditCard, today: ISODate): ISODate {
  const { y, m } = parts(today);
  const thisMonth = cutoffInMonth(card, y, m);
  if (thisMonth > today) return thisMonth;
  const next = shiftMonth(y, m, 1);
  return cutoffInMonth(card, next.y, next.m);
}

/** Fecha límite de pago del estado de cuenta que cerró en `cutoff`. */
export function dueDateFor(card: CreditCard, cutoff: ISODate): ISODate {
  const earliest = addDays(cutoff, MIN_GRACE_DAYS);
  const { y, m } = parts(cutoff);
  for (let offset = 0; offset <= 3; offset++) {
    const mm = shiftMonth(y, m, offset);
    const candidate = dayInMonth(mm.y, mm.m, card.paymentDay);
    if (candidate >= earliest) return candidate;
  }
  return addDays(cutoff, 25);
}

interface CardLedger {
  totalCharges: Cents;
  payments: Cents;
  chargesUpTo: (date: ISODate) => Cents;
}

function ledger(card: CreditCard, txs: Transaction[]): CardLedger {
  const charges: { date: ISODate; amount: Cents }[] = [];
  let payments = 0;
  for (const tx of txs) {
    if (tx.cardId !== card.id) continue;
    if (tx.type === 'gasto') charges.push({ date: tx.date, amount: tx.amount });
    else if (tx.type === 'pago_tarjeta') payments += tx.amount;
  }
  const chargesUpTo = (date: ISODate) => {
    let total = card.openingStatement + (card.openedOn <= date ? card.openingCycle : 0);
    for (const c of charges) if (c.date <= date) total += c.amount;
    return total;
  };
  const totalCharges =
    card.openingStatement + card.openingCycle + charges.reduce((a, c) => a + c.amount, 0);
  return { totalCharges, payments, chargesUpTo };
}

export interface CardStatus {
  /** Deuda total hoy (negativo = saldo a favor). */
  debt: Cents;
  lastCutoff: ISODate;
  /** Fecha límite del último estado de cuenta. */
  lastDue: ISODate;
  /** Lo que falta pagar del último estado de cuenta ("pago para no generar intereses"). */
  pending: Cents;
  overdue: boolean;
  nextCutoff: ISODate;
  /** Fecha límite del estado de cuenta que se está formando. */
  nextDue: ISODate;
  /** Consumos del ciclo actual (después del último corte). */
  cycleSpend: Cents;
  /** Crédito disponible; null si no hay límite definido. */
  available: Cents | null;
  /** 0–1 del límite usado; null si no hay límite. */
  usage: number | null;
}

export function cardStatus(card: CreditCard, txs: Transaction[], today: ISODate): CardStatus {
  const l = ledger(card, txs);
  const last = lastCutoff(card, today);
  const next = nextCutoff(card, today);
  const lastDue = dueDateFor(card, last);
  const debt = l.totalCharges - l.payments;
  const pending = Math.max(0, l.chargesUpTo(last) - l.payments);
  return {
    debt,
    lastCutoff: last,
    lastDue,
    pending,
    overdue: pending > 0 && lastDue < today,
    nextCutoff: next,
    nextDue: dueDateFor(card, next),
    cycleSpend: l.totalCharges - l.chargesUpTo(last),
    available: card.limit > 0 ? card.limit - debt : null,
    usage: card.limit > 0 ? Math.min(1, Math.max(0, debt / card.limit)) : null,
  };
}

export interface CardObligation {
  cardId: string;
  due: ISODate;
  amount: Cents;
  /** true = el corte aún no cierra; el monto puede crecer con nuevas compras. */
  estimate: boolean;
  cutoff: ISODate;
}

/**
 * Pagos que la tarjeta va a exigir: el estado de cuenta ya cerrado (monto firme)
 * y el que se está formando (estimado con lo comprado hasta hoy).
 */
export function cardObligations(card: CreditCard, txs: Transaction[], today: ISODate): CardObligation[] {
  const s = cardStatus(card, txs, today);
  const out: CardObligation[] = [];
  if (s.pending > 0) {
    out.push({ cardId: card.id, due: s.lastDue, amount: s.pending, estimate: false, cutoff: s.lastCutoff });
  }
  const forming = Math.max(0, s.debt - s.pending);
  if (forming > 0) {
    out.push({ cardId: card.id, due: s.nextDue, amount: forming, estimate: true, cutoff: s.nextCutoff });
  }
  return out;
}

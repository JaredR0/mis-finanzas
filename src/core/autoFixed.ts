import { fixedActiveIn, fixedDateIn, fixedPayment } from './balances';
import type { TxDraft } from './txDraft';
import { monthKey } from './dates';
import type { Database, FixedExpense, ISODate } from './types';

/** Movimiento que registra el pago de un gasto fijo (o de una cuota); null si no tiene con qué pagarse. */
export function fixedPaymentDraft(fixed: FixedExpense, date: ISODate): TxDraft | null {
  if (!fixed.accountId && !fixed.cardId) return null;
  return {
    type: 'gasto',
    amount: fixed.amount,
    date,
    note: fixed.name,
    accountId: fixed.cardId ? undefined : fixed.accountId,
    cardId: fixed.cardId,
    categoryId: fixed.categoryId,
    fixedId: fixed.id,
    source: 'fijo',
  };
}

/**
 * Gastos fijos marcados como "se cobra solo" cuyo día de este mes ya llegó y
 * aún no tienen pago: la app los registra sola, con la fecha en que tocaban.
 * Solo mira el mes en curso, para no inventar pagos de meses pasados.
 */
export function autoFixedDrafts(db: Database, today: ISODate): TxDraft[] {
  const key = monthKey(today);
  const drafts: TxDraft[] = [];
  for (const fixed of db.fixedExpenses) {
    if (!fixed.auto || !fixedActiveIn(fixed, key) || fixedPayment(fixed, key, db.transactions)) continue;
    const date = fixedDateIn(fixed, key);
    if (date > today) continue;
    const draft = fixedPaymentDraft(fixed, date);
    if (draft) drafts.push(draft);
  }
  return drafts;
}

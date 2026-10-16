import { fixedEvery, fixedOccurrences, fixedPaymentFor, overdueFrom } from './fixed';
import { monthKey } from './dates';
import type { TxDraft } from './txDraft';
import type { Database, FixedExpense, ISODate } from './types';

/**
 * Movimiento que registra el pago de un gasto fijo (o de una cuota); null si no tiene con qué pagarse.
 * `period` es el cobro que paga ('AAAA-MM' o la fecha del cobro semanal); si no se da, es el mes de `date`.
 */
export function fixedPaymentDraft(fixed: FixedExpense, date: ISODate, period?: string): TxDraft | null {
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
    fixedPeriod: period ?? (fixedEvery(fixed) === 'mes' ? monthKey(date) : date),
    source: 'fijo',
  };
}

/**
 * Gastos fijos marcados como "se cobra solo" cuyo cobro ya llegó y aún no
 * tiene pago: la app los registra sola, con la fecha en que tocaban.
 * Solo mira el mes en curso (o la última semana, si es semanal), para no inventar pagos viejos.
 */
export function autoFixedDrafts(db: Database, today: ISODate): TxDraft[] {
  const drafts: TxDraft[] = [];
  for (const fixed of db.fixedExpenses) {
    if (!fixed.auto) continue;
    for (const o of fixedOccurrences(fixed, overdueFrom(fixed, today), today)) {
      if (fixedPaymentFor(fixed, o, db.transactions)) continue;
      const draft = fixedPaymentDraft(fixed, o.date, o.key);
      if (draft) drafts.push(draft);
    }
  }
  return drafts;
}

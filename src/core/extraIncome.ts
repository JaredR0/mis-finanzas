import { dayInMonth, monthKey, parts } from './dates';
import type { Cents, Database, ExtraIncome, ISODate, Transaction } from './types';

/**
 * Ingresos extra: lo que no entra en el sueldo base (bono, aguinaldo, trabajos
 * aparte, ventas). Se usan para proyectar, y cada uno se confirma con un toque
 * cuando de verdad llega.
 */

/** true si ese ingreso extra se espera en ese mes ('AAAA-MM'). */
export function extraDueIn(extra: ExtraIncome, key: string): boolean {
  if (!extra.active) return false;
  const first = monthKey(extra.date);
  if (key < first) return false;
  if (extra.frequency === 'unica') return key === first;
  if (extra.frequency === 'mensual') return true;
  return key.slice(5) === first.slice(5); // anual: mismo mes
}

/** Fecha en que se espera dentro de ese mes. */
export function extraDateIn(extra: ExtraIncome, key: string): ISODate {
  const [y, m] = key.split('-').map(Number);
  return dayInMonth(y, m, parts(extra.date).d);
}

/** Movimiento con el que se registró ese ingreso extra en ese mes, si ya llegó. */
export function extraReceipt(extra: ExtraIncome, key: string, txs: Transaction[]): Transaction | undefined {
  return txs.find((tx) => tx.extraId === extra.id && tx.extraPeriod === key);
}

/** Suma de ingresos extra esperados en un mes. */
export function extraIncomeIn(db: Database, key: string): Cents {
  return db.extraIncomes.reduce((total, x) => total + (extraDueIn(x, key) ? x.amount : 0), 0);
}

/** Lo que falta por recibir de ingresos extra en un mes (los esperados que aún no se confirman). */
export function extraPendingIn(db: Database, key: string): Cents {
  return db.extraIncomes.reduce(
    (total, x) => total + (extraDueIn(x, key) && !extraReceipt(x, key, db.transactions) ? x.amount : 0),
    0,
  );
}

export interface ExtraOccurrence {
  extra: ExtraIncome;
  key: string;
  date: ISODate;
  received: Transaction | undefined;
}

/** Próximas veces que se espera cada ingreso extra, de este mes en adelante. */
export function upcomingExtras(db: Database, today: ISODate, months = 12): ExtraOccurrence[] {
  const out: ExtraOccurrence[] = [];
  let [y, m] = monthKey(today).split('-').map(Number);
  for (let i = 0; i < months; i++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    for (const extra of db.extraIncomes) {
      if (!extraDueIn(extra, key)) continue;
      out.push({ extra, key, date: extraDateIn(extra, key), received: extraReceipt(extra, key, db.transactions) });
    }
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Ingresos de un mes que no son el sueldo base (no vienen de un día de pago). */
export function extraIncomeReceived(db: Database, key: string): Cents {
  let total = 0;
  for (const tx of db.transactions) {
    if (tx.type === 'ingreso' && !tx.payDate && monthKey(tx.date) === key) total += tx.amount;
  }
  return total;
}

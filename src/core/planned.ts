import { dayInMonth, monthKey, parts, shiftMonthKey } from './dates';
import type { Cents, Database, ISODate, PlannedExpense, Transaction } from './types';

/**
 * Gastos planeados: lo que ya se sabe que viene en una fecha (matrícula,
 * seguro, un viaje). Se apartan de lo libre cuando se acerca la fecha, bajan
 * la proyección del mes en que caen y se marcan como pagados con un toque.
 */

/** true si ese gasto planeado cae en ese mes ('AAAA-MM'). */
export function plannedDueIn(planned: PlannedExpense, key: string): boolean {
  if (!planned.active) return false;
  const first = monthKey(planned.date);
  if (key < first) return false;
  return planned.frequency === 'unica' ? key === first : key.slice(5) === first.slice(5);
}

/** Fecha en que cae dentro de ese mes. */
export function plannedDateIn(planned: PlannedExpense, key: string): ISODate {
  const [y, m] = key.split('-').map(Number);
  return dayInMonth(y, m, parts(planned.date).d);
}

/** Movimiento con el que se pagó ese gasto planeado en ese mes, si ya se pagó. */
export function plannedPayment(planned: PlannedExpense, key: string, txs: Transaction[]): Transaction | undefined {
  return txs.find((tx) => tx.plannedId === planned.id && tx.plannedPeriod === key);
}

/** Suma de gastos planeados de un mes. */
export function plannedIn(db: Database, key: string): Cents {
  return db.plannedExpenses.reduce((total, p) => total + (plannedDueIn(p, key) ? p.amount : 0), 0);
}

/** Gastos planeados de un mes que aún no se pagan. */
export function plannedPendingIn(db: Database, key: string): Cents {
  return db.plannedExpenses.reduce(
    (total, p) => total + (plannedDueIn(p, key) && !plannedPayment(p, key, db.transactions) ? p.amount : 0),
    0,
  );
}

export interface PlannedOccurrence {
  planned: PlannedExpense;
  key: string;
  date: ISODate;
  paid: Transaction | undefined;
}

/** Veces que cae cada gasto planeado desde el mes `from` (incluido), durante `months` meses. */
export function plannedOccurrences(db: Database, from: string, months: number): PlannedOccurrence[] {
  const out: PlannedOccurrence[] = [];
  for (let i = 0; i < months; i++) {
    const key = shiftMonthKey(from, i);
    for (const planned of db.plannedExpenses) {
      if (!plannedDueIn(planned, key)) continue;
      out.push({ planned, key, date: plannedDateIn(planned, key), paid: plannedPayment(planned, key, db.transactions) });
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

import { monthKey } from './dates';
import type { Category, Cents, Database, ID, Transaction } from './types';

/** Avisos de presupuesto: cuando una categoría se acerca a su tope o lo pasa. */

/** A partir de qué parte del presupuesto se avisa "te estás acercando". */
export const NEAR_BUDGET = 0.8;

export type BudgetLevel = 'bien' | 'cerca' | 'pasado';

export const budgetLevel = (spent: Cents, budget: Cents): BudgetLevel =>
  budget <= 0 ? 'bien' : spent > budget ? 'pasado' : spent >= budget * NEAR_BUDGET ? 'cerca' : 'bien';

export interface BudgetAlert {
  category: Category;
  spent: Cents;
  budget: Cents;
  /** Lo que queda (negativo si ya se pasó). */
  left: Cents;
  ratio: number;
  level: 'cerca' | 'pasado';
}

function spentIn(txs: Transaction[], categoryId: ID, key: string): Cents {
  let total = 0;
  for (const tx of txs) {
    if (tx.type === 'gasto' && tx.categoryId === categoryId && monthKey(tx.date) === key) total += tx.amount;
  }
  return total;
}

/** Categorías que este mes están cerca de su presupuesto o ya lo pasaron; las más graves primero. */
export function budgetAlerts(db: Database, key: string): BudgetAlert[] {
  const alerts: BudgetAlert[] = [];
  for (const category of db.categories) {
    if (category.kind === 'ingreso' || category.monthlyBudget <= 0) continue;
    const spent = spentIn(db.transactions, category.id, key);
    const level = budgetLevel(spent, category.monthlyBudget);
    if (level === 'bien') continue;
    alerts.push({
      category, spent, budget: category.monthlyBudget, left: category.monthlyBudget - spent,
      ratio: spent / category.monthlyBudget, level,
    });
  }
  return alerts.sort((a, b) => b.ratio - a.ratio);
}

/**
 * Aviso que corresponde justo después de guardar un gasto: solo cuando ese
 * gasto hizo que la categoría cruzara el 80 % o el 100 % (no en cada compra).
 */
export function budgetCrossing(before: Database, after: Database, categoryId: ID | undefined, key: string): BudgetAlert | null {
  if (!categoryId) return null;
  const category = after.categories.find((c) => c.id === categoryId);
  if (!category || category.monthlyBudget <= 0 || category.kind === 'ingreso') return null;
  const order: BudgetLevel[] = ['bien', 'cerca', 'pasado'];
  const was = budgetLevel(spentIn(before.transactions, categoryId, key), category.monthlyBudget);
  const spent = spentIn(after.transactions, categoryId, key);
  const now = budgetLevel(spent, category.monthlyBudget);
  if (now === 'bien' || order.indexOf(now) <= order.indexOf(was)) return null;
  return {
    category, spent, budget: category.monthlyBudget, left: category.monthlyBudget - spent,
    ratio: spent / category.monthlyBudget, level: now,
  };
}

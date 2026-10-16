import { monthKey, monthShort, shiftMonthKey } from './dates';
import type { Category, Cents, Database, ID } from './types';

/** Reportes por mes y por año. Un gasto cuenta en el mes en que se hizo la compra. */

export interface CategoryTotal {
  categoryId: ID | null;
  name: string;
  icon: string;
  color: string;
  kind: 'fijo' | 'corriente';
  amount: Cents;
  budget: Cents;
}

export interface MonthSummary {
  key: string;
  income: Cents;
  expense: Cents;
  /** Ingresos − gastos. */
  balance: Cents;
  fixed: Cents;
  current: Cents;
  /** Aportes − retiros de apartados. */
  saved: Cents;
  /** Abonos a deudas que debo. */
  debtPaid: Cents;
  cardPaid: Cents;
  count: number;
  byCategory: CategoryTotal[];
}

const UNCATEGORIZED = { name: 'Sin categoría', icon: 'help', color: '#8E8E93' };

export function monthSummary(db: Database, key: string): MonthSummary {
  const categories = new Map<ID, Category>(db.categories.map((c) => [c.id, c]));
  const debts = new Map(db.debts.map((d) => [d.id, d]));
  const totals = new Map<ID | null, Cents>();
  const s: MonthSummary = {
    key, income: 0, expense: 0, balance: 0, fixed: 0, current: 0,
    saved: 0, debtPaid: 0, cardPaid: 0, count: 0, byCategory: [],
  };

  for (const tx of db.transactions) {
    if (monthKey(tx.date) !== key) continue;
    s.count++;
    switch (tx.type) {
      case 'ingreso':
        s.income += tx.amount;
        break;
      case 'gasto': {
        s.expense += tx.amount;
        const category = tx.categoryId ? categories.get(tx.categoryId) : undefined;
        if (category?.kind === 'fijo') s.fixed += tx.amount;
        else s.current += tx.amount;
        const id = category ? category.id : null;
        totals.set(id, (totals.get(id) ?? 0) + tx.amount);
        break;
      }
      case 'aporte':
        s.saved += tx.amount;
        break;
      case 'retiro':
        s.saved -= tx.amount;
        break;
      case 'abono_deuda':
        if (tx.debtId && debts.get(tx.debtId)?.direction === 'debo') s.debtPaid += tx.amount;
        break;
      case 'pago_tarjeta':
        s.cardPaid += tx.amount;
        break;
    }
  }
  s.balance = s.income - s.expense;

  // Incluye también las categorías con presupuesto aunque no tengan gasto, para ver el avance.
  for (const c of db.categories) {
    if (c.kind !== 'ingreso' && c.monthlyBudget > 0 && !totals.has(c.id)) totals.set(c.id, 0);
  }
  s.byCategory = [...totals.entries()]
    .map(([id, amount]): CategoryTotal => {
      const c = id ? categories.get(id) : undefined;
      return {
        categoryId: id,
        name: c?.name ?? UNCATEGORIZED.name,
        icon: c?.icon ?? UNCATEGORIZED.icon,
        color: c?.color ?? UNCATEGORIZED.color,
        kind: c?.kind === 'fijo' ? 'fijo' : 'corriente',
        amount,
        budget: c?.monthlyBudget ?? 0,
      };
    })
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name));
  return s;
}

export interface MonthPoint {
  key: string;
  label: string;
  income: Cents;
  expense: Cents;
  balance: Cents;
  saved: Cents;
}

/** Los últimos `count` meses terminando en `endKey`, del más antiguo al más reciente. */
export function monthSeries(db: Database, endKey: string, count: number): MonthPoint[] {
  const points: MonthPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const key = shiftMonthKey(endKey, -i);
    const s = monthSummary(db, key);
    points.push({
      key,
      label: monthShort(Number(key.slice(5))),
      income: s.income,
      expense: s.expense,
      balance: s.balance,
      saved: s.saved,
    });
  }
  return points;
}

export interface YearSummary {
  year: number;
  months: MonthPoint[];
  income: Cents;
  expense: Cents;
  balance: Cents;
  saved: Cents;
}

export function yearSummary(db: Database, year: number): YearSummary {
  const months = monthSeries(db, `${year}-12`, 12);
  const total = (pick: (p: MonthPoint) => Cents) => months.reduce((a, p) => a + pick(p), 0);
  return {
    year,
    months,
    income: total((p) => p.income),
    expense: total((p) => p.expense),
    balance: total((p) => p.balance),
    saved: total((p) => p.saved),
  };
}

/** Años que tienen movimientos (más el actual), del más reciente al más antiguo. */
export function yearsWithData(db: Database, currentYear: number): number[] {
  const years = new Set<number>([currentYear]);
  for (const tx of db.transactions) years.add(Number(tx.date.slice(0, 4)));
  return [...years].sort((a, b) => b - a);
}

export interface CategoryChange {
  categoryId: ID | null;
  name: string;
  icon: string;
  color: string;
  current: Cents;
  previous: Cents;
  /** current − previous: positivo = se gastó más. */
  delta: Cents;
}

export interface MonthComparison {
  key: string;
  previousKey: string;
  /** Si no es null, ambos meses se comparan solo hasta ese día (mes en curso contra el mismo tramo del anterior). */
  throughDay: number | null;
  current: Cents;
  previous: Cents;
  delta: Cents;
  /** Cambio en porcentaje; null si el mes anterior no tuvo gasto. */
  percent: number | null;
  /** Categorías ordenadas de la que más subió a la que más bajó. */
  categories: CategoryChange[];
}

/**
 * Compara los gastos de un mes contra el mes anterior, por categoría.
 * Con `throughDay` solo cuentan los gastos hasta ese día en ambos meses, para
 * que un mes a medias no parezca más barato de lo que es.
 */
export function compareMonths(db: Database, key: string, throughDay: number | null = null): MonthComparison {
  const previousKey = shiftMonthKey(key, -1);
  const categories = new Map<ID, Category>(db.categories.map((c) => [c.id, c]));
  const totals = new Map<ID | null, { current: Cents; previous: Cents }>();
  let current = 0;
  let previous = 0;
  for (const tx of db.transactions) {
    if (tx.type !== 'gasto') continue;
    const month = monthKey(tx.date);
    if (month !== key && month !== previousKey) continue;
    if (throughDay !== null && Number(tx.date.slice(8)) > throughDay) continue;
    const id = tx.categoryId && categories.has(tx.categoryId) ? tx.categoryId : null;
    const entry = totals.get(id) ?? { current: 0, previous: 0 };
    if (month === key) {
      entry.current += tx.amount;
      current += tx.amount;
    } else {
      entry.previous += tx.amount;
      previous += tx.amount;
    }
    totals.set(id, entry);
  }
  return {
    key,
    previousKey,
    throughDay,
    current,
    previous,
    delta: current - previous,
    percent: previous > 0 ? Math.round(((current - previous) / previous) * 100) : null,
    categories: [...totals.entries()]
      .map(([id, t]): CategoryChange => {
        const c = id ? categories.get(id) : undefined;
        return {
          categoryId: id,
          name: c?.name ?? UNCATEGORIZED.name,
          icon: c?.icon ?? UNCATEGORIZED.icon,
          color: c?.color ?? UNCATEGORIZED.color,
          current: t.current,
          previous: t.previous,
          delta: t.current - t.previous,
        };
      })
      .sort((a, b) => b.delta - a.delta || a.name.localeCompare(b.name)),
  };
}

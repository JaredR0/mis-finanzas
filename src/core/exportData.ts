import { accountBalances, debtRemaining, envelopeBalances } from './balances';
import { cardStatus } from './creditCard';
import { formatLong, monthKey, monthName } from './dates';
import { extraIncomeReceived } from './extraIncome';
import { paidInstallments, planCost } from './installments';
import { monthSummary, yearSummary, yearsWithData } from './reports';
import type { Database, ISODate, Transaction, TxType } from './types';

/**
 * Arma las hojas del archivo de Excel como tablas simples (filas de celdas).
 * No depende de ninguna librería: `services/exportExcel.ts` las convierte a .xlsx.
 */

export type Cell = string | number;
export interface Sheet {
  name: string;
  rows: Cell[][];
  /** Ancho de cada columna en caracteres. */
  widths: number[];
}

const q = (cents: number): number => Math.round(cents) / 100;

const TYPE_LABEL: Record<TxType, string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  pago_tarjeta: 'Pago de tarjeta',
  transferencia: 'Transferencia',
  aporte: 'Aporte a apartado',
  retiro: 'Retiro de apartado',
  abono_deuda: 'Abono a deuda',
  prestamo: 'Préstamo',
};

export const txTypeLabel = (type: TxType): string => TYPE_LABEL[type];

/** Nombre de la hoja de un mes: "2026-10 Octubre" (ordena bien y se lee claro). */
export const monthSheetName = (key: string): string => `${key} ${monthName(Number(key.slice(5)))}`;

const WEEKDAY = (date: ISODate): string => {
  const day = formatLong(date).split(' ')[0];
  return day.charAt(0).toUpperCase() + day.slice(1);
};

/**
 * Hojas del archivo:
 *   - "Resumen AAAA": los 12 meses del año con sus totales.
 *   - Un libro por cada mes con movimientos: cada gasto e ingreso con su fecha y su día.
 *   - "Categorías AAAA", "Todo" (todos los movimientos juntos) y el estado actual
 *     de cuentas, tarjetas, apartados, deudas, cuotas, ingresos extra y gastos planeados.
 * Con `onlyYear` se exporta un solo año.
 */
export function buildSheets(db: Database, today: ISODate, onlyYear?: number): Sheet[] {
  const sheets: Sheet[] = [];
  const allYears = yearsWithData(db, Number(today.slice(0, 4)));
  const years = onlyYear ? allYears.filter((y) => y === onlyYear) : allYears;
  const name = <T extends { id: string; name: string }>(list: T[], id?: string) =>
    list.find((x) => x.id === id)?.name ?? '';
  const paidWith = (tx: Transaction): string =>
    tx.type === 'transferencia'
      ? `${name(db.accounts, tx.accountId)} → ${name(db.accounts, tx.toAccountId)}`
      : name(db.cards, tx.cardId) || name(db.accounts, tx.accountId);
  const describe = (tx: Transaction): string =>
    tx.note || tx.merchant || name(db.categories, tx.categoryId) || name(db.envelopes, tx.envelopeId) || name(db.debts, tx.debtId) || TYPE_LABEL[tx.type];
  const ordered = [...db.transactions].sort((a, b) =>
    a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1,
  );

  for (const year of years) {
    const y = yearSummary(db, year);
    const rows: Cell[][] = [['Mes', 'Ingresos', 'De ellos, extra', 'Gastos', 'Balance', 'Ahorro', 'Gastos fijos', 'Gastos corrientes']];
    const totals = { extra: 0, fixed: 0, current: 0 };
    for (const point of y.months) {
      const s = monthSummary(db, point.key);
      const extra = extraIncomeReceived(db, point.key);
      totals.extra += extra;
      totals.fixed += s.fixed;
      totals.current += s.current;
      rows.push([monthName(Number(point.key.slice(5))), q(s.income), q(extra), q(s.expense), q(s.balance), q(s.saved), q(s.fixed), q(s.current)]);
    }
    rows.push(['TOTAL', q(y.income), q(totals.extra), q(y.expense), q(y.balance), q(y.saved), q(totals.fixed), q(totals.current)]);
    sheets.push({ name: `Resumen ${year}`, rows, widths: [14, 14, 16, 14, 14, 14, 14, 18] });

    // Un libro por mes: solo los meses que tienen movimientos.
    for (const point of y.months) {
      const inMonth = ordered.filter((tx) => monthKey(tx.date) === point.key);
      if (inMonth.length === 0) continue;
      const monthRows: Cell[][] = [['Fecha', 'Día', 'Tipo', 'Descripción', 'Categoría', 'Pagado con', 'Gasto', 'Ingreso', 'Otros movimientos']];
      let spent = 0;
      let earned = 0;
      let other = 0;
      for (const tx of inMonth) {
        const isExpense = tx.type === 'gasto';
        const isIncome = tx.type === 'ingreso';
        if (isExpense) spent += tx.amount;
        else if (isIncome) earned += tx.amount;
        else other += tx.amount;
        monthRows.push([
          tx.date, WEEKDAY(tx.date), TYPE_LABEL[tx.type], describe(tx), name(db.categories, tx.categoryId), paidWith(tx),
          isExpense ? q(tx.amount) : '', isIncome ? q(tx.amount) : '', !isExpense && !isIncome ? q(tx.amount) : '',
        ]);
      }
      monthRows.push(['TOTAL', '', '', '', '', '', q(spent), q(earned), q(other)]);
      monthRows.push(['Balance del mes (ingresos − gastos)', '', '', '', '', '', '', q(earned - spent), '']);
      sheets.push({ name: monthSheetName(point.key), rows: monthRows, widths: [12, 11, 18, 30, 20, 22, 12, 12, 18] });
    }

    const matrix = new Map<string, number[]>();
    y.months.forEach((point, index) => {
      for (const c of monthSummary(db, point.key).byCategory) {
        if (!matrix.has(c.name)) matrix.set(c.name, Array(12).fill(0));
        matrix.get(c.name)![index] += c.amount;
      }
    });
    const header: Cell[] = ['Categoría', ...y.months.map((p) => monthName(Number(p.key.slice(5)))), 'Total'];
    const categoryRows: Cell[][] = [...matrix.entries()]
      .map(([label, values]) => ({ label, values, total: values.reduce((a, b) => a + b, 0) }))
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total)
      .map((row) => [row.label, ...row.values.map(q), q(row.total)]);
    sheets.push({ name: `Categorías ${year}`, rows: [header, ...categoryRows], widths: [22, ...Array(12).fill(12), 14] });
  }

  const movements: Cell[][] = [
    ['Fecha', 'Día', 'Tipo', 'Descripción', 'Categoría', 'Cuenta', 'Tarjeta', 'Apartado', 'Deuda', 'Monto', 'Origen'],
  ];
  for (const tx of ordered) {
    if (onlyYear && Number(tx.date.slice(0, 4)) !== onlyYear) continue;
    const account =
      tx.type === 'transferencia'
        ? `${name(db.accounts, tx.accountId)} → ${name(db.accounts, tx.toAccountId)}`
        : name(db.accounts, tx.accountId);
    movements.push([
      tx.date, WEEKDAY(tx.date), TYPE_LABEL[tx.type], tx.note || tx.merchant || '', name(db.categories, tx.categoryId), account,
      name(db.cards, tx.cardId), name(db.envelopes, tx.envelopeId), name(db.debts, tx.debtId), q(tx.amount), tx.source,
    ]);
  }
  sheets.push({ name: 'Todo', rows: movements, widths: [12, 11, 18, 30, 20, 22, 18, 16, 18, 12, 10] });

  const balances = accountBalances(db);
  sheets.push({
    name: 'Cuentas',
    rows: [['Cuenta', 'Tipo', 'Saldo'], ...db.accounts.map((a): Cell[] => [a.name, a.kind, q(balances[a.id] ?? 0)])],
    widths: [24, 12, 14],
  });

  sheets.push({
    name: 'Tarjetas',
    rows: [
      ['Tarjeta', 'Banco', 'Día de corte', 'Día de pago', 'Deuda total', 'Por pagar (último corte)', 'Fecha límite', 'Ciclo actual', 'Límite'],
      ...db.cards.map((card): Cell[] => {
        const s = cardStatus(card, db.transactions, today);
        return [
          card.name, card.bank, card.cutoffDay, card.paymentDay,
          q(s.debt), q(s.pending), s.pending > 0 ? s.lastDue : '', q(s.cycleSpend), q(card.limit),
        ];
      }),
    ],
    widths: [20, 16, 12, 12, 14, 24, 14, 14, 14],
  });

  const envelopes = envelopeBalances(db);
  sheets.push({
    name: 'Apartados',
    rows: [
      ['Apartado', 'Tipo', 'Saldo', 'Meta'],
      ...db.envelopes.map((e): Cell[] => [e.name, e.kind, q(envelopes[e.id] ?? 0), q(e.target)]),
    ],
    widths: [22, 14, 14, 14],
  });

  sheets.push({
    name: 'Deudas',
    rows: [
      ['Deuda', 'Grupo', 'Tipo', 'Monto original', 'Pendiente', 'Vence'],
      ...db.debts.map((d): Cell[] => [
        d.name,
        name(db.debtGroups, d.groupId),
        d.direction === 'debo' ? 'Debo' : 'Me deben',
        q(d.amount),
        q(debtRemaining(d, db.transactions)),
        d.dueDate ?? '',
      ]),
    ],
    widths: [24, 16, 12, 16, 14, 14],
  });

  if (db.installments.length > 0) {
    sheets.push({
      name: 'Cuotas',
      rows: [
        ['Compra', 'Estado', 'Precio de contado', 'Cuotas', 'Cuota mensual', 'Total a pagar', 'Pagas de más', 'Cuotas pagadas', 'Cuotas que faltan', 'Falta pagar'],
        ...db.installments.map((p): Cell[] => {
          const cost = planCost(p);
          const paid = paidInstallments(db, p);
          const left = p.status === 'activa' ? p.months - paid : p.months;
          return [
            p.name, p.status === 'activa' ? 'Activa' : 'Idea', q(p.cashPrice), p.months, q(p.monthly),
            q(cost.total), q(cost.extra), paid, left, q(left * p.monthly),
          ];
        }),
      ],
      widths: [24, 10, 18, 10, 14, 14, 14, 16, 18, 14],
    });
  }

  if (db.extraIncomes.length > 0) {
    sheets.push({
      name: 'Ingresos extra',
      rows: [
        ['Ingreso', 'Monto', 'Frecuencia', 'Fecha esperada', 'Activo'],
        ...db.extraIncomes.map((x): Cell[] => [
          x.name, q(x.amount), { unica: 'Una vez', mensual: 'Cada mes', anual: 'Cada año' }[x.frequency], x.date, x.active ? 'Sí' : 'No',
        ]),
      ],
      widths: [26, 14, 14, 16, 10],
    });
  }

  if (db.plannedExpenses.length > 0) {
    sheets.push({
      name: 'Gastos planeados',
      rows: [
        ['Gasto', 'Monto', 'Frecuencia', 'Fecha', 'Categoría', 'Se paga con', 'Activo'],
        ...db.plannedExpenses.map((p): Cell[] => [
          p.name, q(p.amount), p.frequency === 'unica' ? 'Una vez' : 'Cada año', p.date, name(db.categories, p.categoryId),
          name(db.cards, p.cardId) || name(db.accounts, p.accountId), p.active ? 'Sí' : 'No',
        ]),
      ],
      widths: [26, 14, 14, 14, 20, 22, 10],
    });
  }

  return sheets;
}

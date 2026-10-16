import { describe, expect, it } from 'vitest';

import { emptyDatabase } from '../defaults';
import { buildSheets } from '../exportData';
import { evaluatePlan, installmentProgress, installmentsRemaining, paidBefore, paidInstallments } from '../installments';
import { sanitizeDatabase } from '../mutations';
import type { Database, InstallmentPlan, Transaction } from '../types';

let seq = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>): Transaction => ({
  id: `i${++seq}`, createdAt: seq, note: '', source: 'manual', ...t,
});
const TODAY = '2026-10-07';
/** Teléfono de Q6,000 a 12 cuotas de Q550 con tarjeta; ya llevaba 5 pagadas al anotarlo en octubre. */
const base = (): { db: Database; plan: InstallmentPlan } => {
  const db = emptyDatabase('2026-10-01', 0);
  db.accounts = [{ id: 'a1', name: 'Monetaria', kind: 'banco', initialBalance: 1000000, color: '#000', createdAt: 0 }];
  db.cards = [{ id: 'c1', name: 'Visa', bank: 'Banrural', cutoffDay: 20, paymentDay: 12, limit: 0, openingStatement: 0, openingCycle: 0, openedOn: '2026-10-01', color: '#000', createdAt: 0 }];
  db.settings = { ...db.settings, payAmount: 400000, payDays: [15, 31], payAccountId: 'a1' };
  db.fixedExpenses = [{ id: 'f1', name: 'Cuota: Teléfono', amount: 55000, day: 5, cardId: 'c1', active: true, startMonth: '2026-10', endMonth: '2027-04' }];
  const plan: InstallmentPlan = { id: 'p1', name: 'Teléfono', cashPrice: 600000, months: 12, monthly: 55000, status: 'activa', fixedId: 'f1', paidBefore: 5, createdAt: 0 };
  db.installments = [plan];
  return { db, plan };
};

describe('compras a cuotas que ya se están pagando', () => {
  it('cuenta las cuotas que venían de antes más las pagadas en la app', () => {
    const { db, plan } = base();
    expect(paidInstallments(db, plan)).toBe(5);
    expect(installmentProgress(db, plan, TODAY)).toMatchObject({
      paid: 5, left: 7, paidAmount: 275000, remaining: 385000, dueThisMonth: true, paidThisMonth: false, startsIn: null, endMonth: '2027-04',
    });
    db.transactions.push(tx({ type: 'gasto', amount: 55000, date: TODAY, cardId: 'c1', fixedId: 'f1' }));
    expect(installmentProgress(db, plan, TODAY)).toMatchObject({ paid: 6, left: 6, remaining: 330000, dueThisMonth: false, paidThisMonth: true });
    expect(installmentsRemaining(db)).toBe(330000);
  });

  it('termina cuando se pagan todas, sin pasarse del total', () => {
    const { db, plan } = base();
    for (let m = 0; m < 9; m++) db.transactions.push(tx({ type: 'gasto', amount: 55000, date: `2026-1${m % 3}-05`, cardId: 'c1', fixedId: 'f1' }));
    expect(installmentProgress(db, plan, '2027-05-02')).toMatchObject({ paid: 12, left: 0, remaining: 0, dueThisMonth: false });
  });

  it('una compra nueva empieza en cero y avisa si aún no empieza a cobrarse', () => {
    const { db, plan } = base();
    db.fixedExpenses[0] = { ...db.fixedExpenses[0], startMonth: '2026-11', endMonth: '2027-10' };
    const fresh = { ...plan, paidBefore: undefined };
    expect(installmentProgress(db, fresh, TODAY)).toMatchObject({ paid: 0, left: 12, remaining: 660000, dueThisMonth: false, startsIn: '2026-11' });
  });

  it('las ideas no cuentan como deuda; valores raros de "ya pagadas" se acotan', () => {
    const { db, plan } = base();
    db.installments.push({ ...plan, id: 'p2', status: 'idea', fixedId: undefined, paidBefore: undefined });
    expect(installmentsRemaining(db)).toBe(385000);
    expect([paidBefore({ months: 12, paidBefore: 40 }), paidBefore({ months: 12, paidBefore: -3 }), paidBefore({ months: 12, paidBefore: undefined }), paidBefore({ months: 12, paidBefore: 2.9 })]).toEqual([11, 0, 0, 2]);
  });

  it('dice el mes real en que termina y sale en el Excel con lo que falta', () => {
    const { db, plan } = base();
    expect(evaluatePlan(db, plan, TODAY).lastMonth).toBe('2027-04');
    expect(evaluatePlan(db, { ...plan, status: 'idea', fixedId: undefined }, TODAY).lastMonth).toBe('2027-05'); // 7 cuotas desde noviembre
    const sheet = buildSheets(db, TODAY).find((s) => s.name === 'Cuotas')!;
    expect(sheet.rows[1]).toEqual(['Teléfono', 'Activa', 6000, 12, 550, 6600, 600, 5, 7, 3850]);
    expect(sanitizeDatabase(JSON.parse(JSON.stringify(db)), TODAY, 0)!.installments[0].paidBefore).toBe(5);
  });
});

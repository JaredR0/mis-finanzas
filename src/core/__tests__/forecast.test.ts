import { describe, expect, it } from 'vitest';

import { fixedActiveIn, overview, upcoming } from '../balances';
import { emptyDatabase } from '../defaults';
import { baseline, fixedIn, forecast, monthEndOutlook, monthlyMargin, netNow } from '../forecast';
import { annualRate, evaluatePlan, paidInstallments, planCost } from '../installments';
import { removeEntity, sanitizeDatabase } from '../mutations';
import type { Database, FixedExpense, InstallmentPlan, Transaction } from '../types';

let seq = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>): Transaction => ({
  id: `t${++seq}`, createdAt: seq, note: '', source: 'manual', accountId: 'a1', ...t,
});
const fixed = (f: Partial<FixedExpense> & Pick<FixedExpense, 'id' | 'amount'>): FixedExpense => ({
  name: f.id, day: 10, accountId: 'a1', active: true, ...f,
});
const plan = (p: Partial<InstallmentPlan> = {}): InstallmentPlan => ({
  id: 'p1', name: 'Tele', cashPrice: 500000, months: 24, monthly: 28900, status: 'idea', createdAt: 0, ...p,
});

/** Gana Q8,000 al mes (dos pagos de Q4,000), empezó en julio, tiene Q5,000 en la cuenta. */
const base = (patch: Partial<Database> = {}): Database => {
  const db = emptyDatabase('2026-07-01', 0);
  db.accounts = [{ id: 'a1', name: 'Cuenta', kind: 'banco', initialBalance: 500000, color: '#000', createdAt: 0 }];
  db.settings = { ...db.settings, payAmount: 400000, payDays: [15, 31], payAccountId: 'a1', startedOn: '2026-07-01' };
  return { ...db, ...patch, settings: { ...db.settings, ...patch.settings } };
};
const spend = (month: string, amount: number) => tx({ type: 'gasto', amount, date: `${month}-05` });

describe('gasto esperado', () => {
  it('sin historial no inventa: avisa que faltan datos', () => {
    const b = baseline(base(), '2026-07-03');
    expect(b).toMatchObject({ income: 800000, variable: 0, noData: true, monthsUsed: 0 });
  });

  it('con pocos días usa el ritmo del mes en curso', () => {
    const db = base({ transactions: [tx({ type: 'gasto', amount: 100000, date: '2026-07-05' })] });
    expect(baseline(db, '2026-07-10')).toMatchObject({ variable: 310000, currentPace: 310000, noData: false }); // 1,000 en 10 días → 3,100 en 31
  });

  it('pesa más los meses recientes, así que mejorar se nota', () => {
    const db = base({ transactions: [spend('2026-07', 500000), spend('2026-08', 400000), spend('2026-09', 300000)] });
    const b = baseline(db, '2026-10-03');
    expect(b.monthsUsed).toBe(3);
    expect(b.previousAverage).toBe(Math.round((300000 * 3 + 400000 * 2 + 500000) / 6)); // 366,667
    expect(b.variable).toBe(366667);
    expect(b.variable).toBeLessThan(400000); // menor que el promedio simple
  });

  it('a partir del día 10 mezcla el mes en curso', () => {
    const db = base({ transactions: [spend('2026-09', 300000), tx({ type: 'gasto', amount: 50000, date: '2026-10-08' })] });
    const b = baseline(db, '2026-10-10');
    expect(b.currentPace).toBe(155000); // 500 en 10 días → 1,550 en 31
    expect(b.variable).toBe(Math.round((300000 * 3 + 155000 * 2) / 5));
  });

  it('no cuenta los gastos fijos ni otros tipos de movimiento', () => {
    const db = base({
      transactions: [
        spend('2026-09', 300000),
        tx({ type: 'gasto', amount: 150000, date: '2026-09-10', fixedId: 'renta' }),
        tx({ type: 'aporte', amount: 90000, date: '2026-09-10', envelopeId: 'e' }),
        tx({ type: 'pago_tarjeta', amount: 70000, date: '2026-09-10', cardId: 'c' }),
      ],
    });
    expect(baseline(db, '2026-10-03').variable).toBe(300000);
  });

  it('si empezó a mitad de mes, ese mes no se usa como completo', () => {
    const db = base({ settings: { startedOn: '2026-09-18' } as Database['settings'], transactions: [spend('2026-09', 10000)] });
    expect(baseline(db, '2026-10-03').monthsUsed).toBe(0);
  });

  it('sin pago configurado usa el promedio de ingresos registrados', () => {
    const db = base({ settings: { payAmount: 0 } as Database['settings'], transactions: [tx({ type: 'ingreso', amount: 600000, date: '2026-09-15' }), spend('2026-09', 1)] });
    expect(baseline(db, '2026-10-03').income).toBe(600000);
  });
});

describe('meta de fin de mes', () => {
  // 6 de octubre: en la cuenta hay Q5,000; faltan dos pagos (15 y 31); gasto habitual Q3,000 al mes.
  const today = '2026-10-06';
  const scenario = (goal: number, extra: Partial<Database> = {}) =>
    base({
      transactions: [spend('2026-09', 300000)],
      fixedExpenses: [fixed({ id: 'renta', amount: 150000, day: 25 })],
      ...extra,
      settings: { monthEndGoal: goal, skippedPaydays: ['2026-09-30'] } as Database['settings'],
    });

  it('calcula con cuánto se llega sin gastar más y al ritmo habitual', () => {
    const o = monthEndOutlook(scenario(0), today);
    expect(o.net).toBe(500000 - 300000);
    expect(o.incomeLeft).toBe(800000);
    expect(o.fixedLeft).toBe(150000);
    expect(o.ifNoMoreSpending).toBe(200000 + 800000 - 150000);
    expect(o.daysLeft).toBe(26);
    expect(o.expectedSpending).toBe(Math.round((300000 / 31) * 25));
    expect(o.projected).toBe(850000 - o.expectedSpending);
    expect(o.status).toBe('sin_meta');
  });

  it('dice cuánto se puede gastar todavía', () => {
    const o = monthEndOutlook(scenario(500000), today);
    expect(o.canSpend).toBe(350000);
    expect(o.canSpendPerDay).toBe(Math.floor(350000 / 26));
    expect(o.status).toBe('bien'); // al ritmo habitual llega con ~6,080, arriba de 5,000
  });

  it('avisa cuando al ritmo actual no se llega', () => {
    const o = monthEndOutlook(scenario(700000), today);
    expect(o.canSpend).toBe(150000);
    expect(o.status).toBe('cuidado');
  });

  it('dice alto cuando ya no se puede gastar más', () => {
    const o = monthEndOutlook(scenario(900000), today);
    expect(o.canSpend).toBe(-50000);
    expect(o.canSpendPerDay).toBe(0);
    expect(o.status).toBe('alto');
  });

  it('cuenta la deuda de tarjeta, los fijos ya pagados y las deudas que vencen', () => {
    const db = scenario(0, {
      cards: [{ id: 'c1', name: 'Visa', bank: '', cutoffDay: 20, paymentDay: 12, limit: 0, openingStatement: 0, openingCycle: 0, openedOn: '2026-07-01', color: '#000', createdAt: 0 }],
      debts: [{ id: 'd1', name: 'Luis', groupId: 'g', direction: 'debo', amount: 60000, date: '2026-10-01', dueDate: '2026-10-20', note: '', createdAt: 0 }],
      transactions: [
        spend('2026-09', 300000),
        tx({ type: 'gasto', amount: 80000, date: '2026-10-02', cardId: 'c1', accountId: undefined }),
        tx({ type: 'gasto', amount: 150000, date: '2026-10-03', fixedId: 'renta' }),
      ],
    });
    const o = monthEndOutlook(db, today);
    expect(netNow(db, today)).toBe(500000 - 300000 - 150000 - 80000);
    expect(o.fixedLeft).toBe(0);
    expect(o.debtsLeft).toBe(60000);
    expect(o.ifNoMoreSpending).toBe(-30000 + 800000 - 60000);
  });

  it('cuenta el pago que ya cayó pero aún no se registra', () => {
    const db = scenario(0);
    db.settings.skippedPaydays = [];
    expect(monthEndOutlook(db, today).incomeLeft).toBe(1200000);
  });

  it('el último día del mes ya no espera más pagos', () => {
    const db = scenario(0, { transactions: [spend('2026-09', 300000), tx({ type: 'ingreso', amount: 400000, date: '2026-10-31', payDate: '2026-10-31' })] });
    const o = monthEndOutlook(db, '2026-10-31');
    expect(o.incomeLeft).toBe(0);
    expect(o.daysLeft).toBe(1);
    expect(o.expectedSpending).toBe(0);
  });
});

describe('proyección de los próximos meses', () => {
  it('acumula lo que sobra cada mes', () => {
    const db = base({
      transactions: [spend('2026-09', 300000)],
      fixedExpenses: [fixed({ id: 'renta', amount: 150000 })],
      settings: { skippedPaydays: ['2026-09-30'] } as Database['settings'],
    });
    const start = monthEndOutlook(db, '2026-10-06').projected;
    const months = forecast(db, '2026-10-06', 3);
    expect(months.map((m) => m.key)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(months[0]).toMatchObject({ income: 800000, fixed: 150000, variable: 300000, saving: 350000, balance: start + 350000 });
    expect(months[2].balance).toBe(start + 350000 * 3);
    expect(monthlyMargin(db, '2026-10-06')).toBe(350000);
  });

  it('una cuota deja de restar cuando termina', () => {
    const db = base({
      transactions: [spend('2026-09', 300000)],
      fixedExpenses: [fixed({ id: 'cuota', amount: 50000, startMonth: '2026-10', endMonth: '2026-12' })],
    });
    expect(forecast(db, '2026-10-06', 4).map((m) => m.fixed)).toEqual([50000, 50000, 0, 0]);
    expect(fixedIn(db, '2026-09')).toBe(0);
    expect(fixedActiveIn(db.fixedExpenses[0], '2027-01')).toBe(false);
    // Y deja de aparecer en los próximos pagos.
    expect(upcoming(db, '2027-01-02').filter((i) => i.kind === 'fijo')).toEqual([]);
    expect(overview(db, '2027-01-02').fixedDue).toBe(0);
  });
});

describe('cuotas', () => {
  it('calcula lo que se paga de más y el interés anual equivalente', () => {
    const c = planCost(plan()); // Q5,000 de contado o 24 cuotas de Q289
    expect(c.total).toBe(693600);
    expect(c.extra).toBe(193600);
    expect(c.extraRatio).toBeCloseTo(0.3872, 4);
    expect(c.annualRate).toBeGreaterThan(0.35);
    expect(c.annualRate).toBeLessThan(0.45);
  });

  it('la tasa coincide con un préstamo conocido y es 0 sin recargo', () => {
    // Q10,000 a 12 meses con 2 % mensual → cuota de Q945.60 → 26.8 % anual efectivo.
    expect(annualRate(1000000, 94560, 12)).toBeCloseTo(Math.pow(1.02, 12) - 1, 3);
    expect(annualRate(120000, 10000, 12)).toBe(0);
    expect(annualRate(120000, 9000, 12)).toBe(0);
    expect(annualRate(0, 100, 12)).toBe(0);
  });

  const withHistory = (variable: number, extra: Partial<Database> = {}) =>
    base({ transactions: [spend('2026-09', variable)], ...extra });

  it('dice que sí cuando sobra con holgura y no hay recargo', () => {
    const e = evaluatePlan(withHistory(300000), plan({ cashPrice: 120000, months: 12, monthly: 10000 }), '2026-10-03');
    expect(e).toMatchObject({ verdict: 'si', marginBefore: 500000, marginAfter: 490000, income: 800000 });
    expect(e.reasons).toEqual(['sin_recargo']);
  });

  it('dice que no cuando la cuota no cabe', () => {
    const e = evaluatePlan(withHistory(780000), plan(), '2026-10-03');
    expect(e.verdict).toBe('no');
    expect(e.marginAfter).toBe(20000 - 28900);
    expect(e.reasons).toContain('no_alcanza');
  });

  it('dice ajustado cuando queda poco margen', () => {
    const e = evaluatePlan(withHistory(700000), plan({ cashPrice: 60000, months: 2, monthly: 30000 }), '2026-10-03');
    expect(e.marginAfter).toBe(70000); // menos del 10 % de 8,000
    expect(e.verdict).toBe('ajustado');
    expect(e.reasons).toContain('queda_poco');
  });

  it('advierte el recargo alto, el plazo largo y cuando conviene más ahorrar', () => {
    const e = evaluatePlan(withHistory(300000), plan({ months: 36, monthly: 21000 }), '2026-10-03');
    expect(e.verdict).toBe('ajustado'); // cabe, pero se paga 51 % más
    expect(e.reasons).toEqual(expect.arrayContaining(['recargo_alto', 'plazo_largo', 'mejor_ahorrar']));
    expect(e.monthsToSaveCash).toBe(1);
    expect(e.lastMonth).toBe('2029-10');
  });

  it('suma las cuotas que ya se tienen', () => {
    const db = withHistory(300000, {
      installments: [plan({ id: 'otra', status: 'activa', fixedId: 'f-otra', monthly: 200000 })],
      fixedExpenses: [fixed({ id: 'f-otra', amount: 200000 })],
    });
    const e = evaluatePlan(db, plan({ cashPrice: 120000, months: 12, monthly: 60000 }), '2026-10-03');
    expect(e.marginBefore).toBe(300000);
    expect(e.allInstallments).toBe(260000); // 32.5 % del ingreso
    expect(e.verdict).toBe('ajustado');
    expect(e.reasons).toContain('muchas_cuotas');
  });

  it('una cuota activa no se resta dos veces al evaluarla', () => {
    const active = plan({ status: 'activa', fixedId: 'f1', cashPrice: 120000, months: 12, monthly: 10000 });
    const db = withHistory(300000, { installments: [active], fixedExpenses: [fixed({ id: 'f1', amount: 10000 })] });
    expect(evaluatePlan(db, active, '2026-10-03')).toMatchObject({ marginBefore: 500000, marginAfter: 490000 });
  });

  it('sin datos suficientes no da veredicto', () => {
    expect(evaluatePlan(base(), plan(), '2026-07-02').verdict).toBe('sin_datos');
    expect(evaluatePlan(base({ settings: { payAmount: 0 } as Database['settings'] }), plan(), '2026-07-02').verdict).toBe('sin_datos');
  });

  it('cuenta las cuotas pagadas y limpia al borrar', () => {
    const active = plan({ status: 'activa', fixedId: 'f1' });
    const db = base({
      installments: [active],
      fixedExpenses: [fixed({ id: 'f1', amount: 28900 })],
      transactions: [tx({ type: 'gasto', amount: 28900, date: '2026-08-10', fixedId: 'f1' }), tx({ type: 'gasto', amount: 28900, date: '2026-09-10', fixedId: 'f1' })],
    });
    expect(paidInstallments(db, active)).toBe(2);
    const withoutPlan = removeEntity(db, 'installments', 'p1');
    expect(withoutPlan.installments).toEqual([]);
    expect(withoutPlan.fixedExpenses).toEqual([]);
    expect(withoutPlan.transactions).toHaveLength(2); // los pagos hechos se conservan
    expect(withoutPlan.transactions[0].fixedId).toBeUndefined();
    const withoutFixed = removeEntity(db, 'fixedExpenses', 'f1');
    expect(withoutFixed.installments[0]).toMatchObject({ status: 'idea', fixedId: undefined });
  });

  it('los datos nuevos se validan al cargar', () => {
    const clean = sanitizeDatabase({ accounts: [], transactions: [], installments: [plan(), { id: 'x', months: 0 }, { id: 'y', cashPrice: 'mucho', months: 3, monthly: 1 }], settings: { monthEndGoal: -5 } }, '2026-10-06', 1)!;
    expect(clean.installments.map((p) => p.id)).toEqual(['p1']);
    expect(clean.settings.monthEndGoal).toBe(0);
    expect(sanitizeDatabase({ accounts: [], transactions: [] }, '2026-10-06', 1)!.installments).toEqual([]);
  });
});

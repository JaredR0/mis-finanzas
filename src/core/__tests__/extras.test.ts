import { describe, expect, it } from 'vitest';

import { budgetAlerts, budgetCrossing, budgetLevel } from '../budget';
import { emptyDatabase } from '../defaults';
import { extraDateIn, extraDueIn, extraIncomeIn, extraIncomeReceived, extraPendingIn, upcomingExtras } from '../extraIncome';
import { forecast, monthEndOutlook, monthlyMargin } from '../forecast';
import { removeEntity, sanitizeDatabase } from '../mutations';
import { amountNeeded, contributionDates, dateReached, describeStep, keepDate, planProgress, postpone, stepDate, takenOutOfPlan } from '../savingsGoal';
import { dateFromWord, searchTransactions } from '../search';
import type { Database, Envelope, ExtraIncome, Transaction } from '../types';

let seq = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>): Transaction => ({
  id: `t${++seq}`, createdAt: seq, note: '', source: 'manual', accountId: 'a1', ...t,
});
const base = (patch: Partial<Database> = {}): Database => {
  const db = emptyDatabase('2026-07-01', 0);
  db.accounts = [{ id: 'a1', name: 'Monetaria', kind: 'banco', initialBalance: 500000, color: '#000', createdAt: 0 }];
  db.cards = [{ id: 'c1', name: 'Visa Banrural', bank: 'Banrural', cutoffDay: 20, paymentDay: 12, limit: 0, openingStatement: 0, openingCycle: 0, openedOn: '2026-07-01', color: '#000', createdAt: 0 }];
  db.settings = { ...db.settings, payAmount: 400000, payDays: [15, 31], payAccountId: 'a1', startedOn: '2026-07-01', skippedPaydays: ['2026-09-30'] };
  return { ...db, ...patch, settings: { ...db.settings, ...patch.settings } };
};

describe('buscador', () => {
  const db = base();
  const food = db.categories.find((c) => c.key === 'comida')!;
  db.transactions = [
    tx({ type: 'gasto', amount: 8500, date: '2026-10-06', note: 'Almuerzo', merchant: 'Pollo Campero', categoryId: food.id, cardId: 'c1', accountId: undefined }),
    tx({ type: 'gasto', amount: 8550, date: '2026-10-02', note: 'Café con Ana' }),
    tx({ type: 'gasto', amount: 202600, date: '2026-09-15', note: 'Laptop usada' }),
    tx({ type: 'ingreso', amount: 400000, date: '2026-09-30', note: 'Quincena' }),
    tx({ type: 'gasto', amount: 1200, date: '2025-10-06', note: 'Pan' }),
  ];
  const notes = (query: string) => searchTransactions(db, query).map((t) => t.note);

  it('busca por texto sin importar mayúsculas ni tildes', () => {
    expect(notes('CAFE')).toEqual(['Café con Ana']);
    expect(notes('campero')).toEqual(['Almuerzo']);
    expect(notes('comida')).toEqual(['Almuerzo']); // por categoría
    expect(notes('banrural')).toEqual(['Almuerzo']); // por tarjeta
    expect(notes('monetaria')).toHaveLength(4); // por cuenta
    expect(notes('zzz')).toEqual([]);
  });

  it('busca por monto', () => {
    expect(notes('85')).toEqual(['Almuerzo', 'Café con Ana']); // Q85.00 y Q85.50
    expect(notes('85.50')).toEqual(['Café con Ana']);
    expect(notes('Q85.00')).toEqual(['Almuerzo']);
    expect(notes('4000')).toEqual(['Quincena']);
    expect(notes('4,000')).toEqual(['Quincena']);
  });

  it('busca por fecha, mes y día de la semana', () => {
    expect(notes('06/10')).toEqual(['Almuerzo', 'Pan']); // cualquier año
    expect(notes('6/10/2026')).toEqual(['Almuerzo']);
    expect(notes('2026-10-06')).toEqual(['Almuerzo']);
    expect(notes('septiembre')).toEqual(['Quincena', 'Laptop usada']);
    expect(notes('sep')).toEqual(['Quincena', 'Laptop usada']);
    expect(notes('viernes')).toEqual(['Café con Ana']); // 2 de octubre de 2026
    expect(dateFromWord('6/10/26')).toBe('2026-10-06');
  });

  it('un número de cuatro cifras sirve como año y como monto', () => {
    expect(notes('2025')).toEqual(['Pan']);
    expect(notes('2026').length).toBe(4);
    expect(notes('2026 laptop')).toEqual(['Laptop usada']); // Q2,026.00
  });

  it('con varias palabras deben coincidir todas; del más reciente al más antiguo', () => {
    expect(notes('octubre cafe')).toEqual(['Café con Ana']);
    expect(notes('octubre 2026')).toEqual(['Almuerzo', 'Café con Ana']);
    expect(notes('octubre quincena')).toEqual([]);
    expect(notes('   ')).toEqual([]);
  });
});

describe('ingresos extra', () => {
  const extra = (x: Partial<ExtraIncome> & Pick<ExtraIncome, 'id' | 'frequency' | 'date'>): ExtraIncome => ({
    name: x.id, amount: 100000, active: true, createdAt: 0, accountId: 'a1', ...x,
  });
  const bonus = extra({ id: 'aguinaldo', frequency: 'anual', date: '2026-12-15', amount: 400000 });
  const freelance = extra({ id: 'freelance', frequency: 'mensual', date: '2026-10-25', amount: 150000 });
  const sale = extra({ id: 'venta', frequency: 'unica', date: '2026-11-10', amount: 50000 });

  it('sabe en qué meses toca cada uno', () => {
    expect(['2026-11', '2026-12', '2027-01', '2027-12'].map((k) => extraDueIn(bonus, k))).toEqual([false, true, false, true]);
    expect(['2026-09', '2026-10', '2027-03'].map((k) => extraDueIn(freelance, k))).toEqual([false, true, true]);
    expect(['2026-10', '2026-11', '2026-12'].map((k) => extraDueIn(sale, k))).toEqual([false, true, false]);
    expect(extraDueIn({ ...freelance, active: false }, '2026-10')).toBe(false);
    expect(extraDateIn(extra({ id: 'x', frequency: 'mensual', date: '2026-01-31' }), '2026-02')).toBe('2026-02-28');
  });

  it('entran en la proyección del mes que toca', () => {
    const db = base({ extraIncomes: [bonus, freelance, sale], transactions: [tx({ type: 'gasto', amount: 300000, date: '2026-09-05' })] });
    expect(extraIncomeIn(db, '2026-12')).toBe(550000);
    const months = forecast(db, '2026-10-06', 3);
    expect(months.map((m) => [m.key, m.extra, m.income])).toEqual([
      ['2026-11', 200000, 1000000],
      ['2026-12', 550000, 1350000],
      ['2027-01', 150000, 950000],
    ]);
    expect(months[1].saving).toBe(1350000 - 300000);
  });

  it('lo esperado este mes cuenta hasta que se confirma (y no se cuenta dos veces)', () => {
    const db = base({ extraIncomes: [freelance], transactions: [tx({ type: 'gasto', amount: 300000, date: '2026-09-05' })] });
    const before = monthEndOutlook(db, '2026-10-06');
    expect(before.extraLeft).toBe(150000);
    expect(before.incomeLeft).toBe(800000 + 150000);
    db.transactions.push(tx({ type: 'ingreso', amount: 150000, date: '2026-10-25', extraId: 'freelance', extraPeriod: '2026-10' }));
    expect(extraPendingIn(db, '2026-10')).toBe(0);
    const after = monthEndOutlook(db, '2026-10-26');
    expect(after.extraLeft).toBe(0);
    expect(after.net).toBe(before.net + 150000);
    expect(extraPendingIn(db, '2026-11')).toBe(150000); // el del mes siguiente sigue pendiente
  });

  it('para evaluar cuotas solo cuenta lo que entra todos los meses', () => {
    const history = [tx({ type: 'gasto', amount: 300000, date: '2026-09-05' })];
    expect(monthlyMargin(base({ transactions: history }), '2026-10-06')).toBe(500000);
    expect(monthlyMargin(base({ transactions: history, extraIncomes: [freelance] }), '2026-10-06')).toBe(650000);
    expect(monthlyMargin(base({ transactions: history, extraIncomes: [bonus, sale] }), '2026-10-06')).toBe(500000);
  });

  it('lista los próximos y separa el ingreso que no es sueldo', () => {
    const db = base({ extraIncomes: [bonus, sale], transactions: [
      tx({ type: 'ingreso', amount: 400000, date: '2026-10-15', payDate: '2026-10-15' }),
      tx({ type: 'ingreso', amount: 30000, date: '2026-10-20', note: 'Venta de libro' }),
    ] });
    expect(upcomingExtras(db, '2026-10-06', 14).map((o) => [o.extra.id, o.date])).toEqual([
      ['venta', '2026-11-10'], ['aguinaldo', '2026-12-15'],
    ]);
    expect(extraIncomeReceived(db, '2026-10')).toBe(30000);
  });

  it('al borrar uno, los ingresos ya recibidos se conservan', () => {
    const db = base({ extraIncomes: [sale], transactions: [tx({ type: 'ingreso', amount: 50000, date: '2026-11-10', extraId: 'venta', extraPeriod: '2026-11' })] });
    const next = removeEntity(db, 'extraIncomes', 'venta');
    expect(next.extraIncomes).toEqual([]);
    expect(next.transactions[0]).toMatchObject({ amount: 50000, extraId: undefined, extraPeriod: undefined });
    const clean = sanitizeDatabase({ accounts: [], transactions: [], extraIncomes: [sale, { id: 'mal', amount: 5, frequency: 'semanal', date: '2026-01-01' }, { id: 'peor', amount: -1, frequency: 'unica', date: '2026-01-01' }] }, '2026-10-06', 1)!;
    expect(clean.extraIncomes.map((x) => x.id)).toEqual(['venta']);
  });
});

describe('aviso de presupuesto', () => {
  const setup = (spent: number) => {
    const db = base();
    const food = db.categories.find((c) => c.key === 'comida')!;
    food.monthlyBudget = 100000;
    db.transactions = [tx({ type: 'gasto', amount: spent, date: '2026-10-03', categoryId: food.id })];
    return { db, food };
  };
  const add = (db: Database, categoryId: string, amount: number): Database => ({
    ...db, transactions: [...db.transactions, tx({ type: 'gasto', amount, date: '2026-10-06', categoryId })],
  });

  it('clasifica: bien, cerca desde el 80 % y pasado arriba del 100 %', () => {
    expect([79999, 80000, 100000, 100001].map((s) => budgetLevel(s, 100000))).toEqual(['bien', 'cerca', 'cerca', 'pasado']);
    expect(budgetLevel(999999, 0)).toBe('bien'); // sin presupuesto no hay aviso
  });

  it('lista las categorías cerca o pasadas, la más grave primero', () => {
    const { db, food } = setup(85000);
    const transport = db.categories.find((c) => c.key === 'transporte')!;
    transport.monthlyBudget = 20000;
    db.transactions.push(tx({ type: 'gasto', amount: 30000, date: '2026-10-04', categoryId: transport.id }));
    db.transactions.push(tx({ type: 'gasto', amount: 99999, date: '2026-09-04', categoryId: food.id })); // otro mes
    expect(budgetAlerts(db, '2026-10').map((a) => [a.category.name, a.level, a.left])).toEqual([
      ['Transporte', 'pasado', -10000],
      ['Comida', 'cerca', 15000],
    ]);
    expect(budgetAlerts(db, '2026-08')).toEqual([]);
  });

  it('avisa solo cuando un gasto hace cruzar el 80 % o el 100 %', () => {
    const { db, food } = setup(70000);
    expect(budgetCrossing(db, add(db, food.id, 5000), food.id, '2026-10')).toBeNull(); // 75 %
    expect(budgetCrossing(db, add(db, food.id, 12000), food.id, '2026-10')).toMatchObject({ level: 'cerca', left: 18000 });
    expect(budgetCrossing(db, add(db, food.id, 40000), food.id, '2026-10')).toMatchObject({ level: 'pasado', left: -10000 });
    const near = setup(85000);
    expect(budgetCrossing(near.db, add(near.db, near.food.id, 5000), near.food.id, '2026-10')).toBeNull(); // ya estaba cerca
    expect(budgetCrossing(near.db, add(near.db, near.food.id, 20000), near.food.id, '2026-10')?.level).toBe('pasado');
    expect(budgetCrossing(db, add(db, food.id, 50000), undefined, '2026-10')).toBeNull();
  });
});

describe('meta de ahorro con fecha', () => {
  const weekly = { unit: 'semana', every: 1 } as const;
  const goal = (plan: Partial<NonNullable<Envelope['plan']>> = {}, target = 1000000): Envelope => ({
    id: 'e1', name: 'Viaje', kind: 'ahorro', icon: 'airplane', color: '#000', target, createdAt: 0,
    plan: { startDate: '2026-10-05', targetDate: '2026-12-07', step: weekly, amount: 100000, baseBalance: 0, ...plan },
  });

  it('calcula las fechas de aporte según la frecuencia', () => {
    expect(contributionDates('2026-10-05', '2026-10-26', weekly)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(contributionDates('2026-10-05', '2026-10-09', { unit: 'dia', every: 2 })).toEqual(['2026-10-05', '2026-10-07', '2026-10-09']);
    expect(contributionDates('2026-01-31', '2026-04-30', { unit: 'mes', every: 1 })).toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
    expect(stepDate('2026-10-05', { unit: 'semana', every: 2 }, 3)).toBe('2026-11-16');
    expect(contributionDates('2026-10-05', '2026-10-04', weekly)).toEqual([]);
    expect([describeStep(weekly), describeStep({ unit: 'dia', every: 3 }), describeStep({ unit: 'mes', every: 1 })]).toEqual(['cada semana', 'cada 3 días', 'cada mes']);
  });

  it('dice cuánto aportar cada vez, o en qué fecha se llega', () => {
    expect(amountNeeded(1000000, '2026-10-05', '2026-12-07', weekly)).toBe(100000); // 10 semanas
    expect(amountNeeded(1000000, '2026-10-05', '2026-10-19', weekly)).toBe(333334); // redondea hacia arriba
    expect(amountNeeded(0, '2026-10-05', '2026-12-07', weekly)).toBe(0);
    expect(dateReached(1000000, '2026-10-05', 100000, weekly)).toBe('2026-12-07');
    expect(dateReached(250000, '2026-10-05', 100000, weekly)).toBe('2026-10-19'); // 3 aportes
  });

  it('va al día cuando se aporta lo planeado', () => {
    const p = planProgress(goal(), 300000, '2026-10-20')!; // tocaban 3 aportes (5, 12 y 19)
    expect(p).toMatchObject({ state: 'al_dia', expected: 300000, gap: 0, missing: 700000, nextDate: '2026-10-26', stepsLeft: 7, needsAdjustment: false });
    expect(planProgress(goal(), 500000, '2026-10-20')!.state).toBe('adelantado');
    expect(planProgress(goal(), 1000000, '2026-10-20')!).toMatchObject({ state: 'cumplida', nextDate: null, missing: 0 });
  });

  it('si se saca dinero, ofrece mantener la fecha o aplazar', () => {
    // Llevaba Q3,000 al día y sacó Q2,000 para un gasto: tiene Q1,000 el 20 de octubre.
    const envelope = goal();
    const p = planProgress(envelope, 100000, '2026-10-20')!;
    expect(p).toMatchObject({ state: 'atrasado', gap: -200000, missing: 900000, stepsLeft: 7, needsAdjustment: true });
    expect(p.keepDateAmount).toBe(128572); // 9,000 entre 7 aportes
    expect(p.postponedDate).toBe('2026-12-21'); // 9 aportes de 1,000 desde el 26 de octubre

    const kept = keepDate(envelope, 100000, '2026-10-20')!;
    expect(kept).toEqual({ startDate: '2026-10-26', targetDate: '2026-12-07', step: weekly, amount: 128572, baseBalance: 100000 });
    expect(planProgress({ ...envelope, plan: kept }, 100000, '2026-10-20')!).toMatchObject({ state: 'al_dia', needsAdjustment: false, gap: 0 });

    const later = postpone(envelope, 100000, '2026-10-20')!;
    expect(later).toEqual({ startDate: '2026-10-26', targetDate: '2026-12-21', step: weekly, amount: 100000, baseBalance: 100000 });
    expect(planProgress({ ...envelope, plan: later }, 100000, '2026-10-20')!).toMatchObject({ state: 'al_dia', needsAdjustment: false });
  });

  it('después de ajustar, sigue el plan nuevo', () => {
    const kept = keepDate(goal(), 100000, '2026-10-20')!;
    const after = planProgress({ ...goal(), plan: kept }, 100000 + 128572 * 2, '2026-11-03')!;
    expect(after.state).toBe('al_dia');
    expect(after.stepsLeft).toBe(5);
  });

  it('avisa si la fecha ya pasó sin llegar', () => {
    const p = planProgress(goal(), 600000, '2026-12-20')!;
    expect(p.state).toBe('vencida');
    expect(p.needsAdjustment).toBe(true);
    const later = postpone(goal(), 600000, '2026-12-20')!;
    expect(later.targetDate > '2026-12-20').toBe(true);
    const kept = keepDate(goal(), 600000, '2026-12-20')!;
    expect(kept.amount).toBe(400000); // ya no queda más que un aporte
  });

  it('sin plan o sin meta no hay nada que evaluar', () => {
    expect(planProgress({ ...goal(), plan: undefined }, 0, '2026-10-20')).toBeNull();
    expect(planProgress(goal({}, 0), 0, '2026-10-20')).toBeNull();
    const clean = sanitizeDatabase({ accounts: [], transactions: [], envelopes: [goal(), { ...goal(), id: 'e2', plan: { startDate: 'ayer', amount: 5 } }] }, '2026-10-06', 1)!;
    expect(clean.envelopes.map((e) => !!e.plan)).toEqual([true, false]);
  });
});

describe('meta de ahorro: el día del aporte', () => {
  const envelope: Envelope = {
    id: 'e1', name: 'Viaje', kind: 'ahorro', icon: 'airplane', color: '#000', target: 1000000, createdAt: 0,
    plan: { startDate: '2026-10-05', targetDate: '2026-12-07', step: { unit: 'semana', every: 1 }, amount: 100000, baseBalance: 0 },
  };

  it('recién creada no aparece atrasada', () => {
    expect(planProgress(envelope, 0, '2026-10-05')!).toMatchObject({ state: 'al_dia', expected: 0, nextDate: '2026-10-05', needsAdjustment: false });
  });

  it('si ya se aportó hoy, el próximo es la semana siguiente', () => {
    expect(planProgress(envelope, 100000, '2026-10-05')!).toMatchObject({ state: 'al_dia', nextDate: '2026-10-12' });
    expect(planProgress(envelope, 100000, '2026-10-12')!).toMatchObject({ state: 'al_dia', nextDate: '2026-10-12', expected: 100000 });
  });

  it('sacar dinero el mismo día del aporte no lo borra: el hueco se nota y pide ajustar', () => {
    // Aportó Q1,000 hoy y luego sacó Q200: quedan Q800 y 9 aportes de Q1,000 no alcanzan para los Q9,200 que faltan.
    const sinContar = planProgress(envelope, 80000, '2026-10-05')!;
    expect(sinContar).toMatchObject({ nextDate: '2026-10-05', needsAdjustment: false }); // así lo veía antes: "aporta otra vez hoy"
    const p = planProgress(envelope, 80000, '2026-10-05', 20000)!;
    expect(p).toMatchObject({ nextDate: '2026-10-12', stepsLeft: 9, missing: 920000, needsAdjustment: true, state: 'atrasado' });
    expect(p.keepDateAmount).toBe(102223); // 9,200 entre 9 aportes

    const kept = keepDate(envelope, 80000, '2026-10-05', { takenOut: 20000, now: 500 })!;
    expect(kept).toMatchObject({ startDate: '2026-10-12', targetDate: '2026-12-07', amount: 102223, baseBalance: 80000, since: 500 });
    const later = postpone(envelope, 80000, '2026-10-05', { takenOut: 20000, now: 500 })!;
    expect(later).toMatchObject({ startDate: '2026-10-12', targetDate: '2026-12-14', amount: 100000, since: 500 });
    // Ya reajustado, lo que se sacó antes deja de contar y el plan vuelve a estar al día.
    expect(planProgress({ ...envelope, plan: kept }, 80000, '2026-10-05', 0)!).toMatchObject({ state: 'al_dia', needsAdjustment: false, nextDate: '2026-10-12' });
  });

  it('cuenta lo sacado solo desde que se creó o reajustó el plan', () => {
    const txs = [
      tx({ type: 'retiro', amount: 20000, date: '2026-10-05', envelopeId: 'e1', createdAt: 100 }),
      tx({ type: 'gasto', amount: 5000, date: '2026-10-06', envelopeId: 'e1', createdAt: 900 }),
      tx({ type: 'aporte', amount: 100000, date: '2026-10-05', envelopeId: 'e1', createdAt: 50 }),
      tx({ type: 'retiro', amount: 7000, date: '2026-10-06', envelopeId: 'otro', createdAt: 950 }),
      tx({ type: 'retiro', amount: 3000, date: '2026-09-01', envelopeId: 'e1', createdAt: 10 }),
    ];
    expect(takenOutOfPlan(envelope, txs)).toBe(25000); // sin marca de tiempo: por fecha desde el inicio
    expect(takenOutOfPlan({ ...envelope, plan: { ...envelope.plan!, since: 500 } }, txs)).toBe(5000);
    expect(takenOutOfPlan({ ...envelope, plan: undefined }, txs)).toBe(0);
  });

  it('al día siguiente sin aportar ya cuenta como atraso', () => {
    expect(planProgress(envelope, 0, '2026-10-06')!).toMatchObject({ state: 'atrasado', gap: -100000 });
  });
});

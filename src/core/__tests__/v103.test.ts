import { describe, expect, it } from 'vitest';

import { autoFixedDrafts } from '../autoFixed';
import { overview, paydayPrompt, pendingPayday } from '../balances';
import { calendarMonth } from '../calendar';
import { payoffPlan, simulatePayoff } from '../debtPlan';
import { emptyDatabase } from '../defaults';
import { baseline, monthEndOutlook } from '../forecast';
import { sanitizeDatabase } from '../mutations';
import { describePayDays, monthlyPayCount, nextPayday, paydaysIn, payFrequency, payPeriod, previousPayday } from '../payCycle';
import { compareMonths } from '../reports';
import type { Database, Transaction } from '../types';

let seq = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>): Transaction => ({
  id: `v${++seq}`, createdAt: seq, note: '', source: 'manual', accountId: 'a1', ...t,
});
const TODAY = '2026-10-07'; // miércoles
const base = (): Database => {
  const db = emptyDatabase('2026-07-01', 0);
  db.accounts = [{ id: 'a1', name: 'Monetaria', kind: 'banco', initialBalance: 1000000, color: '#000', createdAt: 0 }];
  db.cards = [{ id: 'c1', name: 'Visa', bank: 'Banrural', cutoffDay: 20, paymentDay: 12, limit: 0, openingStatement: 0, openingCycle: 0, openedOn: '2026-07-01', color: '#000', createdAt: 0 }];
  db.settings = { ...db.settings, payAmount: 400000, payDays: [15, 31], payAccountId: 'a1', startedOn: '2026-07-01' };
  db.transactions = ['2026-07-10', '2026-08-10', '2026-09-10'].map((date) => tx({ type: 'gasto', amount: 300000, date }));
  return db;
};

describe('pago semanal y cada dos semanas', () => {
  const weekly = { payDays: [15, 31], payWeekly: { anchor: '2026-10-02', every: 1 } }; // viernes
  const biweekly = { payDays: [15, 31], payWeekly: { anchor: '2026-10-02', every: 2 } };

  it('calcula el pago anterior, el siguiente y el periodo', () => {
    expect(payFrequency(weekly)).toBe('semanal');
    expect(payFrequency(biweekly)).toBe('catorcenal');
    expect([previousPayday(TODAY, weekly), nextPayday(TODAY, weekly)]).toEqual(['2026-10-02', '2026-10-09']);
    expect(payPeriod(TODAY, weekly)).toMatchObject({ start: '2026-10-02', end: '2026-10-09', totalDays: 7, daysLeft: 2 });
    expect([previousPayday(TODAY, biweekly), nextPayday(TODAY, biweekly)]).toEqual(['2026-10-02', '2026-10-16']);
    expect(previousPayday('2026-10-09', weekly)).toBe('2026-10-09'); // el día de pago cuenta como ya pagado
    // Funciona igual para fechas anteriores al ancla y muy posteriores.
    expect(nextPayday('2026-09-01', biweekly)).toBe('2026-09-04');
    expect(nextPayday('2028-02-29', weekly)).toBe('2028-03-03');
  });

  it('lista los días de pago de cada mes y estima el ingreso mensual', () => {
    expect(paydaysIn(weekly, '2026-10')).toEqual(['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30']);
    expect(paydaysIn(biweekly, '2026-10')).toEqual(['2026-10-02', '2026-10-16', '2026-10-30']);
    expect(paydaysIn(biweekly, '2026-11')).toEqual(['2026-11-13', '2026-11-27']);
    expect(paydaysIn([15, 31], '2027-02')).toEqual(['2027-02-15', '2027-02-28']);
    expect(monthlyPayCount(weekly)).toBeCloseTo(4.333, 2);
    expect([describePayDays(weekly), describePayDays(biweekly)]).toEqual(['Cada viernes', 'Un viernes sí y otro no']);

    const db = base();
    db.settings = { ...db.settings, payAmount: 100000, payWeekly: weekly.payWeekly };
    expect(baseline(db, TODAY).income).toBe(433333); // Q1,000 × 52 semanas ÷ 12 meses
    expect(overview(db, TODAY).period.end).toBe('2026-10-09');
    // Faltan los viernes 9, 16, 23 y 30 de octubre, más el del 2 que aún no se registra.
    expect(monthEndOutlook(db, TODAY).incomeLeft).toBe(500000);
    const paydays = calendarMonth(db, '2026-10', TODAY).days.flatMap((d) => d.events).filter((e) => e.kind === 'sueldo');
    expect(paydays.map((e) => e.date)).toEqual(['2026-10-02', '2026-10-09', '2026-10-16', '2026-10-23', '2026-10-30']);
    expect(pendingPayday({ ...db, settings: { ...db.settings, startedOn: '2026-10-01' } }, TODAY)).toBe('2026-10-02');
  });

  it('un pago semanal mal guardado se descarta y vuelve a los días del mes', () => {
    const db = base();
    const dirty = { ...db, settings: { ...db.settings, payWeekly: { anchor: 'viernes', every: 1 } } };
    expect(sanitizeDatabase(dirty, TODAY, 0)!.settings.payWeekly).toBeUndefined();
  });
});

describe('ingreso variable', () => {
  const variable = (): Database => {
    const db = base();
    db.settings = { ...db.settings, payAmount: 0, payDays: [], incomeEstimate: 600000, startedOn: TODAY };
    db.transactions = [];
    return db;
  };

  it('sin días de pago el periodo es el mes y no pregunta por pagos', () => {
    const db = variable();
    expect(payFrequency(db.settings)).toBe('variable');
    expect(overview(db, TODAY).period).toMatchObject({ start: '2026-10-01', end: '2026-11-01', daysLeft: 25 });
    expect(pendingPayday(db, TODAY)).toBeNull();
    expect(paydaysIn(db.settings, '2026-10')).toEqual([]);
  });

  it('usa lo que calculas ganar hasta que haya historial, y descuenta lo que ya entró', () => {
    const db = variable();
    expect(baseline(db, TODAY).income).toBe(600000);
    expect(monthEndOutlook(db, TODAY).incomeLeft).toBe(600000);
    db.transactions.push(tx({ type: 'ingreso', amount: 250000, date: '2026-10-05' }));
    expect(monthEndOutlook(db, TODAY).incomeLeft).toBe(350000);
    db.transactions.push(tx({ type: 'ingreso', amount: 500000, date: '2026-10-06' }));
    expect(monthEndOutlook(db, TODAY).incomeLeft).toBe(0); // ya entró más de lo calculado: no promete más
    // Con meses completos registrados manda el promedio real.
    const later = variable();
    later.settings.startedOn = '2026-07-01';
    later.transactions = [tx({ type: 'ingreso', amount: 800000, date: '2026-09-20' }), tx({ type: 'gasto', amount: 100000, date: '2026-09-21' })];
    expect(baseline(later, TODAY).income).toBe(800000);
  });
});

describe('aviso de pago: "todavía no" vuelve a preguntar', () => {
  it('se calla hasta mañana y luego pregunta otra vez; "ya lo tenía contado" lo cierra', () => {
    const db = base();
    db.settings = { ...db.settings, startedOn: '2026-10-01', payDays: [7] };
    expect(paydayPrompt(db, TODAY)).toBe(TODAY);
    db.settings.payAskAfter = '2026-10-08';
    expect(paydayPrompt(db, TODAY)).toBeNull();
    expect(pendingPayday(db, TODAY)).toBe(TODAY); // sigue pendiente: cuenta como ingreso por recibir
    expect(paydayPrompt(db, '2026-10-08')).toBe(TODAY);
    db.settings.skippedPaydays = [TODAY];
    expect(paydayPrompt(db, '2026-10-08')).toBeNull();
  });
});

describe('gastos fijos que se cobran solos', () => {
  it('registra el del mes cuando llega su día, con la fecha en que tocaba, una sola vez', () => {
    const db = base();
    db.fixedExpenses = [
      { id: 'netflix', name: 'Netflix', amount: 8900, day: 5, cardId: 'c1', active: true, auto: true },
      { id: 'internet', name: 'Internet', amount: 30000, day: 20, accountId: 'a1', active: true, auto: true },
      { id: 'renta', name: 'Renta', amount: 250000, day: 1, accountId: 'a1', active: true },
      { id: 'pausado', name: 'Gimnasio', amount: 20000, day: 2, accountId: 'a1', active: false, auto: true },
      { id: 'sinpago', name: 'Seguro', amount: 15000, day: 3, active: true, auto: true },
      { id: 'cuota', name: 'Cuota: TV', amount: 50000, day: 4, accountId: 'a1', active: true, auto: true, startMonth: '2026-11', endMonth: '2027-04' },
    ];
    const drafts = autoFixedDrafts(db, TODAY);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ type: 'gasto', amount: 8900, date: '2026-10-05', cardId: 'c1', accountId: undefined, fixedId: 'netflix', source: 'fijo' });
    db.transactions.push({ ...drafts[0], id: 'auto1', createdAt: 1 });
    expect(autoFixedDrafts(db, TODAY)).toEqual([]);
    expect(autoFixedDrafts(db, '2026-10-20').map((d) => d.fixedId)).toEqual(['internet']);
    // Al mes siguiente vuelve a tocar, y la cuota ya empezó.
    expect(autoFixedDrafts(db, '2026-11-05').map((d) => d.fixedId)).toEqual(['netflix', 'cuota']);
  });
});

describe('plan para salir de deudas', () => {
  const debts = [
    { id: 'tarjeta', name: 'Tarjeta vieja', balance: 500000, rate: 0.48, min: 25000 },
    { id: 'mama', name: 'Mamá', balance: 100000, rate: 0, min: 0 },
    { id: 'banco', name: 'Préstamo', balance: 1200000, rate: 0.18, min: 60000 },
  ];

  it('bola de nieve paga primero la más pequeña; avalancha la de más interés', () => {
    const snow = simulatePayoff(debts, '2026-10', 200000, 'bola_de_nieve');
    expect(snow.debts.map((d) => d.id)).toEqual(['mama', 'tarjeta', 'banco']);
    expect(snow.debts[0]).toMatchObject({ payNow: 100000, months: 1, paidOffIn: '2026-10', interest: 0 });
    // Mes 1: mínimos (250 + 600) y lo demás a la primera; lo que sobra de esa pasa a la siguiente.
    expect(snow.debts.map((d) => d.payNow)).toEqual([100000, 40000, 60000]);
    const avalanche = simulatePayoff(debts, '2026-10', 200000, 'avalancha');
    expect(avalanche.debts.map((d) => d.id)).toEqual(['tarjeta', 'banco', 'mama']);
    expect(avalanche.totalInterest).toBeLessThan(snow.totalInterest);
    expect(avalanche.months).not.toBeNull();
    expect(snow.debtFreeIn! >= '2027-06').toBe(true);
  });

  it('más dinero al mes termina antes; los bonos adelantan', () => {
    const slow = simulatePayoff(debts, '2026-10', 150000, 'avalancha');
    const fast = simulatePayoff(debts, '2026-10', 300000, 'avalancha');
    const bonus = simulatePayoff(debts, '2026-10', 150000, 'avalancha', (key) => (key === '2026-12' ? 800000 : 0));
    expect(fast.months!).toBeLessThan(slow.months!);
    expect(bonus.months!).toBeLessThan(slow.months!);
    expect(bonus.totalInterest).toBeLessThan(slow.totalInterest);
  });

  it('avisa si no alcanza para los mínimos o si la deuda no baja', () => {
    expect(simulatePayoff(debts, '2026-10', 50000, 'avalancha').shortfall).toBe(true);
    const stuck = simulatePayoff([{ id: 'x', name: 'Usurero', balance: 1000000, rate: 1.2, min: 0 }], '2026-10', 50000, 'avalancha');
    expect(stuck).toMatchObject({ months: null, debtFreeIn: null, stuck: true });
    expect(simulatePayoff(debts, '2026-10', 0, 'avalancha')).toMatchObject({ months: null, stuck: true });
  });

  it('con los datos de la app: sugiere el monto, compara contra solo mínimos y usa los bonos', () => {
    const db = base();
    db.debtGroups = [{ id: 'g', name: 'Crédito', icon: 'business' }];
    db.debts = [
      { id: 'd1', name: 'Tarjeta vieja', groupId: 'g', direction: 'debo', amount: 500000, date: '2026-09-01', rate: 48, minPayment: 25000, note: '', createdAt: 0 },
      { id: 'd2', name: 'Mamá', groupId: 'g', direction: 'debo', amount: 100000, date: '2026-09-01', note: '', createdAt: 0 },
      { id: 'd3', name: 'Luis me debe', groupId: 'g', direction: 'me_deben', amount: 90000, date: '2026-09-01', note: '', createdAt: 0 },
    ];
    db.transactions.push(tx({ type: 'abono_deuda', amount: 40000, date: '2026-09-15', debtId: 'd2' }));
    const result = payoffPlan(db, TODAY, { strategy: 'bola_de_nieve', useExtras: false });
    expect(result.inputs.map((d) => [d.name, d.balance, d.rate])).toEqual([['Tarjeta vieja', 500000, 0.48], ['Mamá', 60000, 0]]);
    expect(result).toMatchObject({ minimums: 25000, suggested: 500000, monthly: 500000, withoutRate: 1 }); // sobran Q5,000 al mes
    expect(result.plan.months).toBe(2);
    expect(result.minimumOnly!.months).toBeNull(); // solo el mínimo no termina: Mamá no tiene mínimo
    const tight = payoffPlan(db, TODAY, { monthly: 30000, strategy: 'avalancha', useExtras: false });
    db.extraIncomes = [{ id: 'x', name: 'Aguinaldo', amount: 400000, frequency: 'anual', date: '2026-12-15', active: true, createdAt: 0 }];
    const withBonus = payoffPlan(db, TODAY, { monthly: 30000, strategy: 'avalancha', useExtras: true });
    expect(withBonus.plan.months!).toBeLessThan(tight.plan.months!);
    expect(sanitizeDatabase(JSON.parse(JSON.stringify(db)), TODAY, 0)!.debts[0]).toMatchObject({ rate: 48, minPayment: 25000 });
  });
});

describe('reporte comparativo', () => {
  it('compara por categoría contra el mes anterior, y en el mes en curso solo hasta el mismo día', () => {
    const db = base();
    const [food, transport] = db.categories.filter((c) => c.kind === 'corriente');
    db.transactions = [
      tx({ type: 'gasto', amount: 50000, date: '2026-09-03', categoryId: food.id }),
      tx({ type: 'gasto', amount: 30000, date: '2026-09-25', categoryId: food.id }),
      tx({ type: 'gasto', amount: 20000, date: '2026-09-05', categoryId: transport.id }),
      tx({ type: 'gasto', amount: 70000, date: '2026-10-02', categoryId: food.id }),
      tx({ type: 'gasto', amount: 5000, date: '2026-10-06' }),
      tx({ type: 'ingreso', amount: 400000, date: '2026-10-01' }),
    ];
    const full = compareMonths(db, '2026-10');
    expect(full).toMatchObject({ previousKey: '2026-09', current: 75000, previous: 100000, delta: -25000, percent: -25, throughDay: null });
    const sameDay = compareMonths(db, '2026-10', 7);
    expect(sameDay).toMatchObject({ current: 75000, previous: 70000, delta: 5000, percent: 7 });
    expect(sameDay.categories.map((c) => [c.name, c.delta])).toEqual([[food.name, 20000], ['Sin categoría', 5000], [transport.name, -20000]]);
    expect(compareMonths(db, '2026-09').percent).toBeNull(); // agosto sin gastos
  });
});

describe('meta de fin de mes: se mide sobre dinero libre', () => {
  const start = (): Database => {
    const db = emptyDatabase(TODAY, 0);
    db.accounts = [{ id: 'a1', name: 'Cuenta', kind: 'banco', initialBalance: 66300, color: '#000', createdAt: 0 }];
    db.settings = { ...db.settings, payAmount: 0, payDays: [15, 31], payAccountId: 'a1', startedOn: TODAY, monthEndGoal: 10000 };
    db.fixedExpenses = [{ id: 'f1', name: 'Internet', amount: 16000, day: 20, accountId: 'a1', active: true }];
    return db;
  };

  it('Q663 con un fijo de Q160 por pagar y otro de Q150 ya pagado: con meta de Q100 se pueden gastar Q253', () => {
    const db = start();
    db.fixedExpenses.push({ id: 'f2', name: 'Luz', amount: 15000, day: 5, accountId: 'a1', active: true });
    db.transactions = [tx({ type: 'gasto', amount: 15000, date: TODAY, fixedId: 'f2' })];
    expect(monthEndOutlook(db, TODAY)).toMatchObject({ net: 51300, fixedLeft: 16000, freeIfNoMoreSpending: 35300, canSpend: 25300 });
  });

  it('lo apartado no cuenta como dinero para gastar (antes daba Q403)', () => {
    const db = start();
    db.transactions = [tx({ type: 'aporte', amount: 15000, date: TODAY, envelopeId: db.envelopes[0].id })];
    const o = monthEndOutlook(db, TODAY);
    expect(o).toMatchObject({ net: 66300, ifNoMoreSpending: 50300, inEnvelopes: 15000, freeIfNoMoreSpending: 35300, canSpend: 25300 });
    expect(overview(db, TODAY).free).toBe(51300); // el fijo del 20 aún no se reserva en Inicio (vence después del pago del 15)
  });

  it('sin apartados ni pagos pendientes todo sigue igual', () => {
    const db = start();
    const o = monthEndOutlook(db, TODAY);
    expect(o).toMatchObject({ inEnvelopes: 0, ifNoMoreSpending: 50300, freeIfNoMoreSpending: 50300, canSpend: 40300, status: 'bien' });
    db.settings.monthEndGoal = 60000;
    expect(monthEndOutlook(db, TODAY)).toMatchObject({ canSpend: -9700, status: 'alto' });
  });
});

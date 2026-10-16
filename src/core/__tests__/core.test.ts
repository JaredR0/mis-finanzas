import { describe, expect, it } from 'vitest';

import { accountBalances, debtRemaining, envelopeBalances, overview, pendingPayday, upcoming } from '../balances';
import { cardObligations, cardStatus, dueDateFor, lastCutoff, nextCutoff } from '../creditCard';
import { addDays, dayInMonth, diffDays, isValidISO, relativeDay, shiftMonthKey } from '../dates';
import { emptyDatabase } from '../defaults';
import { DEFAULT_HOME_SECTIONS, DEFAULT_TABS, HOME_SECTIONS, MAX_TABS, move, normalizeHomeSections, normalizeTabs, toggleTab } from '../layout';
import { sanitizeDatabase } from '../mutations';
import { buildSheets } from '../exportData';
import { amountToInput, formatMoney, parseAmount } from '../money';
import { describePayDays, nextPayday, payPeriod, previousPayday, QUINCENAL } from '../payCycle';
import { monthSummary, yearSummary } from '../reports';
import type { Account, CreditCard, Database, Transaction } from '../types';

let seq = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>): Transaction => ({
  id: `t${++seq}`,
  createdAt: seq,
  note: '',
  source: 'manual',
  ...t,
});

const card = (c: Partial<CreditCard> = {}): CreditCard => ({
  id: 'c1', name: 'Banrural Visa', bank: 'Banrural', cutoffDay: 5, paymentDay: 28,
  limit: 1_000_000, openingStatement: 0, openingCycle: 0, openedOn: '2026-01-01', color: '#000', createdAt: 0,
  ...c,
});

const account = (a: Partial<Account> = {}): Account => ({
  id: 'a1', name: 'Monetaria', kind: 'banco', initialBalance: 500_000, color: '#000', createdAt: 0, ...a,
});

const db = (patch: Partial<Database> = {}): Database => {
  const base = emptyDatabase('2026-10-01', 0);
  return { ...base, accounts: [account()], ...patch, settings: { ...base.settings, ...patch.settings } };
};

describe('dinero', () => {
  it('lee montos en distintos formatos', () => {
    expect(parseAmount('1,234.50')).toBe(123450);
    expect(parseAmount('Q 85')).toBe(8500);
    expect(parseAmount('1234.5')).toBe(123450);
    expect(parseAmount('1.234,50')).toBe(123450);
    expect(parseAmount('12,5')).toBe(1250);
    expect(parseAmount('1,234')).toBe(123400);
    expect(parseAmount('0.1')).toBe(10);
    expect(parseAmount('19.999')).toBe(2000);
    expect(parseAmount('125.00.')).toBe(12500);
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });

  it('no pierde centavos al sumar', () => {
    const cents = [parseAmount('0.10')!, parseAmount('0.20')!];
    expect(cents[0] + cents[1]).toBe(30);
  });

  it('da formato con signo y miles', () => {
    expect(formatMoney(123450)).toBe('Q1,234.50');
    expect(formatMoney(-5)).toBe('-Q0.05');
    expect(formatMoney(100000000)).toBe('Q1,000,000.00');
    expect(formatMoney(2500, { sign: true })).toBe('+Q25.00');
    expect(formatMoney(123450, { compact: true })).toBe('Q1,235');
    expect(amountToInput(123450)).toBe('1234.50');
    expect(amountToInput(8500)).toBe('85');
    expect(amountToInput(0)).toBe('');
  });
});

describe('fechas', () => {
  it('suma días cruzando meses y años', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-10-06', '2026-10-15')).toBe(9);
  });

  it('ajusta el día a meses cortos', () => {
    expect(dayInMonth(2026, 2, 31)).toBe('2026-02-28');
    expect(dayInMonth(2028, 2, 30)).toBe('2028-02-29');
    expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
  });

  it('valida y describe fechas', () => {
    expect(isValidISO('2026-02-30')).toBe(false);
    expect(isValidISO('2026-02-28')).toBe(true);
    expect(relativeDay('2026-10-07', '2026-10-06')).toBe('mañana');
    expect(relativeDay('2026-10-01', '2026-10-06')).toBe('hace 5 días');
  });
});

describe('quincena', () => {
  it('encuentra el pago anterior y el siguiente', () => {
    expect(nextPayday('2026-10-06', QUINCENAL)).toBe('2026-10-15');
    expect(previousPayday('2026-10-06', QUINCENAL)).toBe('2026-09-30');
    expect(nextPayday('2026-10-15', QUINCENAL)).toBe('2026-10-31');
    expect(previousPayday('2026-10-15', QUINCENAL)).toBe('2026-10-15');
    expect(nextPayday('2026-02-20', QUINCENAL)).toBe('2026-02-28');
    expect(nextPayday('2026-12-31', QUINCENAL)).toBe('2027-01-15');
  });

  it('calcula el periodo y los días que faltan', () => {
    const p = payPeriod('2026-10-06', QUINCENAL);
    expect(p).toMatchObject({ start: '2026-09-30', end: '2026-10-15', totalDays: 15, daysLeft: 9 });
    expect(p.progress).toBeCloseTo(0.4);
  });

  it('funciona con pago mensual y sin días configurados', () => {
    expect(nextPayday('2026-10-06', [30])).toBe('2026-10-30');
    expect(nextPayday('2026-10-06', [])).toBe('2026-11-01');
    expect(previousPayday('2026-10-06', [])).toBe('2026-10-01');
    expect(describePayDays(QUINCENAL)).toBe('15 y último de cada mes');
  });
});

describe('tarjetas de crédito', () => {
  it('ubica cortes y fechas límite', () => {
    const c = card({ cutoffDay: 5, paymentDay: 28 });
    expect(lastCutoff(c, '2026-10-06')).toBe('2026-10-05');
    expect(lastCutoff(c, '2026-10-05')).toBe('2026-10-05');
    expect(lastCutoff(c, '2026-10-04')).toBe('2026-09-05');
    expect(nextCutoff(c, '2026-10-05')).toBe('2026-11-05');
    expect(dueDateFor(c, '2026-10-05')).toBe('2026-10-28');
  });

  it('pasa la fecha límite al mes siguiente cuando el pago cae antes del corte', () => {
    const c = card({ cutoffDay: 20, paymentDay: 15 });
    expect(dueDateFor(c, '2026-10-20')).toBe('2026-11-15');
    expect(dueDateFor(c, '2026-12-20')).toBe('2027-01-15');
    // Pago apenas 3 días después del corte: corresponde al mes siguiente.
    expect(dueDateFor(card({ cutoffDay: 28, paymentDay: 31 }), '2026-01-28')).toBe('2026-02-28');
  });

  it('separa lo que ya cortó de lo que va en el ciclo actual', () => {
    const c = card({ cutoffDay: 5, paymentDay: 28 });
    const txs = [
      tx({ type: 'gasto', amount: 30000, date: '2026-09-20', cardId: 'c1' }),
      tx({ type: 'gasto', amount: 20000, date: '2026-10-05', cardId: 'c1' }), // entra en el corte del 5
      tx({ type: 'gasto', amount: 10000, date: '2026-10-06', cardId: 'c1' }), // ciclo nuevo
      tx({ type: 'gasto', amount: 99999, date: '2026-10-06', cardId: 'otra' }),
    ];
    const s = cardStatus(c, txs, '2026-10-06');
    expect(s.pending).toBe(50000);
    expect(s.cycleSpend).toBe(10000);
    expect(s.debt).toBe(60000);
    expect(s.lastDue).toBe('2026-10-28');
    expect(s.overdue).toBe(false);
    expect(s.available).toBe(940000);
  });

  it('descuenta los pagos del estado de cuenta más antiguo', () => {
    const c = card();
    const txs = [
      tx({ type: 'gasto', amount: 50000, date: '2026-10-01', cardId: 'c1' }),
      tx({ type: 'gasto', amount: 10000, date: '2026-10-06', cardId: 'c1' }),
      tx({ type: 'pago_tarjeta', amount: 30000, date: '2026-10-10', cardId: 'c1', accountId: 'a1' }),
    ];
    const partial = cardStatus(c, txs, '2026-10-10');
    expect(partial.pending).toBe(20000);
    expect(partial.debt).toBe(30000);

    const paid = cardStatus(
      c,
      [...txs, tx({ type: 'pago_tarjeta', amount: 25000, date: '2026-10-11', cardId: 'c1', accountId: 'a1' })],
      '2026-10-11',
    );
    expect(paid.pending).toBe(0);
    expect(paid.debt).toBe(5000);
  });

  it('marca vencido cuando pasó la fecha límite', () => {
    const c = card();
    const txs = [tx({ type: 'gasto', amount: 50000, date: '2026-10-01', cardId: 'c1' })];
    expect(cardStatus(c, txs, '2026-10-28').overdue).toBe(false);
    expect(cardStatus(c, txs, '2026-10-29').overdue).toBe(true);
  });

  it('respeta el saldo inicial al registrar la tarjeta', () => {
    const c = card({ openingStatement: 200000, openingCycle: 30000, openedOn: '2026-10-06' });
    const s = cardStatus(c, [], '2026-10-06');
    expect(s.pending).toBe(200000);
    expect(s.cycleSpend).toBe(30000);
    expect(s.debt).toBe(230000);
    // Después del siguiente corte, el ciclo inicial ya forma parte del estado de cuenta.
    expect(cardStatus(c, [], '2026-11-06').pending).toBe(230000);
  });

  it('lista el pago firme y el estimado del ciclo que se está formando', () => {
    const c = card();
    const txs = [
      tx({ type: 'gasto', amount: 50000, date: '2026-10-01', cardId: 'c1' }),
      tx({ type: 'gasto', amount: 10000, date: '2026-10-06', cardId: 'c1' }),
    ];
    expect(cardObligations(c, txs, '2026-10-06')).toEqual([
      { cardId: 'c1', due: '2026-10-28', amount: 50000, estimate: false, cutoff: '2026-10-05' },
      { cardId: 'c1', due: '2026-11-28', amount: 10000, estimate: true, cutoff: '2026-11-05' },
    ]);
  });
});

describe('saldos', () => {
  it('calcula el saldo de cada cuenta con todos los tipos de movimiento', () => {
    const d = db({
      accounts: [account(), account({ id: 'a2', name: 'Efectivo', kind: 'efectivo', initialBalance: 10000 })],
      debts: [
        { id: 'd1', name: 'Préstamo', groupId: 'g', direction: 'debo', amount: 100000, date: '2026-10-01', note: '', createdAt: 0 },
        { id: 'd2', name: 'Luis', groupId: 'g', direction: 'me_deben', amount: 20000, date: '2026-10-01', note: '', createdAt: 0 },
      ],
      transactions: [
        tx({ type: 'ingreso', amount: 300000, date: '2026-10-01', accountId: 'a1' }),
        tx({ type: 'gasto', amount: 25000, date: '2026-10-02', accountId: 'a1' }),
        tx({ type: 'gasto', amount: 40000, date: '2026-10-02', cardId: 'c1' }), // con tarjeta: no toca la cuenta
        tx({ type: 'pago_tarjeta', amount: 40000, date: '2026-10-03', accountId: 'a1', cardId: 'c1' }),
        tx({ type: 'transferencia', amount: 50000, date: '2026-10-03', accountId: 'a1', toAccountId: 'a2' }),
        tx({ type: 'aporte', amount: 100000, date: '2026-10-03', envelopeId: 'e1' }), // no mueve la cuenta
        tx({ type: 'abono_deuda', amount: 30000, date: '2026-10-04', accountId: 'a1', debtId: 'd1' }),
        tx({ type: 'abono_deuda', amount: 5000, date: '2026-10-04', accountId: 'a2', debtId: 'd2' }),
        tx({ type: 'prestamo', amount: 20000, date: '2026-10-01', accountId: 'a1', debtId: 'd2' }),
      ],
    });
    const b = accountBalances(d);
    expect(b.a1).toBe(500000 + 300000 - 25000 - 40000 - 50000 - 30000 - 20000);
    expect(b.a2).toBe(10000 + 50000 + 5000);
    expect(debtRemaining(d.debts[0], d.transactions)).toBe(70000);
    expect(debtRemaining(d.debts[1], d.transactions)).toBe(15000);
  });

  it('lleva el saldo de los apartados', () => {
    const d = db({
      envelopes: [{ id: 'e1', name: 'Doctores', kind: 'guardadito', icon: 'medkit', color: '#000', target: 0, createdAt: 0 }],
      transactions: [
        tx({ type: 'aporte', amount: 100000, date: '2026-10-01', envelopeId: 'e1' }),
        tx({ type: 'gasto', amount: 35000, date: '2026-10-02', accountId: 'a1', envelopeId: 'e1' }),
        tx({ type: 'retiro', amount: 15000, date: '2026-10-03', envelopeId: 'e1' }),
      ],
    });
    expect(envelopeBalances(d).e1).toBe(50000);
    expect(accountBalances(d).a1).toBe(500000 - 35000);
  });
});

describe('libre para gastar', () => {
  // Hoy 6 de octubre; próxima quincena el 15.
  const today = '2026-10-06';
  const scenario = () =>
    db({
      cards: [
        card({ id: 'c1', name: 'Banrural', cutoffDay: 20, paymentDay: 12 }), // vence 12 oct: antes del pago
        card({ id: 'c2', name: 'Promerica', bank: 'Promerica', cutoffDay: 28, paymentDay: 20 }), // vence 20 oct: después
      ],
      envelopes: [{ id: 'e1', name: 'Ahorro', kind: 'ahorro', icon: 'wallet', color: '#000', target: 0, createdAt: 0 }],
      fixedExpenses: [
        { id: 'f1', name: 'Internet', amount: 30000, day: 10, accountId: 'a1', active: true },
        { id: 'f2', name: 'Netflix', amount: 9000, day: 8, cardId: 'c1', active: true }, // a tarjeta: no cuenta
        { id: 'f3', name: 'Renta', amount: 150000, day: 25, accountId: 'a1', active: true }, // después del pago
        { id: 'f4', name: 'Gimnasio', amount: 20000, day: 9, accountId: 'a1', active: false },
      ],
      transactions: [
        tx({ type: 'gasto', amount: 80000, date: '2026-09-15', cardId: 'c1' }),
        tx({ type: 'gasto', amount: 60000, date: '2026-09-20', cardId: 'c2' }),
        tx({ type: 'aporte', amount: 100000, date: '2026-10-01', envelopeId: 'e1' }),
      ],
    });

  it('resta apartados y solo lo que vence antes del próximo pago', () => {
    const o = overview(scenario(), today);
    expect(o.inAccounts).toBe(500000);
    expect(o.inEnvelopes).toBe(100000);
    expect(o.cardsDue).toBe(80000);
    expect(o.fixedDue).toBe(30000);
    expect(o.free).toBe(500000 - 100000 - 80000 - 30000);
    expect(o.perDay).toBe(Math.floor(290000 / 9));
    expect(o.cardDebt).toBe(140000);
  });

  it('deja de reservar un gasto fijo cuando ya se pagó este mes', () => {
    const d = scenario();
    d.transactions.push(tx({ type: 'gasto', amount: 30000, date: '2026-10-06', accountId: 'a1', fixedId: 'f1' }));
    const o = overview(d, today);
    expect(o.fixedDue).toBe(0);
    expect(o.free).toBe(470000 - 100000 - 80000);
  });

  it('ordena lo próximo por fecha y marca qué cae antes del pago', () => {
    const list = upcoming(scenario(), today, 20);
    expect(list.map((i) => [i.title, i.date, i.beforePayday])).toEqual([
      ['Netflix', '2026-10-08', true],
      ['Internet', '2026-10-10', true],
      ['Pago Banrural', '2026-10-12', true],
      ['Pago Promerica', '2026-10-20', false],
      ['Renta', '2026-10-25', false],
    ]);
  });

  it('queda en rojo cuando no alcanza', () => {
    const d = scenario();
    d.accounts = [account({ initialBalance: 150000 })];
    const o = overview(d, today);
    expect(o.free).toBe(-60000);
    expect(o.perDay).toBe(0);
  });

  it('avisa de la quincena sin registrar una sola vez', () => {
    const d = db({ settings: { payAmount: 400000, startedOn: '2026-09-01' } as Database['settings'] });
    expect(pendingPayday(d, '2026-10-15')).toBe('2026-10-15');
    expect(pendingPayday(d, '2026-10-17')).toBe('2026-10-15');
    d.transactions.push(tx({ type: 'ingreso', amount: 400000, date: '2026-10-16', accountId: 'a1', payDate: '2026-10-15' }));
    expect(pendingPayday(d, '2026-10-17')).toBeNull();
    d.settings.skippedPaydays = ['2026-10-31'];
    expect(pendingPayday(d, '2026-11-02')).toBeNull();
    // No pregunta por pagos anteriores a empezar a usar la app.
    expect(pendingPayday(db({ settings: { payAmount: 1, startedOn: '2026-10-06' } as Database['settings'] }), '2026-10-06')).toBeNull();
  });
});

describe('reportes', () => {
  it('resume el mes y el año', () => {
    const d = db();
    const food = d.categories.find((c) => c.key === 'comida')!;
    const rent = d.categories.find((c) => c.key === 'vivienda')!;
    food.monthlyBudget = 100000;
    d.transactions = [
      tx({ type: 'ingreso', amount: 800000, date: '2026-10-15', accountId: 'a1' }),
      tx({ type: 'gasto', amount: 45000, date: '2026-10-02', accountId: 'a1', categoryId: food.id }),
      tx({ type: 'gasto', amount: 150000, date: '2026-10-03', cardId: 'c1', categoryId: rent.id }),
      tx({ type: 'gasto', amount: 5000, date: '2026-10-03', accountId: 'a1' }),
      tx({ type: 'aporte', amount: 100000, date: '2026-10-04', envelopeId: 'e' }),
      tx({ type: 'retiro', amount: 20000, date: '2026-10-05', envelopeId: 'e' }),
      tx({ type: 'pago_tarjeta', amount: 150000, date: '2026-10-28', accountId: 'a1', cardId: 'c1' }),
      tx({ type: 'gasto', amount: 70000, date: '2026-09-30', accountId: 'a1', categoryId: food.id }),
    ];
    const s = monthSummary(d, '2026-10');
    expect(s).toMatchObject({ income: 800000, expense: 200000, balance: 600000, fixed: 150000, current: 50000, saved: 80000, cardPaid: 150000 });
    expect(s.byCategory.map((c) => [c.name, c.amount, c.budget])).toEqual([
      ['Vivienda', 150000, 0],
      ['Comida', 45000, 100000],
      ['Sin categoría', 5000, 0],
    ]);
    const y = yearSummary(d, 2026);
    expect(y.months).toHaveLength(12);
    expect(y.expense).toBe(270000);
    expect(y.balance).toBe(530000);
  });

  it('arma el Excel con un libro por mes, con fecha y día', () => {
    const d = db({ cards: [card()] });
    d.transactions = [
      tx({ type: 'gasto', amount: 12345, date: '2026-10-02', cardId: 'c1', note: 'Café' }),
      tx({ type: 'ingreso', amount: 400000, date: '2026-10-15', accountId: 'a1', note: 'Quincena', payDate: '2026-10-15' }),
      tx({ type: 'ingreso', amount: 50000, date: '2026-10-20', accountId: 'a1', note: 'Venta' }),
      tx({ type: 'aporte', amount: 10000, date: '2026-10-21', envelopeId: 'e' }),
      tx({ type: 'gasto', amount: 2000, date: '2026-09-30', accountId: 'a1', note: 'Pan' }),
    ];
    const sheets = buildSheets(d, '2026-10-06');
    expect(sheets.map((s) => s.name)).toEqual([
      'Resumen 2026', '2026-09 Septiembre', '2026-10 Octubre', 'Categorías 2026', 'Todo', 'Cuentas', 'Tarjetas', 'Apartados', 'Deudas',
    ]);
    const summary = sheets[0].rows;
    expect(summary[0]).toEqual(['Mes', 'Ingresos', 'De ellos, extra', 'Gastos', 'Balance', 'Ahorro', 'Gastos fijos', 'Gastos corrientes']);
    expect(summary[10]).toEqual(['Octubre', 4500, 500, 123.45, 4376.55, 100, 0, 123.45]);
    expect(summary[13][0]).toBe('TOTAL');
    const october = sheets[2].rows;
    expect(october[0]).toEqual(['Fecha', 'Día', 'Tipo', 'Descripción', 'Categoría', 'Pagado con', 'Gasto', 'Ingreso', 'Otros movimientos']);
    expect(october[1]).toEqual(['2026-10-02', 'Viernes', 'Gasto', 'Café', '', 'Banrural Visa', 123.45, '', '']);
    expect(october[2]).toEqual(['2026-10-15', 'Jueves', 'Ingreso', 'Quincena', '', 'Monetaria', '', 4000, '']);
    expect(october[4].slice(6)).toEqual(['', '', 100]);
    expect(october[5]).toEqual(['TOTAL', '', '', '', '', '', 123.45, 4500, 100]);
    expect(october[6][7]).toBe(4376.55);
    expect(sheets[1].rows).toHaveLength(4); // encabezado + 1 movimiento + total + balance
    expect(sheets[4].rows[1].slice(0, 3)).toEqual(['2026-09-30', 'Miércoles', 'Gasto']);
  });

  it('puede exportar un solo año', () => {
    const d = db();
    d.transactions = [
      tx({ type: 'gasto', amount: 100, date: '2025-12-31', accountId: 'a1' }),
      tx({ type: 'gasto', amount: 200, date: '2026-01-01', accountId: 'a1' }),
    ];
    expect(buildSheets(d, '2026-10-06').map((s) => s.name)).toEqual(expect.arrayContaining(['Resumen 2026', 'Resumen 2025', '2025-12 Diciembre', '2026-01 Enero']));
    const only = buildSheets(d, '2026-10-06', 2025);
    expect(only.map((s) => s.name).filter((n) => n.startsWith('20') || n.startsWith('Resumen'))).toEqual(['Resumen 2025', '2025-12 Diciembre']);
    expect(only.find((s) => s.name === 'Todo')!.rows).toHaveLength(2);
  });
});

describe('sin números de tarjeta', () => {
  it('los datos antiguos pierden los dígitos al cargarse', () => {
    const old = { accounts: [], transactions: [], cards: [{ ...card(), last4: '1234' }] };
    const clean = sanitizeDatabase(old, '2026-10-06', 1)!;
    expect(clean.cards[0]).not.toHaveProperty('last4');
    expect(clean.cards[0].name).toBe('Banrural Visa');
  });
});

describe('apariencia y pestañas', () => {
  it('siempre deja Inicio y Más, sin repetidas y sin pasarse del máximo', () => {
    expect(normalizeTabs(undefined)).toEqual(DEFAULT_TABS);
    expect(normalizeTabs([])).toEqual(DEFAULT_TABS);
    expect(normalizeTabs(['deudas', 'deudas', 'inventada', 7])).toEqual(['index', 'deudas', 'mas']);
    expect(normalizeTabs(['mas', 'reportes', 'index'])).toEqual(['mas', 'reportes', 'index']);
    const tooMany = normalizeTabs(['gastos', 'tarjetas', 'apartados', 'deudas', 'fijos', 'reportes']);
    expect(tooMany).toHaveLength(MAX_TABS);
    expect(tooMany).toEqual(['index', 'gastos', 'tarjetas', 'apartados', 'mas']);
  });

  it('activa, desactiva y reordena pestañas', () => {
    expect(toggleTab(DEFAULT_TABS, 'index')).toBeNull();
    expect(toggleTab(DEFAULT_TABS, 'mas')).toBeNull();
    expect(toggleTab(DEFAULT_TABS, 'deudas')).toBeNull(); // ya hay 5
    const fewer = toggleTab(DEFAULT_TABS, 'gastos')!;
    expect(fewer).toEqual(['index', 'tarjetas', 'apartados', 'mas']);
    expect(toggleTab(fewer, 'deudas')).toEqual(['index', 'tarjetas', 'apartados', 'deudas', 'mas']);
    expect(move(fewer, 1, 1)).toEqual(['index', 'apartados', 'tarjetas', 'mas']);
    expect(move(fewer, 0, -1)).toBe(fewer);
    expect(move(fewer, 3, 1)).toBe(fewer);
  });

  it('las secciones de inicio aceptan cualquier orden y también quedar vacías', () => {
    expect(normalizeHomeSections(undefined)).toEqual(DEFAULT_HOME_SECTIONS);
    expect(normalizeHomeSections([])).toEqual([]);
    expect(normalizeHomeSections(['movimientos', 'x', 'calculo', 'calculo'])).toEqual(['movimientos', 'calculo']);
    expect(HOME_SECTIONS.map((s) => s.key)).toEqual(expect.arrayContaining(DEFAULT_HOME_SECTIONS));
  });

  it('los ajustes nuevos siempre quedan válidos y lo automático viene apagado', () => {
    const fresh = emptyDatabase('2026-10-06', 0).settings;
    expect(fresh).not.toHaveProperty('captureEnabled');
    expect(fresh).toMatchObject({ theme: 'sistema', accent: '#4F46E5', tabs: DEFAULT_TABS });
    const odd = sanitizeDatabase({ accounts: [], transactions: [], settings: { theme: 'neón', accent: 'rojo', tabs: 'x', captureEnabled: 1 } }, '2026-10-06', 1)!;
    expect(odd.settings).toMatchObject({ theme: 'sistema', accent: '#4F46E5', tabs: DEFAULT_TABS, homeSections: DEFAULT_HOME_SECTIONS });
    expect(odd.settings).not.toHaveProperty('captureEnabled');
  });
});

import { describe, expect, it } from 'vitest';

import { overview, upcoming } from '../balances';
import { calendarMonth, monthAhead } from '../calendar';
import { emptyDatabase } from '../defaults';
import { buildSheets } from '../exportData';
import { baseline, forecast, monthEndOutlook } from '../forecast';
import { removeEntity, sanitizeDatabase } from '../mutations';
import { plannedDateIn, plannedDueIn, plannedIn, plannedOccurrences, plannedPendingIn } from '../planned';
import type { Database, ExtraIncome, PlannedExpense, Transaction } from '../types';

let seq = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>): Transaction => ({
  id: `c${++seq}`, createdAt: seq, note: '', source: 'manual', accountId: 'a1', ...t,
});
const planned = (p: Partial<PlannedExpense> & Pick<PlannedExpense, 'id' | 'amount' | 'date'>): PlannedExpense => ({
  name: p.id, frequency: 'unica', active: true, createdAt: 0, accountId: 'a1', ...p,
});
const extra = (x: Partial<ExtraIncome> & Pick<ExtraIncome, 'id' | 'amount' | 'date'>): ExtraIncome => ({
  name: x.id, frequency: 'unica', active: true, createdAt: 0, ...x,
});
/** Q10,000 en cuenta, Q4,000 por quincena, usando la app desde julio con Q3,000 de gasto al mes. */
const base = (): Database => {
  const db = emptyDatabase('2026-07-01', 0);
  db.accounts = [{ id: 'a1', name: 'Monetaria', kind: 'banco', initialBalance: 1000000, color: '#000', createdAt: 0 }];
  db.cards = [{ id: 'c1', name: 'Visa', bank: 'Banrural', cutoffDay: 20, paymentDay: 12, limit: 0, openingStatement: 0, openingCycle: 0, openedOn: '2026-07-01', color: '#000', createdAt: 0 }];
  db.settings = { ...db.settings, payAmount: 400000, payDays: [15, 31], payAccountId: 'a1', startedOn: '2026-07-01' };
  db.transactions = ['2026-07-10', '2026-08-10', '2026-09-10'].map((date) => tx({ type: 'gasto', amount: 300000, date }));
  return db;
};
const TODAY = '2026-10-07';

describe('gastos planeados', () => {
  it('caen en su mes: una vez, o cada año en el mismo mes', () => {
    const once = planned({ id: 'viaje', amount: 250000, date: '2026-12-20' });
    const yearly = planned({ id: 'seguro', amount: 180000, date: '2026-03-31', frequency: 'anual' });
    expect([plannedDueIn(once, '2026-11'), plannedDueIn(once, '2026-12'), plannedDueIn(once, '2027-12')]).toEqual([false, true, false]);
    expect([plannedDueIn(yearly, '2026-03'), plannedDueIn(yearly, '2027-03'), plannedDueIn(yearly, '2027-04'), plannedDueIn(yearly, '2025-03')]).toEqual([true, true, false, false]);
    expect(plannedDueIn({ ...once, active: false }, '2026-12')).toBe(false);
    expect(plannedDateIn(planned({ id: 'x', amount: 1, date: '2026-01-31', frequency: 'anual' }), '2027-02')).toBe('2027-02-28');
  });

  it('se apartan de lo libre cuando caen antes del próximo pago, y dejan de contarse al pagarlos', () => {
    const db = base();
    const before = overview(db, TODAY);
    db.plannedExpenses = [planned({ id: 'matricula', amount: 150000, date: '2026-10-12' }), planned({ id: 'viaje', amount: 250000, date: '2026-12-20' })];
    const after = overview(db, TODAY);
    expect(after.plannedDue).toBe(150000); // el de diciembre aún no
    expect(after.free).toBe(before.free - 150000);
    expect(upcoming(db, TODAY).find((i) => i.kind === 'planeado')).toMatchObject({ title: 'matricula', date: '2026-10-12', beforePayday: true });

    db.transactions.push(tx({ type: 'gasto', amount: 150000, date: TODAY, plannedId: 'matricula', plannedPeriod: '2026-10' }));
    const paid = overview(db, TODAY);
    expect(paid.plannedDue).toBe(0);
    expect(paid.free).toBe(before.free - 150000); // ya salió de la cuenta: no se descuenta dos veces
    expect(plannedPendingIn(db, '2026-10')).toBe(0);
    expect(plannedIn(db, '2026-10')).toBe(150000);
  });

  it('con tarjeta no se aparta de las cuentas; uno vencido del mes pasado sigue avisando', () => {
    const db = base();
    db.plannedExpenses = [planned({ id: 'regalo', amount: 50000, date: '2026-10-10', accountId: undefined, cardId: 'c1' }), planned({ id: 'olvidado', amount: 20000, date: '2026-09-25' })];
    const o = overview(db, TODAY);
    expect(o.plannedDue).toBe(20000);
    expect(upcoming(db, TODAY).find((i) => i.refId === 'olvidado')).toMatchObject({ overdue: true });
    expect(upcoming(db, TODAY).find((i) => i.refId === 'regalo')).toMatchObject({ fromAccounts: false });
  });

  it('bajan la proyección del mes en que caen y no inflan el gasto del día a día', () => {
    const db = base();
    const plain = forecast(db, TODAY, 3);
    const variableBefore = baseline(db, TODAY).variable;
    db.plannedExpenses = [planned({ id: 'viaje', amount: 250000, date: '2026-12-20' })];
    const months = forecast(db, TODAY, 3);
    expect(months.map((m) => m.planned)).toEqual([0, 250000, 0]);
    expect(months[1].saving).toBe(plain[1].saving - 250000);
    expect(months[2].balance).toBe(plain[2].balance - 250000);

    // Un gasto planeado pagado este mes baja el cierre, pero no cuenta como "día a día".
    db.plannedExpenses.push(planned({ id: 'matricula', amount: 150000, date: '2026-10-20' }));
    expect(monthEndOutlook(db, TODAY).plannedLeft).toBe(150000);
    db.transactions.push(tx({ type: 'gasto', amount: 150000, date: '2026-10-05', plannedId: 'matricula', plannedPeriod: '2026-10' }));
    expect(monthEndOutlook(db, TODAY).plannedLeft).toBe(0);
    expect(baseline(db, TODAY).variable).toBe(variableBefore);
  });

  it('al borrar el gasto planeado, el pago ya hecho se conserva como gasto normal', () => {
    const db = base();
    db.plannedExpenses = [planned({ id: 'matricula', amount: 150000, date: '2026-10-12', categoryId: db.categories[0].id })];
    db.transactions.push(tx({ type: 'gasto', amount: 150000, date: TODAY, plannedId: 'matricula', plannedPeriod: '2026-10' }));
    const next = removeEntity(db, 'plannedExpenses', 'matricula');
    expect(next.plannedExpenses).toEqual([]);
    expect(next.transactions.at(-1)).toMatchObject({ amount: 150000, plannedId: undefined, plannedPeriod: undefined });
    expect(removeEntity(db, 'accounts', 'a1').plannedExpenses[0].accountId).toBeUndefined();
    expect(removeEntity(db, 'categories', db.categories[0].id).plannedExpenses[0].categoryId).toBeUndefined();
  });

  it('un respaldo antiguo (sin gastos planeados) se abre, y los inválidos se descartan', () => {
    const db = base();
    const old = JSON.parse(JSON.stringify(db)) as Record<string, unknown>;
    delete old.plannedExpenses;
    expect(sanitizeDatabase(old, TODAY, 0)!.plannedExpenses).toEqual([]);
    const dirty = { ...db, plannedExpenses: [planned({ id: 'ok', amount: 100, date: '2026-12-01' }), { id: 'mal', amount: -5, date: 'ayer', frequency: 'unica' }] };
    expect(sanitizeDatabase(dirty, TODAY, 0)!.plannedExpenses.map((p) => p.id)).toEqual(['ok']);
  });

  it('salen en el Excel', () => {
    const db = base();
    db.plannedExpenses = [planned({ id: 'Viaje', amount: 250000, date: '2026-12-20' })];
    const sheet = buildSheets(db, TODAY).find((s) => s.name === 'Gastos planeados')!;
    expect(sheet.rows[1]).toEqual(['Viaje', 2500, 'Una vez', '2026-12-20', '', 'Monetaria', 'Sí']);
  });
});

describe('calendario', () => {
  const withPlans = (): Database => {
    const db = base();
    db.extraIncomes = [extra({ id: 'Aguinaldo', amount: 800000, date: '2026-12-15', frequency: 'anual' })];
    db.plannedExpenses = [planned({ id: 'Viaje', amount: 250000, date: '2026-12-20' })];
    db.fixedExpenses = [{ id: 'f1', name: 'Internet', amount: 30000, day: 5, accountId: 'a1', active: true }];
    return db;
  };

  it('arma el mes: casillas, días de pago, extras, fijos y planeados en su día', () => {
    const cal = calendarMonth(withPlans(), '2026-12', TODAY);
    expect(cal.days).toHaveLength(31);
    expect(cal.leading).toBe(2); // el 1 de diciembre de 2026 es martes (la semana empieza en domingo)
    const on = (day: number) => cal.days[day - 1].events.map((e) => `${e.kind}:${e.title}:${e.flow}`);
    expect(on(5)).toEqual(['fijo:Internet:out']);
    expect(on(15)).toEqual(['extra:Aguinaldo:in', 'sueldo:Día de pago:in']); // primero lo que entra, de mayor a menor
    expect(on(20)).toEqual(['planeado:Viaje:out']);
    expect(on(31)).toEqual(['sueldo:Día de pago:in']);
    expect(cal.toCome).toBe(400000 * 2 + 800000);
    expect(cal.toGo).toBe(30000 + 250000);
  });

  it('marca lo ya hecho y no lo cuenta como pendiente; suma lo gastado cada día', () => {
    const db = withPlans();
    db.plannedExpenses.push(planned({ id: 'Matrícula', amount: 150000, date: '2026-10-12' }));
    db.transactions.push(
      tx({ type: 'gasto', amount: 30000, date: '2026-10-05', fixedId: 'f1' }),
      tx({ type: 'gasto', amount: 150000, date: '2026-10-06', plannedId: 'Matrícula', plannedPeriod: '2026-10' }),
      tx({ type: 'gasto', amount: 4500, date: '2026-10-06' }),
      tx({ type: 'ingreso', amount: 400000, date: '2026-09-30', payDate: '2026-09-30' }),
    );
    const cal = calendarMonth(db, '2026-10', TODAY);
    expect(cal.days[4].events[0]).toMatchObject({ kind: 'fijo', done: true });
    expect(cal.days[11].events[0]).toMatchObject({ kind: 'planeado', done: true });
    expect(cal.days[5]).toMatchObject({ spent: 154500, earned: 0 });
    expect(cal.toGo).toBe(0);
    expect(cal.toCome).toBe(800000); // las dos quincenas de octubre
    expect(calendarMonth(db, '2026-09', TODAY).days[29].events[0]).toMatchObject({ kind: 'sueldo', done: true });
  });

  it('incluye pagos de tarjeta, deudas con fecha y aportes de metas de ahorro', () => {
    const db = base();
    db.transactions.push(tx({ type: 'gasto', amount: 50000, date: '2026-10-02', accountId: undefined, cardId: 'c1' }));
    db.debtGroups = [{ id: 'g', name: 'Personas', icon: 'people' }];
    db.debts = [
      { id: 'd1', name: 'Mamá', groupId: 'g', direction: 'debo', amount: 100000, date: '2026-09-01', dueDate: '2026-11-20', note: '', createdAt: 0 },
      { id: 'd2', name: 'Luis', groupId: 'g', direction: 'me_deben', amount: 60000, date: '2026-09-01', dueDate: '2026-11-25', note: '', createdAt: 0 },
    ];
    db.envelopes = [{ id: 'e1', name: 'Viaje', kind: 'ahorro', icon: 'airplane', color: '#000', target: 250000, createdAt: 0, plan: { startDate: '2026-10-05', targetDate: '2026-11-30', step: { unit: 'semana', every: 1 }, amount: 100000, baseBalance: 0 } }];
    const nov = calendarMonth(db, '2026-11', TODAY);
    const all = nov.days.flatMap((d) => d.events);
    expect(all.find((e) => e.kind === 'tarjeta')).toMatchObject({ date: '2026-11-12', amount: 50000, estimate: true, flow: 'out' });
    expect(all.find((e) => e.refId === 'd1')).toMatchObject({ date: '2026-11-20', flow: 'out', amount: 100000 });
    expect(all.find((e) => e.refId === 'd2')).toMatchObject({ title: 'Te paga: Luis', flow: 'in' });
    // Faltan Q2,500: aportes del 12, 19 y 26 de octubre (1,000 + 1,000 + 500) y ninguno en noviembre.
    const oct = calendarMonth(db, '2026-10', TODAY).days.flatMap((d) => d.events).filter((e) => e.kind === 'ahorro');
    expect(oct.map((e) => [e.date, e.amount])).toEqual([['2026-10-12', 100000], ['2026-10-19', 100000], ['2026-10-26', 50000]]);
    expect(all.some((e) => e.kind === 'ahorro')).toBe(false);
    expect(nov.toGo).toBe(150000); // el ahorro no cuenta como salida
  });

  it('no inventa días de pago antes de empezar ni los que se descartaron', () => {
    const db = base();
    db.settings.skippedPaydays = ['2026-10-15'];
    expect(calendarMonth(db, '2026-06', TODAY).days.flatMap((d) => d.events)).toEqual([]);
    expect(calendarMonth(db, '2026-10', TODAY).days.flatMap((d) => d.events).map((e) => e.date)).toEqual(['2026-10-31']);
  });

  it('balance a futuro: el mes del aguinaldo sobra más y el saldo acumulado lo refleja', () => {
    const db = withPlans();
    const nov = monthAhead(db, TODAY, '2026-11')!;
    const dec = monthAhead(db, TODAY, '2026-12')!;
    expect(nov).toMatchObject({ extra: 0, planned: 0, saving: 800000 - 30000 - 300000 });
    expect(dec).toMatchObject({ extra: 800000, planned: 250000, saving: nov.saving + 800000 - 250000 });
    expect(dec.balance).toBe(nov.balance + dec.saving);
    expect(monthAhead(db, TODAY, '2027-12')!.extra).toBe(800000); // el aguinaldo se repite cada año
    expect(monthAhead(db, TODAY, '2026-10')).toBeNull(); // el mes actual usa la meta de fin de mes
    expect(monthAhead(db, TODAY, '2026-08')).toBeNull();
    expect(monthAhead(db, TODAY, '2031-01')).toBeNull();
  });

  it('lista lo que viene en orden', () => {
    const db = withPlans();
    db.plannedExpenses.push(planned({ id: 'Seguro', amount: 180000, date: '2026-11-03', frequency: 'anual' }));
    expect(plannedOccurrences(db, '2026-10', 14).map((o) => `${o.planned.id} ${o.date}`)).toEqual(['Seguro 2026-11-03', 'Viaje 2026-12-20', 'Seguro 2027-11-03']);
  });
});

describe('formas de pago y primer pago', () => {
  it('reconoce pago diario, quincenal, mensual u otros días', async () => {
    const { DIARIO, MENSUAL, QUINCENAL, payFrequency, describePayDays, payPeriod, previousPayday } = await import('../payCycle');
    expect([payFrequency(DIARIO), payFrequency(QUINCENAL), payFrequency([31, 15]), payFrequency(MENSUAL), payFrequency([5, 20])]).toEqual(['diario', 'quincenal', 'quincenal', 'mensual', 'otro']);
    expect(describePayDays(DIARIO)).toBe('Todos los días');
    // Pago diario: hoy es día de pago y el siguiente es mañana, también a fin de mes y en febrero.
    expect(previousPayday('2026-10-07', DIARIO)).toBe('2026-10-07');
    expect(payPeriod('2026-10-07', DIARIO)).toMatchObject({ start: '2026-10-07', end: '2026-10-08', daysLeft: 1 });
    expect(payPeriod('2026-10-31', DIARIO).end).toBe('2026-11-01');
    expect(payPeriod('2027-02-28', DIARIO).end).toBe('2027-03-01');
  });

  it('si al empezar aún no había caído el pago, Inicio lo pregunta hasta registrarlo o descartarlo', async () => {
    const { pendingPayday } = await import('../balances');
    const db = base();
    db.settings = { ...db.settings, startedOn: TODAY };
    expect(pendingPayday(db, TODAY)).toBeNull(); // el del 30 sep es anterior a empezar: se da por recibido
    db.settings.pendingFirstPay = '2026-09-30';
    expect(pendingPayday(db, TODAY)).toBe('2026-09-30');
    expect(monthEndOutlook(db, TODAY).incomeLeft).toBe(400000 * 3); // ese pago + las dos quincenas de octubre
    const received: Database = { ...db, transactions: [...db.transactions, tx({ type: 'ingreso', amount: 400000, date: TODAY, payDate: '2026-09-30' })] };
    expect(pendingPayday(received, TODAY)).toBeNull();
    expect(pendingPayday({ ...db, settings: { ...db.settings, skippedPaydays: ['2026-09-30'] } }, TODAY)).toBeNull();
    // Pasado el siguiente día de pago, primero pregunta por el atrasado y luego por el nuevo.
    expect(pendingPayday(db, '2026-10-16')).toBe('2026-09-30');
    expect(pendingPayday(received, '2026-10-16')).toBe('2026-10-15');
    expect(sanitizeDatabase({ ...db, settings: { ...db.settings, pendingFirstPay: 'ayer' } }, TODAY, 0)!.settings.pendingFirstPay).toBeUndefined();
  });

  it('si ya te pagaron hoy y lo dijiste al empezar, no lo vuelve a preguntar', async () => {
    const { pendingPayday } = await import('../balances');
    const db = base();
    db.settings = { ...db.settings, startedOn: '2026-10-15' };
    expect(pendingPayday(db, '2026-10-15')).toBe('2026-10-15');
    db.settings.skippedPaydays = ['2026-10-15'];
    expect(pendingPayday(db, '2026-10-15')).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';

import { autoFixedDrafts, fixedPaymentDraft } from '../autoFixed';
import { overview, upcoming } from '../balances';
import { calendarMonth } from '../calendar';
import { emptyDatabase } from '../defaults';
import {
  anchorForWeekday,
  describeFixedSchedule,
  fixedCostIn,
  fixedMonthlyAverage,
  fixedOccurrences,
  fixedOccurrencesInMonth,
  fixedPaymentFor,
  nextFixedDue,
} from '../fixed';
import { fixedIn } from '../forecast';
import { sanitizeDatabase } from '../mutations';
import type { Database, FixedExpense, Transaction } from '../types';

// Octubre 2026: el 1 es jueves; los lunes son 5, 12, 19 y 26.
const gas = (f: Partial<FixedExpense> = {}): FixedExpense => ({
  id: 'g1', name: 'Gasolina', amount: 10_000, day: 1, active: true, accountId: 'a1', every: 'semana', anchor: '2026-10-05', ...f,
});
const rent = (f: Partial<FixedExpense> = {}): FixedExpense => ({ id: 'r1', name: 'Renta', amount: 150_000, day: 15, active: true, accountId: 'a1', ...f });

const db = (fixed: FixedExpense[], txs: Transaction[] = []): Database => {
  const base = emptyDatabase('2026-10-01', 0);
  return {
    ...base,
    accounts: [{ id: 'a1', name: 'Monetaria', kind: 'banco', initialBalance: 500_000, color: '#000', createdAt: 0 }],
    fixedExpenses: fixed,
    transactions: txs,
    settings: { ...base.settings, payDays: [15, 31], payAmount: 400_000 },
  };
};
let seq = 0;
const paid = (draft: ReturnType<typeof fixedPaymentDraft>): Transaction => ({ ...draft!, id: `t${++seq}`, createdAt: seq, note: draft!.note ?? '' });

describe('gastos fijos semanales', () => {
  it('cae cada semana el mismo día', () => {
    expect(fixedOccurrencesInMonth(gas(), '2026-10').map((o) => o.date)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    // Antes del primer cobro no hay nada (un gasto nuevo no aparece atrasado).
    expect(fixedOccurrencesInMonth(gas({ anchor: '2026-10-19' }), '2026-10').map((o) => o.date)).toEqual(['2026-10-19', '2026-10-26']);
    expect(fixedOccurrencesInMonth(gas({ anchor: '2027-01-04' }), '2026-10')).toEqual([]);
    expect(fixedOccurrencesInMonth(gas(), '2026-11')).toHaveLength(5);
  });

  it('cada dos semanas respeta el ritmo', () => {
    const every2 = gas({ every: 'dos_semanas', anchor: '2026-09-28' });
    expect(fixedOccurrences(every2, '2026-10-01', '2026-11-30').map((o) => o.date)).toEqual(['2026-10-12', '2026-10-26', '2026-11-09', '2026-11-23']);
  });

  it('lo mensual sigue igual', () => {
    expect(fixedOccurrencesInMonth(rent(), '2026-10')).toEqual([{ date: '2026-10-15', key: '2026-10' }]);
    expect(fixedCostIn(rent(), '2026-10')).toBe(150_000);
  });

  it('el costo del mes cuenta cuántas veces cae', () => {
    expect(fixedCostIn(gas(), '2026-10')).toBe(40_000);
    expect(fixedCostIn(gas(), '2026-11')).toBe(50_000);
    expect(fixedIn(db([gas(), rent()]), '2026-10')).toBe(190_000);
    expect(fixedMonthlyAverage(gas())).toBe(43_482);
  });

  it('cada pago marca solo su semana', () => {
    const fixed = gas();
    const t = paid(fixedPaymentDraft(fixed, '2026-10-12', '2026-10-12'));
    const [first, second] = fixedOccurrencesInMonth(fixed, '2026-10');
    expect(fixedPaymentFor(fixed, first, [t])).toBeUndefined();
    expect(fixedPaymentFor(fixed, second, [t])).toBe(t);
    // Un pago sin periodo anotado se asocia a la semana más cercana.
    const loose = { ...t, fixedPeriod: undefined, date: '2026-10-13' };
    expect(fixedPaymentFor(fixed, second, [loose])).toBe(loose);
    expect(fixedPaymentFor(fixed, first, [loose])).toBeUndefined();
  });

  it('próximos pagos incluye cada semana y no arrastra atrasos viejos', () => {
    const list = upcoming(db([gas()]), '2026-10-14', 20).filter((i) => i.kind === 'fijo');
    // El del 5 ya es viejo (más de una semana); el del 12 está atrasado; luego 19, 26 y 2 nov.
    expect(list.map((i) => i.date)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02']);
    expect(list[0].overdue).toBe(true);
    const afterPaying = upcoming(db([gas()], [paid(fixedPaymentDraft(gas(), '2026-10-14', '2026-10-12'))]), '2026-10-14', 20).filter((i) => i.kind === 'fijo');
    expect(afterPaying.map((i) => i.date)).toEqual(['2026-10-19', '2026-10-26', '2026-11-02']);
  });

  it('se reserva lo que vence antes del próximo pago', () => {
    // Hoy 14, cobro el 15: solo el atrasado del 12 cuenta antes del pago.
    expect(overview(db([gas()]), '2026-10-14').fixedDue).toBe(10_000);
    // Hoy 16, próximo pago el 31: 19 y 26.
    expect(overview(db([gas()]), '2026-10-16').fixedDue).toBe(20_000 + 10_000);
  });

  it('"se cobra solo" registra cada semana que ya pasó', () => {
    const fixed = gas({ auto: true });
    const drafts = autoFixedDrafts(db([fixed]), '2026-10-20');
    expect(drafts.map((d) => [d.date, d.fixedPeriod])).toEqual([['2026-10-19', '2026-10-19']]);
    const next = autoFixedDrafts(db([fixed], drafts.map(paid)), '2026-10-20');
    expect(next).toEqual([]);
  });

  it('el próximo a pagar es el atrasado más viejo', () => {
    expect(nextFixedDue(gas(), '2026-10-14', [])?.date).toBe('2026-10-12');
    expect(nextFixedDue(rent(), '2026-10-20', [])?.date).toBe('2026-10-15');
  });

  it('el calendario muestra cada cobro', () => {
    const days = calendarMonth(db([gas()]), '2026-10', '2026-10-14').days;
    const events = days.flatMap((d) => d.events).filter((e) => e.kind === 'fijo');
    expect(events.map((e) => [e.date, e.period])).toEqual([
      ['2026-10-05', '2026-10-05'],
      ['2026-10-12', '2026-10-12'],
      ['2026-10-19', '2026-10-19'],
      ['2026-10-26', '2026-10-26'],
    ]);
  });

  it('textos y fechas de referencia', () => {
    expect(describeFixedSchedule(gas())).toBe('Cada lunes');
    expect(describeFixedSchedule(gas({ every: 'dos_semanas' }))).toBe('Cada 2 semanas (lunes)');
    expect(describeFixedSchedule(rent())).toBe('Día 15 de cada mes');
    expect(anchorForWeekday('2026-10-14', 1)).toBe('2026-10-19');
    expect(anchorForWeekday('2026-10-14', 3)).toBe('2026-10-14');
  });

  it('un respaldo con semanal sin fecha válida queda mensual', () => {
    const clean = sanitizeDatabase({ accounts: [], transactions: [], fixedExpenses: [gas({ anchor: 'mañana' }), gas({ id: 'g2' })] }, '2026-10-14', 1)!;
    expect(clean.fixedExpenses[0]).toMatchObject({ every: undefined, anchor: undefined });
    expect(clean.fixedExpenses[1]).toMatchObject({ every: 'semana', anchor: '2026-10-05' });
  });
});

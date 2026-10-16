import { describe, expect, it } from 'vitest';

import { dailyTip, dailyTips } from '../dailyTip';
import { emptyDatabase } from '../defaults';
import { buildIcs, foldLine, icsText, paymentEvents } from '../icsExport';
import type { CreditCard, Database, FixedExpense } from '../types';

const card: CreditCard = {
  id: 'c1', name: 'Visa Banrural', bank: 'Banrural', cutoffDay: 5, paymentDay: 28,
  limit: 1_000_000, openingStatement: 0, openingCycle: 0, openedOn: '2026-01-01', color: '#000', createdAt: 0,
};
const gas: FixedExpense = { id: 'g1', name: 'Gasolina', amount: 10_000, day: 1, active: true, accountId: 'a1', every: 'semana', anchor: '2026-10-19' };
const rent: FixedExpense = { id: 'r1', name: 'Renta', amount: 150_000, day: 20, active: true, accountId: 'a1' };

const db = (patch: Partial<Database> = {}): Database => {
  const base = emptyDatabase('2026-10-01', 0);
  return {
    ...base,
    accounts: [{ id: 'a1', name: 'Monetaria', kind: 'banco', initialBalance: 500_000, color: '#000', createdAt: 0 }],
    fixedExpenses: [gas, rent],
    cards: [card],
    ...patch,
    settings: { ...base.settings, payDays: [15, 31], payAmount: 400_000, ...patch.settings },
  };
};

describe('calendario de recordatorios (.ics)', () => {
  it('incluye cada pago con dos alarmas y sin montos por defecto', () => {
    const ics = buildIcs(db(), '2026-10-16', { amounts: false, daily: false, months: 1 }, Date.UTC(2026, 9, 16, 15));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('SUMMARY:Pagar Gasolina\r\n');
    expect(ics).toContain('DTSTART;VALUE=DATE:20261019');
    expect(ics).toContain('SUMMARY:Pagar Renta\r\n');
    expect(ics).toContain('SUMMARY:Pagar tarjeta Visa Banrural');
    expect(ics).toContain('TRIGGER:-PT15H');
    expect(ics).toContain('TRIGGER:PT9H');
    expect(ics).toContain('DTSTAMP:20261016T150000Z');
    expect(ics).not.toContain('Q1,500');
    expect(ics).not.toContain('aviso-diario');
    expect(ics.split('BEGIN:VEVENT').length - 1).toBe(ics.split('END:VEVENT').length - 1);
  });

  it('con montos y aviso diario', () => {
    const ics = buildIcs(db(), '2026-10-16', { amounts: true, daily: true, months: 1, hour: 9 }, 0);
    expect(ics).toContain('SUMMARY:Pagar Renta · Q1\\,500.00');
    expect(ics).toContain('UID:aviso-diario@mis-finanzas');
    expect(ics).toContain('RRULE:FREQ=DAILY');
    expect(ics).toContain('DTSTART:20261017T090000');
  });

  it('no repite lo ya pagado ni lo vencido', () => {
    const paid = db({
      transactions: [{ id: 't1', type: 'gasto', amount: 150_000, date: '2026-10-16', note: 'Renta', accountId: 'a1', fixedId: 'r1', fixedPeriod: '2026-10', source: 'fijo', createdAt: 1 }],
    });
    const events = paymentEvents(paid, '2026-10-16', { amounts: false, daily: false, months: 2 });
    expect(events.some((e) => e.uid === 'fijo-r1-2026-10')).toBe(false);
    expect(events.some((e) => e.uid === 'fijo-r1-2026-11')).toBe(true);
    expect(events.every((e) => e.date >= '2026-10-16')).toBe(true);
    // Cada tarjeta, una vez por fecha.
    const cardDates = events.filter((e) => e.uid.startsWith('tarjeta-')).map((e) => e.date);
    expect(new Set(cardDates).size).toBe(cardDates.length);
  });

  it('escapa y corta las líneas como pide el estándar', () => {
    expect(icsText('Café; uno, dos\nfin')).toBe('Café\\; uno\\, dos\\nfin');
    const long = 'SUMMARY:' + 'ñ'.repeat(60);
    const folded = foldLine(long);
    expect(folded.split('\r\n ').every((part) => new TextEncoder().encode(part).length <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
  });
});

describe('aviso diario', () => {
  it('dice cuánto puedes gastar y qué vence ese día', () => {
    const tip = dailyTip(db(), '2026-10-19')!;
    // Libre: 5,000 − gasolina 19 y 26 − renta 20 (antes del pago del 31) = 3,300; 12 días → Q275 por día.
    expect(tip.title).toBe('Hoy puedes gastar Q275.00');
    expect(tip.body).toContain('Libre hasta tu pago del 31 oct: Q3,300.00.');
    expect(tip.body).toContain('Vence hoy: Gasolina Q100.00');
  });

  it('para el día de pago solo pide registrarlo', () => {
    const tips = dailyTips(db(), '2026-10-28');
    expect(tips.map((t) => t.date)).toEqual(['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']);
    expect(tips[3].title).toBe('Hoy es día de pago');
  });
});

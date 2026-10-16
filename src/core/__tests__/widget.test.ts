import { describe, expect, it } from 'vitest';

import { overview } from '../balances';
import { emptyDatabase } from '../defaults';
import type { Database, Transaction } from '../types';
import { parseWidgetSnapshot, widgetDays, widgetSnapshot, widgetView } from '../widget';

let seq = 0;
const tx = (t: Partial<Transaction> & Pick<Transaction, 'type' | 'amount' | 'date'>): Transaction => ({
  id: `w${++seq}`, createdAt: seq, note: '', source: 'manual', accountId: 'a1', ...t,
});
const base = (balance: number): Database => {
  const db = emptyDatabase('2026-10-01', 0);
  db.accounts = [{ id: 'a1', name: 'Monetaria', kind: 'banco', initialBalance: balance, color: '#000', createdAt: 0 }];
  db.settings = { ...db.settings, payAmount: 400000, payDays: [15, 31], payAccountId: 'a1', startedOn: '2026-10-01' };
  return db;
};

describe('widget: puedes gastar hoy', () => {
  it('muestra lo mismo que Inicio el día en que se calcula', () => {
    const db = base(90000);
    db.transactions = [tx({ type: 'gasto', amount: 10000, date: '2026-10-06' })];
    const today = '2026-10-07';
    const o = overview(db, today);
    const snapshot = widgetSnapshot(db, today);
    expect(snapshot).toEqual({ v: 1, symbol: 'Q', free: 80000, payday: '2026-10-15', madeOn: today });
    const view = widgetView(snapshot, today);
    expect(o.perDay).toBe(10000);
    expect(view).toEqual({ title: 'Puedes gastar hoy', amount: 'Q100.00', detail: 'Libre: Q800.00 · 8 días para tu pago', tone: 'ok' });
  });

  it('reparte lo libre entre los días que faltan, día con día, sin abrir la app', () => {
    const snapshot = { v: 1 as const, symbol: 'Q', free: 80000, payday: '2026-10-15', madeOn: '2026-10-07' };
    expect(widgetDays(snapshot, '2026-10-07')).toHaveLength(8);
    expect(widgetDays(snapshot, '2026-10-07').at(-1)).toBe('2026-10-14');
    expect(widgetView(snapshot, '2026-10-11').amount).toBe('Q200.00'); // 800 entre 4 días
    expect(widgetView(snapshot, '2026-10-14')).toMatchObject({ amount: 'Q800.00', detail: 'Libre: Q800.00 · mañana te pagan' });
  });

  it('el día de pago pide abrir la app en vez de inventar un monto', () => {
    const snapshot = { v: 1 as const, symbol: 'Q', free: 80000, payday: '2026-10-15', madeOn: '2026-10-07' };
    expect(widgetView(snapshot, '2026-10-15')).toMatchObject({ amount: '—', detail: 'Abre la app para actualizar', tone: 'none' });
    expect(widgetView(snapshot, '2026-11-02').tone).toBe('none');
    expect(widgetView(snapshot, '2026-10-01').tone).toBe('none'); // fecha del teléfono hacia atrás
    expect(widgetDays(snapshot, '2026-10-15')).toEqual([]);
  });

  it('avisa en rojo cuando ya no queda nada o falta dinero', () => {
    const zero = { v: 1 as const, symbol: 'Q', free: 0, payday: '2026-10-15', madeOn: '2026-10-07' };
    expect(widgetView(zero, '2026-10-08')).toMatchObject({ amount: 'Q0.00', tone: 'low', detail: 'Ya no puedes gastar más hasta el 15 oct' });
    expect(widgetView({ ...zero, free: -25050 }, '2026-10-08')).toMatchObject({ amount: 'Q0.00', tone: 'low', detail: 'Te faltan Q250.50 para llegar al 15 oct' });
  });

  it('apagado o sin datos no muestra ningún monto', () => {
    expect(widgetView(null, '2026-10-07')).toMatchObject({ amount: '—', tone: 'none' });
  });

  it('el snapshot solo lleva lo que el widget pinta: nada de cuentas, tarjetas ni movimientos', () => {
    const db = base(90000);
    db.transactions = [tx({ type: 'gasto', amount: 10000, date: '2026-10-06', note: 'Secreto', merchant: 'Farmacia' })];
    const text = JSON.stringify(widgetSnapshot(db, '2026-10-07'));
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(['free', 'madeOn', 'payday', 'symbol', 'v']);
    expect(text).not.toMatch(/Secreto|Farmacia|Monetaria/);
  });

  it('descarta snapshots guardados con forma inesperada', () => {
    const good = { v: 1, symbol: 'Q', free: 80000, payday: '2026-10-15', madeOn: '2026-10-07' };
    expect(parseWidgetSnapshot(JSON.stringify(good))).toEqual(good);
    expect(parseWidgetSnapshot(null)).toBeNull();
    expect(parseWidgetSnapshot('no es json')).toBeNull();
    expect(parseWidgetSnapshot(JSON.stringify({ ...good, v: 2 }))).toBeNull();
    expect(parseWidgetSnapshot(JSON.stringify({ ...good, free: '80000' }))).toBeNull();
    expect(parseWidgetSnapshot(JSON.stringify({ ...good, payday: '2026-13-40' }))).toBeNull();
  });
});

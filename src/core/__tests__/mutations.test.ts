import { describe, expect, it } from 'vitest';

import { accountBalances } from '../balances';
import { emptyDatabase } from '../defaults';
import { addTransaction, linkedTransactions, removeEntity, sanitizeDatabase, updateTransaction, upsert } from '../mutations';
import type { Database, Transaction } from '../types';

const base = (): Database => {
  const db = emptyDatabase('2026-10-01', 0);
  db.accounts = [
    { id: 'a1', name: 'Monetaria', kind: 'banco', initialBalance: 100000, color: '#000', createdAt: 0 },
    { id: 'a2', name: 'Efectivo', kind: 'efectivo', initialBalance: 0, color: '#000', createdAt: 0 },
  ];
  db.cards = [{ id: 'c1', name: 'Visa', bank: 'Banrural', cutoffDay: 5, paymentDay: 28, limit: 0, openingStatement: 0, openingCycle: 0, openedOn: '2026-10-01', color: '#000', createdAt: 0 }];
  db.envelopes = [{ id: 'e1', name: 'Doctores', kind: 'guardadito', icon: 'medkit', color: '#000', target: 0, createdAt: 0 }];
  db.debtGroups = [{ id: 'g1', name: 'Crédito', icon: 'business' }, { id: 'g2', name: 'Personas', icon: 'people' }];
  db.debts = [{ id: 'd1', name: 'Luis', groupId: 'g2', direction: 'debo', amount: 50000, date: '2026-10-01', note: '', createdAt: 0 }];
  db.fixedExpenses = [{ id: 'f1', name: 'Netflix', amount: 9000, day: 8, cardId: 'c1', categoryId: db.categories[0].id, active: true }];
  db.settings.payAccountId = 'a1';
  const tx = (t: Partial<Transaction> & Pick<Transaction, 'id' | 'type' | 'amount'>): Transaction => ({ date: '2026-10-02', createdAt: 1, note: '', source: 'manual', ...t });
  db.transactions = [
    tx({ id: 't1', type: 'gasto', amount: 1000, accountId: 'a1', categoryId: db.categories[0].id, envelopeId: 'e1' }),
    tx({ id: 't2', type: 'gasto', amount: 2000, cardId: 'c1', fixedId: 'f1' }),
    tx({ id: 't3', type: 'transferencia', amount: 3000, accountId: 'a1', toAccountId: 'a2' }),
    tx({ id: 't4', type: 'aporte', amount: 4000, envelopeId: 'e1' }),
    tx({ id: 't5', type: 'abono_deuda', amount: 5000, accountId: 'a1', debtId: 'd1' }),
  ];
  return db;
};
const ids = (db: Database) => db.transactions.map((t) => t.id);

describe('guardar y borrar', () => {
  it('agrega o reemplaza por id sin tocar el original', () => {
    const db = base();
    const renamed = upsert(db, 'cards', { ...db.cards[0], name: 'Visa Oro' });
    expect(renamed.cards).toHaveLength(1);
    expect(renamed.cards[0].name).toBe('Visa Oro');
    expect(db.cards[0].name).toBe('Visa');
    expect(upsert(db, 'cards', { ...db.cards[0], id: 'c2' }).cards).toHaveLength(2);
  });

  it('al borrar una tarjeta se van sus movimientos y se desliga de los gastos fijos', () => {
    const db = base();
    expect(linkedTransactions(db, 'cards', 'c1')).toBe(1);
    const next = removeEntity(db, 'cards', 'c1');
    expect(ids(next)).toEqual(['t1', 't3', 't4', 't5']);
    expect(next.fixedExpenses[0].cardId).toBeUndefined();
  });

  it('al borrar una cuenta se van sus movimientos (incluidas transferencias) y cambia la cuenta de pago', () => {
    const next = removeEntity(base(), 'accounts', 'a1');
    expect(ids(next)).toEqual(['t2', 't4']);
    expect(next.settings.payAccountId).toBe('a2');
    expect(accountBalances(removeEntity(base(), 'accounts', 'a2')).a1).toBe(100000 - 1000 - 5000);
  });

  it('al borrar un apartado se van sus aportes pero se conservan los gastos', () => {
    const next = removeEntity(base(), 'envelopes', 'e1');
    expect(ids(next)).toEqual(['t1', 't2', 't3', 't5']);
    expect(next.transactions[0].envelopeId).toBeUndefined();
  });

  it('al borrar una categoría los movimientos quedan sin categoría y se olvidan sus reglas', () => {
    const db = base();
    const id = db.categories[0].id;
    db.settings.merchantRules = { campero: id, shell: 'otra' };
    const next = removeEntity(db, 'categories', id);
    expect(next.transactions[0].categoryId).toBeUndefined();
    expect(next.fixedExpenses[0].categoryId).toBeUndefined();
    expect(next.settings.merchantRules).toEqual({ shell: 'otra' });
  });

  it('al borrar una deuda se van sus abonos; al borrar un gasto fijo se conservan sus pagos', () => {
    expect(ids(removeEntity(base(), 'debts', 'd1'))).not.toContain('t5');
    const next = removeEntity(base(), 'fixedExpenses', 'f1');
    expect(ids(next)).toContain('t2');
    expect(next.transactions[1].fixedId).toBeUndefined();
  });

  it('al borrar un grupo sus deudas pasan a otro; nunca quedan deudas sin grupo', () => {
    const next = removeEntity(base(), 'debtGroups', 'g2');
    expect(next.debts[0].groupId).toBe('g1');
    const single = { ...base(), debtGroups: [{ id: 'g2', name: 'Personas', icon: 'people' }] };
    expect(removeEntity(single, 'debtGroups', 'g2').debtGroups).toHaveLength(1);
  });
});

describe('movimientos', () => {
  it('agrega y edita', () => {
    const db = addTransaction(base(), { type: 'ingreso', amount: 7000, date: '2026-10-03', note: '', accountId: 'a1', source: 'manual' }, 'nuevo', 99);
    expect(db.transactions.at(-1)).toMatchObject({ id: 'nuevo', createdAt: 99, amount: 7000 });
    expect(updateTransaction(db, 'nuevo', { amount: 8000 }).transactions.at(-1)?.amount).toBe(8000);
    expect(updateTransaction(db, 'no-existe', { amount: 1 })).toBe(db);
  });

  it('aprende la categoría cuando se corrige un comercio', () => {
    const db = base();
    db.transactions[1].merchant = 'POLLO CAMPERO Z.10';
    const next = updateTransaction(db, 't2', { categoryId: 'cat-x' });
    expect(next.settings.merchantRules).toEqual({ 'pollo campero z 10': 'cat-x' });
  });
});

describe('respaldos', () => {
  it('acepta un respaldo propio y lo completa', () => {
    const db = base();
    const restored = sanitizeDatabase(JSON.parse(JSON.stringify(db)), '2026-11-01', 5)!;
    expect(restored.transactions).toHaveLength(5);
    expect(restored.settings.payAccountId).toBe('a1');
    const partial = sanitizeDatabase({ accounts: [], transactions: [], settings: { payDays: 'x', usdRate: -1 } }, '2026-11-01', 5)!;
    expect(partial.settings.payDays).toEqual([15, 31]);
    expect(partial.settings.usdRate).toBe(7.75);
    expect(partial.categories.length).toBeGreaterThan(5);
  });

  it('los ajustes de seguridad siempre quedan con un valor válido', () => {
    const odd = sanitizeDatabase({ accounts: [], transactions: [], settings: { lockEnabled: 'sí', shieldScreen: 0, captureKey: 123 } }, '2026-11-01', 5)!;
    expect(odd.settings).toMatchObject({ lockEnabled: false, shieldScreen: true });
    expect(odd.settings).not.toHaveProperty('captureKey');
    const old = sanitizeDatabase({ accounts: [], transactions: [], settings: {} }, '2026-11-01', 5)!;
    expect(old.settings).toMatchObject({ lockEnabled: false, shieldScreen: true });
  });

  it('rechaza archivos ajenos y descarta movimientos dañados', () => {
    expect(sanitizeDatabase(null, '2026-11-01', 5)).toBeNull();
    expect(sanitizeDatabase({ hola: 1 }, '2026-11-01', 5)).toBeNull();
    const dirty = sanitizeDatabase({ accounts: [], transactions: [{ id: 'x', amount: 'mucho', date: '2026-10-01' }, { id: 'y', amount: 5, date: '2026-13-40' }, { id: 'z', amount: 5, date: '2026-10-01' }, 7] }, '2026-11-01', 5)!;
    expect(dirty.transactions.map((t) => t.id)).toEqual(['z']);
  });
});

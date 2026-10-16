import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { TxDraft } from '@/core/txDraft';
import { todayISO } from '@/core/dates';
import { emptyDatabase } from '@/core/defaults';
import { newId } from '@/core/id';
import {
  addTransaction,
  removeEntity,
  removeTransaction,
  sanitizeDatabase,
  updateTransaction,
  upsert,
} from '@/core/mutations';
import type { CollectionKey, Database, ID, Settings, Transaction } from '@/core/types';

import { STORAGE_KEY, storage } from './storage';
import { useUndo } from './undo';

/** Versión del formato guardado. Súbela y agrega un paso en `migrate` si cambias los tipos. */
const SCHEMA_VERSION = 1;

interface Actions {
  save: <K extends CollectionKey>(key: K, item: Database[K][number]) => void;
  remove: (key: CollectionKey, id: ID) => void;
  addTx: (draft: TxDraft) => Transaction;
  updateTx: (id: ID, patch: Partial<Transaction>) => void;
  removeTx: (id: ID) => void;
  setSettings: (patch: Partial<Settings>) => void;
  replaceAll: (db: Database) => void;
  reset: () => void;
}

export type AppState = Database & Actions;

const DB_KEYS: (keyof Database)[] = [
  'accounts', 'cards', 'categories', 'envelopes', 'debtGroups',
  'debts', 'fixedExpenses', 'installments', 'extraIncomes', 'plannedExpenses', 'transactions', 'settings',
];

const REMOVED_LABEL: Record<CollectionKey, string> = {
  accounts: 'Cuenta eliminada',
  cards: 'Tarjeta eliminada',
  categories: 'Categoría eliminada',
  envelopes: 'Apartado eliminado',
  debtGroups: 'Grupo eliminado',
  debts: 'Deuda eliminada',
  fixedExpenses: 'Gasto fijo eliminado',
  installments: 'Compra a cuotas eliminada',
  extraIncomes: 'Ingreso extra eliminado',
  plannedExpenses: 'Gasto planeado eliminado',
};

/** Solo los datos, sin las acciones. */
export function pickDatabase(state: Database): Database {
  const db = {} as Record<keyof Database, unknown>;
  for (const key of DB_KEYS) db[key] = state[key];
  return db as unknown as Database;
}

function migrate(persisted: unknown, _version: number): Database {
  // v1 es la primera versión. Las futuras transforman `persisted` paso a paso aquí.
  return sanitizeDatabase(persisted, todayISO(), Date.now()) ?? emptyDatabase(todayISO(), Date.now());
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...emptyDatabase(todayISO(), Date.now()),

      save: (key, item) => set((s) => upsert(pickDatabase(s), key, item)),
      remove: (key, id) => {
        useUndo.getState().offer(REMOVED_LABEL[key], pickDatabase(get()), Date.now());
        set((s) => removeEntity(pickDatabase(s), key, id));
      },

      addTx: (draft) => {
        const id = newId();
        const now = Date.now();
        set((s) => addTransaction(pickDatabase(s), draft, id, now));
        return get().transactions.find((tx) => tx.id === id)!;
      },
      updateTx: (id, patch) => set((s) => updateTransaction(pickDatabase(s), id, patch)),
      removeTx: (id) => {
        useUndo.getState().offer('Movimiento eliminado', pickDatabase(get()), Date.now());
        set((s) => removeTransaction(pickDatabase(s), id));
      },

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      replaceAll: (db) => set(pickDatabase(db)),
      reset: () => set(emptyDatabase(todayISO(), Date.now())),
    }),
    {
      name: STORAGE_KEY,
      version: SCHEMA_VERSION,
      storage: createJSONStorage(() => storage),
      partialize: (state) => pickDatabase(state),
      migrate,
      // Si los datos no se pueden abrir, `storage` ya lo registró y la app muestra el aviso;
      // aquí solo se evita que el error quede sin atender.
      onRehydrateStorage: () => () => {},
      merge: (persisted, current) => {
        const db = sanitizeDatabase(persisted, todayISO(), Date.now());
        return db ? { ...current, ...db } : current;
      },
    },
  ),
);

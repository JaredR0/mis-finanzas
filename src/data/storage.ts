import { useSyncExternalStore } from 'react';
import type { StateStorage } from 'zustand/middleware';

import { keyStore, randomBytes } from '@/security/keyStore';
import { createSecureStorage, type StorageHealth } from '@/security/secureStorage';

import { backend } from './backend';

/**
 * Guardado de la app: cifrado (security/secureStorage) sobre el
 * almacenamiento privado del teléfono (data/backend), con la llave en el
 * llavero del sistema (security/keyStore).
 */

export const STORAGE_KEY = 'mis-finanzas/db';

let health: StorageHealth = { mode: 'desconocido', error: null, setAside: false };
const listeners = new Set<() => void>();

const secure = createSecureStorage({
  backend,
  keys: keyStore,
  randomBytes,
  onHealth: (next) => {
    health = next;
    listeners.forEach((listener) => listener());
  },
});

export const storage: StateStorage = {
  getItem: secure.getItem,
  setItem: secure.setItem,
  removeItem: secure.removeItem,
};

/**
 * Guardado cifrado para datos pequeños fuera de la base principal (p. ej. los
 * números del widget en Android). Usa la misma llave. Leerlo nunca
 * afecta a la base principal: si algo falla, simplemente devuelve null.
 */
export const sideStore = {
  getItem: (name: string): Promise<string | null> => secure.peek(name),
  setItem: (name: string, value: string): Promise<void> => Promise.resolve(secure.setItem(name, value)).catch(() => {}),
  removeItem: (name: string): Promise<void> => Promise.resolve(secure.removeItem(name)).catch(() => {}),
};

/** Guarda de inmediato lo pendiente (al salir de la app). */
export const flushStorage = (): Promise<void> => secure.flush().catch(() => {});

/** Estado del guardado: si está cifrado y si hubo algún problema al abrir los datos. */
export function useStorageHealth(): StorageHealth {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => health,
    () => health,
  );
}

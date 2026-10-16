import type { Transaction } from './types';

/** Movimiento listo para guardar (sin id ni fecha de creación). */
export type TxDraft = Omit<Transaction, 'id' | 'createdAt'>;

/** Nombre de comercio sin mayúsculas, tildes ni signos (para recordar su categoría). */
export const normalizeMerchant = (name: string): string =>
  name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

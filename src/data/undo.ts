import { create } from 'zustand';

import type { Database } from '@/core/types';

/**
 * Deshacer el último borrado. Guarda en memoria (no en el teléfono) cómo
 * estaban los datos justo antes; "Deshacer" los deja exactamente igual.
 */
export interface UndoEntry {
  /** Texto corto de lo que se borró: "Movimiento eliminado". */
  label: string;
  /** Los datos como estaban antes de borrar. */
  snapshot: Database;
  /** Para distinguir un borrado de otro. */
  at: number;
}

interface UndoState {
  entry: UndoEntry | null;
  offer: (label: string, snapshot: Database, at: number) => void;
  clear: () => void;
}

export const useUndo = create<UndoState>()((set) => ({
  entry: null,
  offer: (label, snapshot, at) => set({ entry: { label, snapshot, at } }),
  clear: () => set({ entry: null }),
}));

/** Cuánto tiempo se ofrece deshacer. */
export const UNDO_MS = 7000;

import type { ID } from './types';

/** La hora actual en milisegundos (para marcar cuándo se creó algo). */
export const timestamp = (): number => Date.now();

let counter = 0;

/** Identificador único, ordenable por momento de creación. */
export function newId(): ID {
  counter = (counter + 1) % 1296;
  const random = Math.floor(Math.random() * 46656);
  return `${Date.now().toString(36)}${counter.toString(36).padStart(2, '0')}${random.toString(36).padStart(3, '0')}`;
}

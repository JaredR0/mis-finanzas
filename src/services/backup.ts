import { todayISO } from '@/core/dates';
import { sanitizeDatabase } from '@/core/mutations';
import type { Database } from '@/core/types';
import { pickDatabase } from '@/data/store';

import { pickTextFile, saveAndShare } from './files';

const MAX_BACKUP_CHARS = 20_000_000;

/**
 * Respaldo completo en un archivo .json. OJO: el archivo NO va cifrado; quien lo abra ve todo.
 */
export async function exportBackup(db: Database): Promise<void> {
  const data = pickDatabase(db);
  // El ajuste de bloqueo es de este teléfono: no viaja en el respaldo.
  const portable = { ...data, settings: { ...data.settings, lockEnabled: false } };
  const payload = JSON.stringify({ app: 'mis-finanzas', exportedAt: new Date().toISOString(), data: portable }, null, 2);
  await saveAndShare(`respaldo-mis-finanzas-${todayISO()}.json`, payload, 'application/json');
}

/** Lee un respaldo elegido por el usuario. null = canceló; lanza error si el archivo no sirve. */
export async function pickBackup(): Promise<Database | null> {
  const text = await pickTextFile();
  if (text === null) return null;
  if (text.length > MAX_BACKUP_CHARS) throw new Error('El archivo es demasiado grande para ser un respaldo.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('El archivo no es un respaldo válido.');
  }
  const data = parsed && typeof parsed === 'object' && 'data' in parsed ? (parsed as { data: unknown }).data : parsed;
  const db = sanitizeDatabase(data, todayISO(), Date.now());
  if (!db) throw new Error('El archivo no es un respaldo de Mis Finanzas.');
  return db;
}

import type { Database, ISODate } from '@/core/types';

/** En web no hay recordatorios. */
export async function requestReminderPermission(): Promise<boolean> {
  return false;
}

export async function syncReminders(_db: Database, _today: ISODate): Promise<void> {}

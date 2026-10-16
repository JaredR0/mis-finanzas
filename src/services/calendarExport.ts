import { buildIcs, type IcsOptions } from '@/core/icsExport';
import type { Database, ISODate } from '@/core/types';

import { saveAndShare } from './files';

/**
 * Recordatorios en el calendario del teléfono: arma el archivo .ics y lo
 * entrega con la hoja de compartir (ahí se elige Calendario).
 */
export async function exportCalendar(db: Database, today: ISODate, opts: IcsOptions, _mode: 'abrir' | 'archivo' = 'abrir'): Promise<void> {
  await saveAndShare(`recordatorios-mis-finanzas-${today}.ics`, buildIcs(db, today, opts, Date.now()), 'text/calendar');
}

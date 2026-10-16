import { buildIcs, type IcsOptions } from '@/core/icsExport';
import type { Database, ISODate } from '@/core/types';

import { saveAndShare } from './files';

/**
 * Versión web: Safari en iPhone abre los calendarios (.ics) con el aviso
 * "Agregar todo" del Calendario. 'abrir' lo intenta así; 'archivo' lo entrega
 * con el menú Compartir (para guardarlo en Archivos y abrirlo desde ahí).
 */
export async function exportCalendar(db: Database, today: ISODate, opts: IcsOptions, mode: 'abrir' | 'archivo' = 'abrir'): Promise<void> {
  const ics = buildIcs(db, today, opts, Date.now());
  const name = `recordatorios-mis-finanzas-${today}.ics`;
  if (mode === 'archivo') {
    await saveAndShare(name, ics, 'text/calendar');
    return;
  }
  const link = document.createElement('a');
  link.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
  // En computadora el navegador lo descarga con este nombre.
  if (!/iPhone|iPad|iPod/.test(navigator.userAgent)) link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

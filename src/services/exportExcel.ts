import { buildSheets } from '@/core/exportData';
import type { Database, ISODate } from '@/core/types';

import { saveAndShare } from './files';
import { writeXlsx } from './xlsxWriter';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Genera el archivo de Excel con todas las hojas (resumen, categorías, movimientos…). */
export const buildWorkbook = (db: Database, today: ISODate, onlyYear?: number): Uint8Array =>
  writeXlsx(buildSheets(db, today, onlyYear));

/** `onlyYear` exporta un solo año; sin él, todo. */
export async function exportToExcel(db: Database, today: ISODate, onlyYear?: number): Promise<void> {
  const label = onlyYear ? `${onlyYear}` : today;
  await saveAndShare(`mis-finanzas-${label}.xlsx`, buildWorkbook(db, today, onlyYear), XLSX_MIME);
}

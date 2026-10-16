import { overview } from './balances';
import { addDays, diffDays, formatShort, isValidISO } from './dates';
import { formatMoney } from './money';
import type { Cents, Database, ISODate } from './types';

/**
 * Widget "Puedes gastar hoy".
 *
 * El widget vive fuera de la app, así que no puede leer los datos cifrados.
 * La app le deja solo estos números (`WidgetSnapshot`): cuánto queda libre y
 * cuándo es el próximo pago. Con eso el widget calcula solo el monto de cada
 * día, aunque no abras la app: lo libre se reparte entre los días que faltan.
 */

export interface WidgetSnapshot {
  v: 1;
  /** Símbolo de moneda. */
  symbol: string;
  /** Libre para gastar hasta el próximo pago. */
  free: Cents;
  /** Próximo día de pago. */
  payday: ISODate;
  /** Día en que se calculó. */
  madeOn: ISODate;
}

export type WidgetTone = 'ok' | 'low' | 'none';

/** Lo que pinta el widget: solo textos, para que iPhone y Android muestren lo mismo. */
export interface WidgetView {
  title: string;
  amount: string;
  detail: string;
  tone: WidgetTone;
}

export const WIDGET_NAME = 'GastoDiario';
export const WIDGET_TITLE = 'Puedes gastar hoy';
/** Tope de días que se le programan al widget por adelantado. */
const MAX_DAYS = 62;

export function widgetSnapshot(db: Database, today: ISODate): WidgetSnapshot {
  const o = overview(db, today);
  return { v: 1, symbol: db.settings.currency, free: o.free, payday: o.period.end, madeOn: today };
}

/** Lee un snapshot guardado; null si no existe o no tiene la forma esperada. */
export function parseWidgetSnapshot(text: string | null | undefined): WidgetSnapshot | null {
  if (!text) return null;
  try {
    const raw = JSON.parse(text) as Partial<WidgetSnapshot> | null;
    if (!raw || raw.v !== 1) return null;
    if (typeof raw.symbol !== 'string' || raw.symbol.length > 6) return null;
    if (typeof raw.free !== 'number' || !Number.isFinite(raw.free)) return null;
    if (typeof raw.payday !== 'string' || !isValidISO(raw.payday)) return null;
    if (typeof raw.madeOn !== 'string' || !isValidISO(raw.madeOn)) return null;
    return { v: 1, symbol: raw.symbol, free: Math.round(raw.free), payday: raw.payday, madeOn: raw.madeOn };
  } catch {
    return null;
  }
}

/** Días para los que el snapshot sigue siendo válido: desde `from` hasta el día antes del pago. */
export function widgetDays(snapshot: WidgetSnapshot, from: ISODate): ISODate[] {
  const days: ISODate[] = [];
  for (let date = from; date < snapshot.payday && days.length < MAX_DAYS; date = addDays(date, 1)) days.push(date);
  return days;
}

export function widgetView(snapshot: WidgetSnapshot | null, date: ISODate): WidgetView {
  if (!snapshot) {
    return { title: 'Mis Finanzas', amount: '—', detail: 'Activa el widget en Ajustes', tone: 'none' };
  }
  if (date >= snapshot.payday || date < snapshot.madeOn) {
    // Llegó el día de pago (o cambió la fecha del teléfono): hace falta abrir la app para recalcular.
    return { title: WIDGET_TITLE, amount: '—', detail: 'Abre la app para actualizar', tone: 'none' };
  }
  const money = (cents: Cents) => formatMoney(cents, { symbol: snapshot.symbol });
  const until = formatShort(snapshot.payday);
  if (snapshot.free <= 0) {
    return {
      title: WIDGET_TITLE,
      amount: money(0),
      detail: snapshot.free < 0 ? `Te faltan ${money(-snapshot.free)} para llegar al ${until}` : `Ya no puedes gastar más hasta el ${until}`,
      tone: 'low',
    };
  }
  const daysLeft = Math.max(1, diffDays(date, snapshot.payday));
  return {
    title: WIDGET_TITLE,
    amount: money(Math.floor(snapshot.free / daysLeft)),
    detail: daysLeft === 1 ? `Libre: ${money(snapshot.free)} · mañana te pagan` : `Libre: ${money(snapshot.free)} · ${daysLeft} días para tu pago`,
    tone: 'ok',
  };
}

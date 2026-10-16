import { debtRemaining } from './balances';
import { cardObligations, cutoffInMonth, dueDateFor } from './creditCard';
import { addDays, monthKey, parts, shiftMonth } from './dates';
import { fixedOccurrences, fixedPaymentFor } from './fixed';
import { formatMoney } from './money';
import { plannedOccurrences } from './planned';
import type { Cents, Database, ISODate } from './types';

/**
 * Recordatorios para el calendario del teléfono (archivo .ics).
 *
 * La versión web no puede programar notificaciones sin un servidor (y un
 * servidor significaría mandar tus datos por internet). En cambio, el
 * calendario del teléfono sí avisa a la hora indicada, sin internet: se
 * le pasa un archivo con cada pago y dos alarmas (un día antes y el mismo día).
 */

export interface IcsOptions {
  /** Poner los montos en el título. Apagado, solo dice qué pagar. */
  amounts: boolean;
  /** Agregar un aviso diario para revisar cuánto puedes gastar. */
  daily: boolean;
  /** Hora del aviso diario y de las alarmas (0–23). */
  hour?: number;
  /** Meses hacia adelante. */
  months?: number;
}

export interface IcsEvent {
  uid: string;
  date: ISODate;
  title: string;
  description: string;
}

/** Fecha y hora UTC en formato del calendario ('AAAAMMDDTHHMMSSZ'). */
const stamp = (now: number): string => new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const compact = (date: ISODate): string => date.replace(/-/g, '');

/** Escapa el texto según el estándar del calendario. */
export const icsText = (text: string): string =>
  text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Corta líneas largas (máximo 75 bytes) como pide el estándar. */
export function foldLine(line: string): string {
  const bytes = (s: string) => {
    let n = 0;
    for (const ch of s) {
      const code = ch.codePointAt(0) ?? 0;
      n += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    }
    return n;
  };
  if (bytes(line) <= 75) return line;
  const out: string[] = [];
  let current = '';
  for (const ch of line) {
    if (bytes(current + ch) > (out.length ? 74 : 75)) {
      out.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  out.push(current);
  return out.join('\r\n ');
}

/** Todo lo que hay que pagar entre hoy y `months` meses, sin lo que ya está pagado. */
export function paymentEvents(db: Database, today: ISODate, opts: IcsOptions): IcsEvent[] {
  const months = opts.months ?? 6;
  const end = addDays(today, months * 31);
  const money = (cents: Cents) => formatMoney(cents, { symbol: db.settings.currency });
  const titled = (verb: string, name: string, cents?: Cents) => (opts.amounts && cents ? `${verb} ${name} · ${money(cents)}` : `${verb} ${name}`);
  const events: IcsEvent[] = [];

  for (const fixed of db.fixedExpenses) {
    for (const o of fixedOccurrences(fixed, today, end)) {
      if (fixedPaymentFor(fixed, o, db.transactions)) continue;
      events.push({ uid: `fijo-${fixed.id}-${o.key}`, date: o.date, title: titled('Pagar', fixed.name, fixed.amount), description: 'Gasto fijo' });
    }
  }

  for (const card of db.cards) {
    const seen = new Set<string>();
    for (const o of cardObligations(card, db.transactions, today)) {
      if (o.due < today) continue;
      seen.add(o.due);
      events.push({ uid: `tarjeta-${card.id}-${o.due}`, date: o.due, title: titled('Pagar tarjeta', card.name, o.estimate ? undefined : o.amount), description: 'Pago de tarjeta para no generar intereses' });
    }
    // Cortes futuros: la fecha se sabe, el monto todavía no.
    const { y, m } = parts(today);
    for (let i = 0; i <= months; i++) {
      const mm = shiftMonth(y, m, i);
      const due = dueDateFor(card, cutoffInMonth(card, mm.y, mm.m));
      if (due < today || due > end || seen.has(due)) continue;
      seen.add(due);
      events.push({ uid: `tarjeta-${card.id}-${due}`, date: due, title: `Pagar tarjeta ${card.name}`, description: 'Pago de tarjeta. Revisa el monto en Mis Finanzas.' });
    }
  }

  for (const debt of db.debts) {
    if (!debt.dueDate || debt.dueDate < today || debt.dueDate > end) continue;
    const rest = debtRemaining(debt, db.transactions);
    if (rest <= 0) continue;
    const mine = debt.direction === 'debo';
    events.push({
      uid: `deuda-${debt.id}-${debt.dueDate}`,
      date: debt.dueDate,
      title: titled(mine ? 'Pagar deuda' : 'Cobrar', debt.name, rest),
      description: mine ? 'Deuda' : 'Te deben',
    });
  }

  for (const o of plannedOccurrences(db, monthKey(today), months + 1)) {
    if (o.paid || o.date < today || o.date > end) continue;
    events.push({ uid: `planeado-${o.planned.id}-${o.key}`, date: o.date, title: titled('Pagar', o.planned.name, o.planned.amount), description: 'Gasto planeado' });
  }

  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.uid.localeCompare(b.uid)));
}

/** Archivo .ics completo, listo para abrir con el calendario del teléfono. */
export function buildIcs(db: Database, today: ISODate, opts: IcsOptions, now: number): string {
  const hour = Math.min(23, Math.max(0, Math.round(opts.hour ?? 9)));
  const dtstamp = stamp(now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mis Finanzas//Recordatorios//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Mis Finanzas',
  ];
  const alarm = (trigger: string, text: string) => ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(text)}`, `TRIGGER:${trigger}`, 'END:VALARM'];

  for (const event of paymentEvents(db, today, opts)) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}@mis-finanzas`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${compact(event.date)}`,
      `DTEND;VALUE=DATE:${compact(addDays(event.date, 1))}`,
      `SUMMARY:${icsText(event.title)}`,
      `DESCRIPTION:${icsText(`${event.description} (Mis Finanzas)`)}`,
      'TRANSP:TRANSPARENT',
      // Eventos de día completo: las alarmas cuentan desde la medianoche.
      ...alarm(`-PT${24 - hour}H`, `Mañana: ${event.title}`),
      ...alarm(`PT${hour}H`, `Hoy: ${event.title}`),
      'END:VEVENT',
    );
  }

  if (opts.daily) {
    const start = addDays(today, 1);
    lines.push(
      'BEGIN:VEVENT',
      'UID:aviso-diario@mis-finanzas',
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${compact(start)}T${String(hour).padStart(2, '0')}0000`,
      'DURATION:PT5M',
      'RRULE:FREQ=DAILY',
      `SUMMARY:${icsText('Mis Finanzas: revisa cuánto puedes gastar hoy')}`,
      'TRANSP:TRANSPARENT',
      ...alarm('PT0M', 'Abre Mis Finanzas para ver cuánto puedes gastar hoy'),
      'END:VEVENT',
    );
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

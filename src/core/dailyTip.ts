import { overview, upcoming } from './balances';
import { addDays, formatShort } from './dates';
import { formatMoney } from './money';
import type { Database, ISODate } from './types';

/**
 * Texto del aviso de cada mañana: cuánto puedes gastar ese día y qué vence.
 * Se calcula con lo que hay registrado hoy; la app lo recalcula cada vez que
 * cambian los datos. Devuelve null para días que ya no se pueden estimar bien.
 */
export interface DailyTip {
  date: ISODate;
  title: string;
  body: string;
}

export function dailyTip(db: Database, day: ISODate): DailyTip | null {
  const money = (cents: number) => formatMoney(cents, { symbol: db.settings.currency });
  const view = overview(db, day);
  const due = upcoming(db, day, 0).filter((item) => item.date === day && !item.estimate);
  const dueText = due.length ? ` Vence hoy: ${due.map((i) => `${i.title} ${money(i.amount)}`).join(', ')}.` : '';
  if (db.settings.payDays.length && view.period.daysLeft <= 0) return null;
  const title = view.free > 0 ? `Hoy puedes gastar ${money(view.perDay)}` : 'Hoy no hay dinero libre para gastar';
  const until = db.settings.payDays.length || db.settings.payWeekly ? `hasta tu pago del ${formatShort(view.period.end)}` : 'hasta fin de mes';
  return { date: day, title, body: `Libre ${until}: ${money(Math.max(0, view.free))}.${dueText}` };
}

/** Avisos de los próximos días, hasta antes del próximo día de pago (ese día cambia todo). */
export function dailyTips(db: Database, today: ISODate, days = 7): DailyTip[] {
  const end = overview(db, today).period.end;
  const out: DailyTip[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(today, i);
    if (day >= end) {
      out.push({ date: day, title: 'Hoy es día de pago', body: 'Cuando te caiga, anótalo en Mis Finanzas para ver cuánto puedes gastar.' });
      break;
    }
    const tip = dailyTip(db, day);
    if (tip) out.push(tip);
  }
  return out;
}

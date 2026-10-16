import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { envelopeBalances, upcoming } from '@/core/balances';
import { dailyTips } from '@/core/dailyTip';
import { addDays, formatShort, parts } from '@/core/dates';
import { formatMoney } from '@/core/money';
import { planProgress, takenOutOfPlan } from '@/core/savingsGoal';
import type { Database, ISODate } from '@/core/types';

/**
 * Recordatorios locales (no usan internet): avisan 3 días antes y el mismo día
 * de cada pago de tarjeta, gasto fijo y deuda, y el día que toca aportar a una meta de ahorro. Se reprograman cada vez que
 * cambian los datos, así siempre reflejan los montos actuales.
 */

const HOUR = 9;
const DAILY_HOUR = 8;
const MAX_REMINDERS = 40; // iOS permite 64 pendientes por app

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

const at = (date: ISODate): Date => {
  const { y, m, d } = parts(date);
  return new Date(y, m - 1, d, HOUR, 0, 0);
};

export async function requestReminderPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function syncReminders(db: Database, today: ISODate): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!db.settings.remindersOn && !db.settings.dailyReminder) return;
  if (!(await Notifications.getPermissionsAsync()).granted) return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('pagos', {
      name: 'Pagos próximos',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const now = Date.now();
  let scheduled = 0;

  // Cada mañana: cuánto puedes gastar ese día (se recalcula cada vez que cambian los datos).
  if (db.settings.dailyReminder) {
    for (const tip of dailyTips(db, today)) {
      const { y, m, d } = parts(tip.date);
      const when = new Date(y, m - 1, d, DAILY_HOUR, 0, 0);
      if (when.getTime() <= now) continue;
      await Notifications.scheduleNotificationAsync({
        content: { title: tip.title, body: tip.body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: 'pagos' },
      });
      scheduled++;
    }
  }
  if (!db.settings.remindersOn) return;

  for (const item of upcoming(db, today, 60)) {
    if (item.estimate) continue; // solo montos firmes
    const amount = formatMoney(item.amount, { symbol: db.settings.currency });
    const moments: [ISODate, string][] = [
      [addDays(item.date, -3), `En 3 días (${formatShort(item.date)}): ${amount}`],
      [item.date, `Hoy vence: ${amount}`],
    ];
    for (const [date, body] of moments) {
      const when = at(date);
      if (when.getTime() <= now || scheduled >= MAX_REMINDERS) continue;
      await Notifications.scheduleNotificationAsync({
        content: { title: item.title, body },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: 'pagos' },
      });
      scheduled++;
    }
  }

  // Aportes a metas de ahorro con fecha: el día que toca.
  const balances = envelopeBalances(db);
  for (const envelope of db.envelopes) {
    const progress = planProgress(envelope, balances[envelope.id] ?? 0, today, takenOutOfPlan(envelope, db.transactions));
    if (!envelope.plan || !progress?.nextDate || scheduled >= MAX_REMINDERS) continue;
    const when = at(progress.nextDate);
    if (when.getTime() <= now) continue;
    const amount = formatMoney(Math.min(envelope.plan.amount, progress.missing), { symbol: db.settings.currency });
    await Notifications.scheduleNotificationAsync({
      content: { title: `Hoy toca ahorrar para ${envelope.name}`, body: `Aparta ${amount} para seguir tu plan.` },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: 'pagos' },
    });
    scheduled++;
  }
}

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { fixedPaymentDraft } from '@/core/autoFixed';
import { debtTotals } from '@/core/balances';
import { type CalendarEvent, type CalendarKind, calendarMonth, monthAhead } from '@/core/calendar';
import { formatLong, formatShort, monthKey, monthLabel, relativeDay, shiftMonthKey } from '@/core/dates';
import { upcomingExtras } from '@/core/extraIncome';
import { baseline, monthEndOutlook, monthlyMargin } from '@/core/forecast';
import { plannedOccurrences } from '@/core/planned';
import type { ISODate } from '@/core/types';
import { useDb, useMoney, useToday } from '@/data/hooks';
import { newestFirst, TxRow } from '@/features/shared/TxList';
import { Button, Card, FadeIn, haptic, type IconName, Money, Row, Screen, SectionTitle, space, Tag, Txt, useColors } from '@/ui';

const WEEKDAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
const KIND: Record<CalendarKind, { icon: IconName; label: string }> = {
  sueldo: { icon: 'cash', label: 'Sueldo' },
  extra: { icon: 'add-circle', label: 'Ingreso extra' },
  fijo: { icon: 'repeat', label: 'Gasto fijo' },
  planeado: { icon: 'calendar', label: 'Gasto planeado' },
  tarjeta: { icon: 'card', label: 'Pago de tarjeta' },
  deuda: { icon: 'trending-down', label: 'Deuda' },
  ahorro: { icon: 'wallet', label: 'Meta de ahorro' },
};
/** Hasta dónde se puede avanzar o retroceder. */
const MONTHS_BACK = 24;
const MONTHS_FORWARD = 36;

/** Calendario: lo que entra y sale cada día, y cómo cerraría cada mes. */
export default function CalendarScreen() {
  const db = useDb();
  const today = useToday();
  const colors = useColors();
  const money = useMoney();
  const current = monthKey(today);
  const [month, setMonth] = useState(current);
  const [selected, setSelected] = useState<ISODate>(today);

  const calendar = calendarMonth(db, month, today);
  const day = calendar.days.find((d) => d.date === selected) ?? calendar.days[0];
  const base = baseline(db, today);
  const canProject = !base.noData && base.income > 0;
  const ahead = monthAhead(db, today, month);
  const outlook = month === current ? monthEndOutlook(db, today) : null;
  const owed = debtTotals(db).owe;

  const go = (key: string, date?: ISODate) => {
    if (key < shiftMonthKey(current, -MONTHS_BACK) || key > shiftMonthKey(current, MONTHS_FORWARD)) return;
    haptic.tap();
    setMonth(key);
    if (date) setSelected(date);
    else if (key === current) setSelected(today);
    else {
      const next = calendarMonth(db, key, today);
      setSelected((next.days.find((d) => d.events.length > 0) ?? next.days[0]).date);
    }
  };

  const tone = (event: CalendarEvent) => (event.flow === 'in' ? colors.positive : event.flow === 'out' ? colors.negative : colors.primary);

  const open = (event: CalendarEvent) => {
    if (event.kind === 'extra') router.push({ pathname: '/ingreso-extra', params: { id: event.refId } });
    else if (event.kind === 'planeado') router.push({ pathname: '/gasto-planeado', params: { id: event.refId } });
    else if (event.kind === 'fijo') router.push('/fijos');
    else if (event.kind === 'tarjeta') router.push('/tarjetas');
    else if (event.kind === 'deuda') router.push('/deudas');
    else if (event.kind === 'ahorro') router.push('/apartados');
    else router.push('/ajustes');
  };

  const pay = (event: CalendarEvent) => {
    const planned = db.plannedExpenses.find((p) => p.id === event.refId);
    if (!planned) return;
    const accountId = planned.cardId ? undefined : (planned.accountId ?? db.settings.payAccountId ?? db.accounts[0]?.id);
    if (!planned.cardId && !accountId) return;
    haptic.success();
    db.addTx({
      type: 'gasto',
      amount: planned.amount,
      date: today,
      note: planned.name,
      accountId,
      cardId: planned.cardId,
      categoryId: planned.categoryId,
      plannedId: planned.id,
      plannedPeriod: monthKey(event.date),
      source: 'manual',
    });
  };

  /** Registra el sueldo de ese día de pago. */
  const receivePay = (event: CalendarEvent) => {
    const accountId = db.settings.payAccountId ?? db.accounts[0]?.id;
    if (!accountId) return;
    haptic.success();
    db.addTx({ type: 'ingreso', amount: event.amount, date: today, note: 'Pago de salario', accountId, categoryId: db.categories.find((c) => c.key === 'salario')?.id, payDate: event.date, source: 'manual' });
  };

  /** Registra que llegó ese ingreso extra. */
  const receiveExtra = (event: CalendarEvent) => {
    const extra = db.extraIncomes.find((x) => x.id === event.refId);
    const accountId = extra?.accountId ?? db.settings.payAccountId ?? db.accounts[0]?.id;
    if (!extra || !accountId) return;
    haptic.success();
    db.addTx({ type: 'ingreso', amount: extra.amount, date: today, note: extra.name, accountId, categoryId: db.categories.find((c) => c.key === 'otros_ingresos')?.id, extraId: extra.id, extraPeriod: monthKey(event.date), source: 'manual' });
  };

  /** Marca como pagado el gasto fijo (o la cuota) de este mes. */
  const payFixed = (event: CalendarEvent) => {
    const fixed = db.fixedExpenses.find((f) => f.id === event.refId);
    const draft = fixed ? fixedPaymentDraft(fixed, today) : null;
    if (!draft) return;
    haptic.success();
    db.addTx(draft);
  };

  /** Botón de cada cosa del calendario: lo que se puede hacer con ella desde aquí. */
  const action = (event: CalendarEvent): { label: string; run: () => void } | null => {
    if (event.done) return null;
    const eventMonth = monthKey(event.date);
    const amount = (event.amount / 100).toFixed(2);
    switch (event.kind) {
      case 'sueldo':
        return event.date <= today ? { label: 'Ya me pagaron', run: () => receivePay(event) } : null;
      case 'extra':
        return eventMonth <= current ? { label: 'Ya lo recibí', run: () => receiveExtra(event) } : null;
      case 'fijo':
        return eventMonth === current ? { label: 'Marcar como pagado', run: () => payFixed(event) } : null;
      case 'planeado':
        return eventMonth <= current ? { label: 'Ya lo pagué', run: () => pay(event) } : null;
      case 'tarjeta':
        return { label: 'Pagar tarjeta', run: () => router.push({ pathname: '/movimiento', params: { type: 'pago_tarjeta', cardId: event.refId, amount } }) };
      case 'deuda':
        return { label: event.flow === 'in' ? 'Registrar que me pagó' : 'Abonar', run: () => router.push({ pathname: '/movimiento', params: { type: 'abono_deuda', debtId: event.refId } }) };
      case 'ahorro':
        return event.date <= today || eventMonth === current ? { label: 'Apartar', run: () => router.push({ pathname: '/movimiento', params: { type: 'aporte', envelopeId: event.refId, amount } }) } : null;
    }
  };

  // Movimientos reales de ese día.
  const dayTx = db.transactions.filter((tx) => tx.date === day.date).sort(newestFirst);

  // Lo que viene: bonos y gastos planeados de los próximos 12 meses, en orden.
  const coming = [
    ...upcomingExtras(db, today, 13)
      .filter((o) => !o.received && o.extra.frequency !== 'mensual')
      .map((o) => ({ id: `e-${o.extra.id}-${o.key}`, date: o.date, title: o.extra.name, amount: o.extra.amount, income: true })),
    ...plannedOccurrences(db, current, 13)
      .filter((o) => !o.paid)
      .map((o) => ({ id: `p-${o.planned.id}-${o.key}`, date: o.date, title: o.planned.name, amount: o.planned.amount, income: false })),
  ]
    .filter((item) => item.date >= today)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .slice(0, 8);

  const spentInMonth = calendar.days.reduce((sum, d) => sum + d.spent, 0);
  const earnedInMonth = calendar.days.reduce((sum, d) => sum + d.earned, 0);
  // Cuánto más (o menos) de lo normal sobra en un mes futuro, por bonos o gastos planeados.
  const bonus = ahead ? ahead.saving - monthlyMargin(db, today) : 0;

  return (
    <Screen
      title="Calendario"
      subtitle="Lo que entra y sale cada día"
      tabs
      back={!db.settings.tabs.includes('calendario')}>
      <View style={styles.monthBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" hitSlop={12} onPress={() => go(shiftMonthKey(month, -1))}>
          <Ionicons name="chevron-back-circle" size={30} color={colors.primary} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Ir a hoy" hitSlop={8} onPress={() => go(current)} style={styles.monthTitle}>
          <Txt variant="heading">{monthLabel(month)}</Txt>
          {month !== current ? (
            <Txt variant="small" color={colors.primary}>
              Volver a hoy
            </Txt>
          ) : null}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" hitSlop={12} onPress={() => go(shiftMonthKey(month, 1))}>
          <Ionicons name="chevron-forward-circle" size={30} color={colors.primary} />
        </Pressable>
      </View>

      <Card style={{ paddingHorizontal: space.sm, paddingVertical: space.md }}>
        <View style={styles.grid}>
          {WEEKDAYS.map((label, index) => (
            <View key={index} style={styles.cell}>
              <Txt variant="caption" muted>
                {label}
              </Txt>
            </View>
          ))}
          {Array.from({ length: calendar.leading }, (_, index) => (
            <View key={`blank-${index}`} style={styles.cell} />
          ))}
          {calendar.days.map((d) => {
            const isSelected = d.date === day.date;
            const isToday = d.date === today;
            const pending = d.events.filter((event) => !event.done);
            const dots = [
              pending.some((event) => event.flow === 'in') || d.earned > 0 ? colors.positive : null,
              pending.some((event) => event.flow === 'out') || d.spent > 0 ? colors.negative : null,
              pending.some((event) => event.flow === 'save') ? colors.primary : null,
            ].filter((dot): dot is string => dot !== null);
            return (
              <Pressable
                key={d.date}
                accessibilityRole="button"
                accessibilityLabel={formatLong(d.date)}
                accessibilityState={{ selected: isSelected }}
                onPress={() => {
                  haptic.tap();
                  setSelected(d.date);
                }}
                style={styles.cell}>
                <View
                  style={[
                    styles.day,
                    isSelected ? { backgroundColor: colors.primary } : isToday ? { borderWidth: 1.5, borderColor: colors.primary } : null,
                  ]}>
                  <Txt variant="label" color={isSelected ? colors.onPrimary : d.date < today ? colors.muted : colors.text}>
                    {Number(d.date.slice(8))}
                  </Txt>
                </View>
                <View style={styles.dots}>
                  {dots.map((dot) => (
                    <View key={dot} style={[styles.dot, { backgroundColor: dot }]} />
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.legend}>
          {[
            { color: colors.positive, label: 'Entra' },
            { color: colors.negative, label: 'Sale' },
            { color: colors.primary, label: 'Ahorro' },
          ].map((item) => (
            <View key={item.label} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              <Txt variant="small" muted>
                {item.label}
              </Txt>
            </View>
          ))}
        </View>
      </Card>

      <FadeIn>
        <Card style={{ gap: space.md, marginTop: space.md }}>
          <View style={styles.summary}>
            <View style={styles.flex}>
              <Txt variant="caption" muted>
                {month < current ? 'Entró' : 'Por entrar'}
              </Txt>
              <Money value={month < current ? earnedInMonth : calendar.toCome} variant="heading" color={colors.positive} />
            </View>
            <View style={[styles.flex, { alignItems: 'flex-end' }]}>
              <Txt variant="caption" muted>
                {month < current ? 'Gastaste' : 'Por salir'}
              </Txt>
              <Money value={month < current ? spentInMonth : calendar.toGo} variant="heading" color={colors.negative} />
            </View>
          </View>
          {outlook ? (
            <Txt variant="small" muted>
              {canProject
                ? `A tu ritmo cerrarías este mes con ${money(outlook.projected)} netos (cuentas menos tarjetas).`
                : `Si no gastas nada más, cerrarías este mes con ${money(outlook.ifNoMoreSpending)} netos (cuentas menos tarjetas).`}
            </Txt>
          ) : ahead && canProject ? (
            <>
              <Txt variant="small" muted>
                Contando tu gasto del día a día ({money(ahead.variable, { compact: true })}), ese mes {ahead.saving >= 0 ? 'te sobrarían' : 'te faltarían'}{' '}
                <Txt variant="small" color={ahead.saving >= 0 ? colors.positive : colors.negative} style={styles.strong}>
                  {money(Math.abs(ahead.saving))}
                </Txt>{' '}
                y cerrarías con{' '}
                <Txt variant="small" color={ahead.balance >= 0 ? colors.positive : colors.negative} style={styles.strong}>
                  {money(ahead.balance)}
                </Txt>{' '}
                netos.
              </Txt>
              {bonus > 0 ? (
                <View style={[styles.hint, { backgroundColor: colors.positiveSoft }]}>
                  <Txt variant="small">
                    Ese mes tienes {money(bonus)} más de lo normal.{' '}
                    {owed > 0 ? `Buen momento para abonar a tus deudas (debes ${money(owed)}) o para ahorrar.` : 'Buen momento para ahorrar o darte un gusto planeado.'}
                  </Txt>
                </View>
              ) : bonus < 0 && ahead.saving < 0 ? (
                <View style={[styles.hint, { backgroundColor: colors.warningSoft }]}>
                  <Txt variant="small">Ese mes sale más de lo que entra. Conviene ir apartando desde antes: crea una meta de ahorro con esa fecha en Apartados.</Txt>
                </View>
              ) : null}
            </>
          ) : month > current ? (
            <Txt variant="small" muted>
              {base.income <= 0
                ? 'Configura cuánto te pagan en Ajustes para ver cómo cerraría este mes.'
                : 'Con una semana de gastos registrados, aquí verás con cuánto cerrarías este mes.'}
            </Txt>
          ) : null}
        </Card>
      </FadeIn>

      <FadeIn index={1}>
        <SectionTitle title={day.date === today ? `Hoy, ${formatShort(day.date)}` : formatLong(day.date)} />
        <Card style={day.events.length > 0 ? { paddingVertical: space.xs } : undefined}>
          {day.events.length === 0 ? (
            <Txt muted>{day.date < today ? 'No había nada anotado para este día.' : 'Nada anotado para este día.'}</Txt>
          ) : (
            day.events.map((event, index) => (
              <Row
                key={event.id}
                icon={KIND[event.kind].icon}
                color={event.done ? colors.faint : tone(event)}
                title={event.title}
                subtitle={KIND[event.kind].label}
                last={index === day.events.length - 1}
                onPress={() => open(event)}
                right={<Money value={event.amount} tone={event.flow === 'in' ? 'in' : event.flow === 'out' ? 'out' : undefined} color={event.done ? colors.faint : event.flow === 'save' ? colors.primary : undefined} />}
                below={(() => {
                  const todo = action(event);
                  return event.done ? (
                    <Tag label={event.flow === 'in' ? 'Recibido' : 'Pagado'} tone="positive" />
                  ) : (
                    <View style={styles.eventBelow}>
                      {event.estimate ? <Tag label="Estimado" tone="neutral" /> : event.date < today && event.flow !== 'save' ? <Tag label="Pendiente" tone="warning" /> : null}
                      {todo ? <Button small variant="soft" icon="checkmark" label={todo.label} onPress={todo.run} style={styles.payButton} /> : null}
                    </View>
                  );
                })()}
              />
            ))
          )}
        </Card>
        {dayTx.length > 0 ? (
          <>
            <Txt variant="caption" muted style={{ marginTop: space.lg, marginBottom: space.sm }}>
              Movimientos de este día
              {day.spent > 0 || day.earned > 0 ? ` · ${[day.spent > 0 ? `gastaste ${money(day.spent)}` : '', day.earned > 0 ? `entraron ${money(day.earned)}` : ''].filter(Boolean).join(' · ')}` : ''}
            </Txt>
            <Card style={{ paddingVertical: space.xs }}>
              {dayTx.map((tx, index) => (
                <TxRow key={tx.id} db={db} tx={tx} last={index === dayTx.length - 1} />
              ))}
            </Card>
          </>
        ) : null}

        {day.date <= today ? (
          <>
            <Txt variant="caption" muted style={{ marginTop: space.lg }}>
              {day.date === today ? 'Registrar lo de hoy' : 'Registrar algo de este día'}
            </Txt>
            <View style={styles.actions}>
              <Button small icon="remove-circle-outline" label="Registrar gasto" onPress={() => router.push({ pathname: '/movimiento', params: { type: 'gasto', date: day.date } })} style={styles.flex} />
              <Button small variant="soft" icon="add-circle-outline" label="Registrar ingreso" onPress={() => router.push({ pathname: '/movimiento', params: { type: 'ingreso', date: day.date } })} style={styles.flex} />
            </View>
          </>
        ) : null}
        {day.date >= today ? (
          <>
            <Txt variant="caption" muted style={{ marginTop: space.lg }}>
              {day.date === today ? 'Planear algo que aún no pasa' : 'Planear para este día'}
            </Txt>
            <View style={styles.actions}>
              <Button small variant="soft" icon="remove-circle-outline" label="Gasto este día" onPress={() => router.push({ pathname: '/gasto-planeado', params: { date: day.date } })} style={styles.flex} />
              <Button small variant="soft" icon="add-circle-outline" label="Ingreso este día" onPress={() => router.push({ pathname: '/ingreso-extra', params: { date: day.date } })} style={styles.flex} />
            </View>
          </>
        ) : null}
      </FadeIn>

      <FadeIn index={2}>
        <SectionTitle title="Lo que viene" />
        {coming.length === 0 ? (
          <Card>
            <Txt muted>
              Anota aquí lo que ya sabes que viene: el bono de julio, el aguinaldo de diciembre, la matrícula, un viaje. Toca un día del calendario y elige “Gasto este día” o “Ingreso este día”.
            </Txt>
          </Card>
        ) : (
          <Card style={{ paddingVertical: space.xs }}>
            {coming.map((item, index) => (
              <Row
                key={item.id}
                icon={item.income ? 'add-circle' : 'calendar'}
                color={item.income ? colors.positive : colors.negative}
                title={item.title}
                subtitle={`${formatShort(item.date)} · ${relativeDay(item.date, today)}`}
                last={index === coming.length - 1}
                onPress={() => go(monthKey(item.date), item.date)}
                right={<Money value={item.amount} tone={item.income ? 'in' : 'out'} />}
              />
            ))}
          </Card>
        )}
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  strong: { fontWeight: '700' },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  monthTitle: { alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 3, height: 6, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: space.lg, marginTop: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  summary: { flexDirection: 'row', gap: space.md },
  hint: { padding: space.md, borderRadius: 12 },
  actions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  eventBelow: { alignItems: 'flex-start', gap: 4 },
  payButton: { alignSelf: 'flex-start', marginTop: 4 },
});

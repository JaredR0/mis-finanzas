import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { formatShort, monthKey, monthLabel, relativeDay } from '@/core/dates';
import { type ExtraOccurrence, extraIncomeReceived, upcomingExtras } from '@/core/extraIncome';
import { baseline } from '@/core/forecast';
import { useDb, useMoney, useToday } from '@/data/hooks';
import { Button, Card, confirm, EmptyState, FadeIn, haptic, IconBadge, IconButton, Money, PressableScale, Screen, SectionTitle, space, Tag, Txt, useColors } from '@/ui';

const FREQUENCY = { unica: 'Una vez', mensual: 'Cada mes', anual: 'Cada año' } as const;

/** Ingresos extra: lo que entra además del sueldo base. */
export default function ExtraIncomeScreen({ embedded }: { embedded?: boolean }) {
  const db = useDb();
  const today = useToday();
  const colors = useColors();
  const money = useMoney();
  const month = monthKey(today);
  const salary = baseline(db, today).income;
  const receivedThisMonth = extraIncomeReceived(db, month);
  // Cada ingreso aparece una vez: su próxima fecha (o la de este mes si aún no se confirma).
  const next = new Map<string, ExtraOccurrence>();
  for (const occurrence of upcomingExtras(db, today, 13)) {
    if (occurrence.received && occurrence.extra.frequency !== 'unica') continue;
    if (!next.has(occurrence.extra.id)) next.set(occurrence.extra.id, occurrence);
  }
  const listed = db.extraIncomes.map((extra) => ({ extra, occurrence: next.get(extra.id) }));

  const receive = (o: ExtraOccurrence) => {
    const accountId = o.extra.accountId ?? db.settings.payAccountId ?? db.accounts[0]?.id;
    if (!accountId) return;
    haptic.success();
    db.addTx({
      type: 'ingreso',
      amount: o.extra.amount,
      date: today,
      note: o.extra.name,
      accountId,
      categoryId: db.categories.find((c) => c.key === 'otros_ingresos')?.id,
      extraId: o.extra.id,
      extraPeriod: o.key,
      source: 'manual',
    });
  };

  const undo = (o: ExtraOccurrence) => {
    const received = o.received;
    if (!received) return;
    confirm({
      title: `¿Quitar el ingreso de ${o.extra.name}?`,
      message: 'Se borra el ingreso registrado y vuelve a quedar como esperado.',
      confirmLabel: 'Quitar',
      destructive: true,
      onConfirm: () => db.removeTx(received.id),
    });
  };

  return (
    <Screen
      title="Ingresos extra"
      subtitle="Lo que entra además de tu sueldo"
      back
      embedded={embedded}
      right={<IconButton icon="add" label="Nuevo ingreso extra" onPress={() => router.push('/ingreso-extra')} />}>
      <FadeIn>
        <Card style={styles.summary}>
          <View style={styles.cell}>
            <Txt variant="caption" muted>
              Sueldo base al mes
            </Txt>
            <Money value={salary} variant="heading" />
          </View>
          <View style={[styles.cell, { alignItems: 'flex-end' }]}>
            <Txt variant="caption" muted>
              Extra recibido en {monthLabel(month).split(' ')[0].toLowerCase()}
            </Txt>
            <Money value={receivedThisMonth} variant="heading" color={receivedThisMonth > 0 ? colors.positive : colors.muted} />
          </View>
        </Card>
      </FadeIn>

      {db.extraIncomes.length === 0 ? (
        <EmptyState
          icon="add-circle"
          title="Sin ingresos extra"
          message="Agrega lo que no es parte de tu sueldo: bono 14, aguinaldo, trabajos aparte o una venta. Se suman a tu proyección el mes que toca."
          action="Agregar ingreso extra"
          onAction={() => router.push('/ingreso-extra')}
        />
      ) : (
        <FadeIn index={1}>
          <SectionTitle title="Esperados" />
          <View style={{ gap: space.md }}>
            {listed.map(({ extra, occurrence }) => {
              const due = occurrence && !occurrence.received && occurrence.date <= today;
              return (
                <Card key={extra.id} style={{ gap: space.md }}>
                  <PressableScale onPress={() => router.push({ pathname: '/ingreso-extra', params: { id: extra.id } })} style={styles.head}>
                    <IconBadge icon="cash" color={extra.active ? colors.positive : colors.faint} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt variant="bodyStrong" numberOfLines={1}>
                        {extra.name}
                      </Txt>
                      <Txt variant="small" muted numberOfLines={1}>
                        {!extra.active
                          ? 'En pausa'
                          : occurrence
                            ? `${FREQUENCY[extra.frequency]} · ${formatShort(occurrence.date)} · ${relativeDay(occurrence.date, today)}`
                            : `${FREQUENCY[extra.frequency]} · ya pasó`}
                      </Txt>
                    </View>
                    <View style={{ alignItems: 'flex-end', gap: 3 }}>
                      <Money value={extra.amount} tone="in" />
                      {occurrence?.received ? <Tag label="Recibido" tone="positive" /> : due ? <Tag label="Ya toca" tone="warning" /> : null}
                    </View>
                  </PressableScale>
                  {extra.active && occurrence ? (
                    occurrence.received ? (
                      <Button small variant="ghost" label="Quitar ingreso" onPress={() => undo(occurrence)} />
                    ) : occurrence.key === month || due ? (
                      <Button small variant="soft" icon="checkmark" label={`Ya lo recibí: sumar ${money(extra.amount)}`} onPress={() => receive(occurrence)} />
                    ) : null
                  ) : null}
                </Card>
              );
            })}
          </View>
          <Txt variant="small" muted style={{ marginTop: space.lg }}>
            Un ingreso que no esperabas se registra con el botón +, tipo Ingreso, categoría “Otros ingresos”.
          </Txt>
        </FadeIn>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { flexDirection: 'row', gap: space.md },
  cell: { flex: 1, gap: 2 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});

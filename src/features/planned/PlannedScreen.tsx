import { router } from 'expo-router';
import { View } from 'react-native';

import { formatShort, monthKey, relativeDay, shiftMonthKey } from '@/core/dates';
import { type PlannedOccurrence, plannedOccurrences } from '@/core/planned';
import { useDb, useMoney, useToday } from '@/data/hooks';
import { Button, Card, EmptyState, FadeIn, haptic, IconButton, Money, Row, Screen, space, Tag, Txt, useColors } from '@/ui';

/** Gastos planeados: lo que ya sabes que vas a pagar en una fecha. */
export default function PlannedScreen({ embedded }: { embedded?: boolean }) {
  const db = useDb();
  const today = useToday();
  const colors = useColors();
  const money = useMoney();
  const add = () => router.push('/gasto-planeado');
  // Desde el mes pasado (por si quedó uno sin pagar) y un año hacia adelante.
  const upcoming = plannedOccurrences(db, shiftMonthKey(monthKey(today), -1), 14).filter((o) => !o.paid || o.key === monthKey(today));
  const pending = upcoming.filter((o) => !o.paid);
  const total = pending.reduce((sum, o) => sum + o.planned.amount, 0);

  const pay = (o: PlannedOccurrence) => {
    const accountId = o.planned.cardId ? undefined : (o.planned.accountId ?? db.settings.payAccountId ?? db.accounts[0]?.id);
    if (!o.planned.cardId && !accountId) return;
    haptic.success();
    db.addTx({
      type: 'gasto',
      amount: o.planned.amount,
      date: today,
      note: o.planned.name,
      accountId,
      cardId: o.planned.cardId,
      categoryId: o.planned.categoryId,
      plannedId: o.planned.id,
      plannedPeriod: o.key,
      source: 'manual',
    });
  };

  return (
    <Screen
      title="Gastos planeados"
      subtitle="Lo que ya sabes que viene"
      back
      embedded={embedded}
      right={<IconButton icon="add" label="Nuevo gasto planeado" onPress={add} />}>
      {upcoming.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="Sin gastos planeados"
          message="Anota lo que ya sabes que vas a pagar en una fecha: la matrícula, el seguro, un viaje, un regalo. La app lo aparta cuando se acerca y lo cuenta en tu proyección."
          action="Agregar gasto planeado"
          onAction={add}
        />
      ) : (
        <FadeIn>
          <Txt variant="small" muted style={{ marginBottom: space.sm }}>
            {pending.length === 0 ? 'Todo pagado por ahora.' : `${pending.length} por pagar · ${money(total)} en los próximos 12 meses`}
          </Txt>
          <Card style={{ paddingVertical: space.xs }}>
            {upcoming.map((o, index) => (
              <Row
                key={`${o.planned.id}-${o.key}`}
                icon="calendar"
                color={o.paid ? colors.faint : o.date < today ? colors.negative : colors.primary}
                title={o.planned.name}
                subtitle={`${formatShort(o.date)} · ${relativeDay(o.date, today)}${o.planned.frequency === 'anual' ? ' · cada año' : ''}`}
                last={index === upcoming.length - 1}
                onPress={() => router.push({ pathname: '/gasto-planeado', params: { id: o.planned.id } })}
                right={<Money value={o.planned.amount} tone={o.paid ? undefined : 'out'} color={o.paid ? colors.faint : undefined} />}
                below={
                  o.paid ? (
                    <Tag label="Pagado" tone="positive" />
                  ) : o.date <= today ? (
                    <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
                      <Button small variant="soft" icon="checkmark" label="Ya lo pagué" onPress={() => pay(o)} />
                    </View>
                  ) : null
                }
              />
            ))}
          </Card>
          <Txt variant="small" muted style={{ marginTop: space.md }}>
            También puedes agregarlos tocando un día en el Calendario.
          </Txt>
        </FadeIn>
      )}
    </Screen>
  );
}

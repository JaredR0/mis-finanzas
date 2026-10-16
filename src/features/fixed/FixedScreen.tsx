import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { describeFixedSchedule, fixedCostIn, fixedEvery, fixedOccurrencesInMonth, fixedPaymentFor, nextFixedDue } from '@/core/fixed';
import { formatShort, monthKey, monthLabel, relativeDay } from '@/core/dates';
import type { FixedExpense } from '@/core/types';
import { useDb, useMoney, useToday } from '@/data/hooks';
import {
  Button,
  Card,
  confirm,
  EmptyState,
  FadeIn,
  haptic,
  IconBadge,
  IconButton,
  iconName,
  Money,
  notify,
  PressableScale,
  ProgressBar,
  Screen,
  SectionTitle,
  space,
  Tag,
  Txt,
  useColors,
} from '@/ui';

import { fixedPaymentDraft } from './pay';

/** Gastos fijos del mes: qué ya se pagó y qué falta. */
export default function FixedScreen({ embedded }: { embedded?: boolean }) {
  const db = useDb();
  const inBar = db.settings.tabs.includes('fijos');
  const today = useToday();
  const colors = useColors();
  const money = useMoney();
  const month = monthKey(today);

  const txs = db.transactions;
  const occurrences = (f: FixedExpense) => fixedOccurrencesInMonth(f, month);
  const nextDue = (f: FixedExpense) => nextFixedDue(f, today, txs);
  const active = db.fixedExpenses
    .filter((f) => occurrences(f).length > 0)
    .sort((a, b) => (nextDue(a)?.date ?? '9999').localeCompare(nextDue(b)?.date ?? '9999'));
  // En pausa, o fuera de sus fechas (cuotas que aún no empiezan o ya terminaron).
  const paused = db.fixedExpenses.filter((f) => occurrences(f).length === 0);
  const total = active.reduce((sum, f) => sum + fixedCostIn(f, month), 0);
  const paid = active.reduce((sum, f) => sum + occurrences(f).filter((o) => fixedPaymentFor(f, o, txs)).length * f.amount, 0);

  /** Pagos de este gasto fijo que cuentan para este mes, del más nuevo al más viejo. */
  const paymentsThisMonth = (f: FixedExpense) =>
    occurrences(f)
      .map((o) => fixedPaymentFor(f, o, txs))
      .filter((tx): tx is NonNullable<typeof tx> => !!tx)
      .reverse();

  const pay = (fixed: FixedExpense) => {
    const due = nextDue(fixed);
    const draft = due ? fixedPaymentDraft(fixed, today, due.key) : null;
    if (!draft) {
      notify('Falta la forma de pago', 'Edita este gasto fijo y elige con qué se paga.');
      return;
    }
    haptic.success();
    db.addTx(draft);
  };

  const undo = (fixed: FixedExpense) => {
    const tx = paymentsThisMonth(fixed)[0];
    if (!tx) return;
    confirm({
      title: `¿Quitar el pago de ${fixed.name}?`,
      message: fixedEvery(fixed) === 'mes' ? 'Se borra el gasto registrado este mes.' : `Se borra el pago del ${formatShort(tx.date)}.`,
      confirmLabel: 'Quitar pago',
      destructive: true,
      onConfirm: () => db.removeTx(tx.id),
    });
  };

  const row = (fixed: FixedExpense) => {
    const monthly = fixedEvery(fixed) === 'mes';
    const occs = occurrences(fixed);
    const live = occs.length > 0;
    const paidCount = occs.filter((o) => fixedPaymentFor(fixed, o, txs)).length;
    const due = live ? nextDue(fixed) : null;
    // Mensual: listo cuando se pagó el de este mes. Semanal: muestra el próximo cobro.
    const done = monthly ? live && paidCount === occs.length : !due;
    const date = due?.date ?? occs[occs.length - 1]?.date ?? today;
    const overdue = !!due && due.date < today;
    const category = db.categories.find((c) => c.id === fixed.categoryId);
    const source = db.cards.find((c) => c.id === fixed.cardId)?.name ?? db.accounts.find((a) => a.id === fixed.accountId)?.name ?? 'Sin forma de pago';
    const when = monthly ? formatShort(date) : `${describeFixedSchedule(fixed)} · ${paidCount} de ${occs.length} este mes`;
    return (
      <Card key={fixed.id} style={styles.item}>
        <PressableScale onPress={() => router.push({ pathname: '/fijo', params: { id: fixed.id } })} style={styles.head}>
          <IconBadge icon={iconName(category?.icon, 'repeat')} color={category?.color ?? colors.primary} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="bodyStrong" numberOfLines={1}>
              {fixed.name}
            </Txt>
            <Txt variant="small" muted numberOfLines={2}>
              {live ? `${when} · ${source}` : !fixed.active ? 'En pausa' : fixed.endMonth && month > fixed.endMonth ? 'Terminado' : 'Aún no empieza'}
            </Txt>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 3 }}>
            <Money value={fixed.amount} />
            {!monthly ? (
              <Txt variant="small" muted>
                {fixedEvery(fixed) === 'semana' ? 'por semana' : 'cada 2 semanas'}
              </Txt>
            ) : null}
            {!live ? null : done ? (
              <Tag label="Pagado" tone="positive" />
            ) : overdue ? (
              <Tag label="Atrasado" tone="negative" />
            ) : (
              <Tag label={relativeDay(date, today)} tone="neutral" />
            )}
          </View>
        </PressableScale>
        {live ? (
          <>
            {done && fixed.auto ? (
              <Txt variant="small" muted>
                Se cobra solo: la app lo registró {monthly ? 'este mes' : 'esta vez'}.
              </Txt>
            ) : done ? null : fixed.auto && !overdue ? (
              <Txt variant="small" muted>
                Se cobra solo el {formatShort(date)}.
              </Txt>
            ) : (
              <Button
                small
                variant="soft"
                icon="checkmark"
                label={monthly ? 'Marcar como pagado' : `Marcar el del ${formatShort(date)} como pagado`}
                onPress={() => pay(fixed)}
              />
            )}
            {paidCount > 0 && !fixed.auto ? (
              <Button small variant="ghost" label={monthly ? 'Quitar pago' : 'Quitar el último pago'} onPress={() => undo(fixed)} />
            ) : null}
          </>
        ) : null}
      </Card>
    );
  };

  return (
    <Screen
      title="Gastos fijos"
      subtitle={embedded ? `Lo que pagas cada mes o cada semana · ${monthLabel(month)}` : monthLabel(month)}
      tabs
      back={!inBar}
      embedded={embedded}
      right={<IconButton icon="add" label="Nuevo gasto fijo" onPress={() => router.push('/fijo')} />}>
      {db.fixedExpenses.length === 0 ? (
        <EmptyState
          icon="repeat"
          title="Sin gastos fijos"
          message="Agrega lo que pagas cada mes o cada semana (renta, internet, suscripciones, gasolina) y la app lo reserva antes de decirte cuánto puedes gastar."
          action="Agregar gasto fijo"
          onAction={() => router.push('/fijo')}
        />
      ) : (
        <>
          <FadeIn>
            <Card style={{ gap: space.md }}>
              <View style={styles.between}>
                <View style={{ gap: 2 }}>
                  <Txt variant="caption" muted>
                    Pagado este mes
                  </Txt>
                  <Money value={paid} variant="heading" color={colors.positive} />
                </View>
                <View style={{ gap: 2, alignItems: 'flex-end' }}>
                  <Txt variant="caption" muted>
                    Falta
                  </Txt>
                  <Money value={total - paid} variant="heading" color={total - paid > 0 ? colors.negative : colors.muted} />
                </View>
              </View>
              <ProgressBar value={total > 0 ? paid / total : 0} color={colors.positive} />
              <Txt variant="small" muted>
                Total de fijos al mes: {money(total)}
              </Txt>
            </Card>
          </FadeIn>
          <FadeIn index={1}>
            <View style={styles.list}>{active.map(row)}</View>
          </FadeIn>
          {paused.length > 0 ? (
            <>
              <SectionTitle title="En pausa o fuera de fecha" />
              <View style={{ gap: space.md }}>{paused.map(row)}</View>
            </>
          ) : null}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: space.md, marginTop: space.lg },
  item: { gap: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
});

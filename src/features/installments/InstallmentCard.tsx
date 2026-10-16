import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { monthKey, monthLabel, monthName } from '@/core/dates';
import { evaluatePlan, installmentProgress } from '@/core/installments';
import type { InstallmentPlan } from '@/core/types';
import { useDb, useMoney, useToday } from '@/data/hooks';
import { fixedPaymentDraft } from '@/features/fixed/pay';
import { Button, Card, haptic, IconBadge, Money, notify, PressableScale, ProgressBar, space, Tag, Txt, useColors } from '@/ui';

import { VERDICT_LABEL, VERDICT_TONE } from './verdict';

/** Tarjeta de una compra a cuotas: cuánto es al mes, cuántas lleva, cuánto falta y el botón para pagar la del mes. */
export function InstallmentCard({ plan }: { plan: InstallmentPlan }) {
  const db = useDb();
  const today = useToday();
  const colors = useColors();
  const money = useMoney();
  const isActive = plan.status === 'activa';
  const e = evaluatePlan(db, plan, today);
  const p = installmentProgress(db, plan, today);
  const thisMonth = monthName(Number(monthKey(today).slice(5))).toLowerCase();
  const paidWith = p.fixed?.cardId
    ? db.cards.find((c) => c.id === p.fixed?.cardId)?.name
    : db.accounts.find((a) => a.id === p.fixed?.accountId)?.name;

  const pay = () => {
    const draft = p.fixed ? fixedPaymentDraft(p.fixed, today) : null;
    if (!draft) {
      notify('Falta la forma de pago', 'Abre esta compra y elige con qué se paga la cuota.');
      return;
    }
    haptic.success();
    db.addTx(draft);
  };

  return (
    <Card style={{ gap: space.md }}>
      <PressableScale onPress={() => router.push({ pathname: '/cuota', params: { id: plan.id } })} style={styles.head}>
        <IconBadge icon={isActive ? (p.fixed?.cardId ? 'card' : 'repeat') : 'bulb'} color={isActive ? colors.primary : colors.warning} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {plan.name}
          </Txt>
          <Txt variant="small" muted numberOfLines={1}>
            {plan.months} cuotas de {money(plan.monthly)}
            {isActive && paidWith ? ` · ${paidWith}` : ''}
          </Txt>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Money value={isActive ? p.remaining : e.total} color={isActive && p.left > 0 ? colors.negative : undefined} />
          {isActive ? (
            p.left === 0 ? <Tag label="Terminada" tone="positive" /> : <Txt variant="small" muted>por pagar</Txt>
          ) : (
            <Tag label={VERDICT_LABEL[e.verdict]} tone={VERDICT_TONE[e.verdict]} />
          )}
        </View>
      </PressableScale>
      {isActive ? (
        <>
          <ProgressBar value={p.paid / plan.months} color={colors.positive} />
          <View style={styles.between}>
            <Txt variant="small" muted>
              {p.paid} de {plan.months} cuotas · pagado {money(p.paidAmount, { compact: true })} de {money(e.total, { compact: true })}
            </Txt>
            {p.endMonth && p.left > 0 ? (
              <Txt variant="small" muted>
                hasta {monthLabel(p.endMonth).toLowerCase()}
              </Txt>
            ) : null}
          </View>
          {p.dueThisMonth ? (
            <Button small variant="soft" icon="checkmark" label={`Pagar cuota de ${thisMonth}: ${money(plan.monthly)}`} onPress={pay} />
          ) : p.paidThisMonth ? (
            <Txt variant="small" color={colors.positive}>
              La cuota de {thisMonth} ya está pagada.
            </Txt>
          ) : p.startsIn ? (
            <Txt variant="small" muted>
              La primera cuota se cobra en {monthLabel(p.startsIn).toLowerCase()}.
            </Txt>
          ) : null}
        </>
      ) : e.extra > 0 ? (
        <Txt variant="small" color={colors.warning}>
          Pagarías {money(e.extra)} más que de contado ({Math.round(e.extraRatio * 100)} %).
        </Txt>
      ) : (
        <Txt variant="small" color={colors.positive}>
          Sin recargo sobre el precio de contado.
        </Txt>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
});

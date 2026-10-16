import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { accountBalances, envelopeBalances } from '@/core/balances';
import { formatShort, relativeDay } from '@/core/dates';
import { timestamp } from '@/core/id';
import { describeStep, keepDate, planProgress, type PlanState, postpone, takenOutOfPlan } from '@/core/savingsGoal';
import type { Envelope, SavingsPlan } from '@/core/types';
import { useDb, useMoney, useToday } from '@/data/hooks';
import {
  AnimatedMoney,
  Button,
  Card,
  EmptyState,
  FadeIn,
  haptic,
  IconBadge,
  IconButton,
  iconName,
  Money,
  PressableScale,
  ProgressBar,
  radius,
  Screen,
  SectionTitle,
  space,
  Tag,
  Txt,
  useColors,
} from '@/ui';

const SECTIONS: { kind: Envelope['kind']; title: string; empty: string }[] = [
  { kind: 'ahorro', title: 'Ahorro', empty: 'Crea un apartado de ahorro para tus metas.' },
  { kind: 'guardadito', title: 'Guardaditos', empty: 'Crea guardaditos para doctores, emergencias o lo que necesites.' },
];

export default function EnvelopesScreen() {
  const db = useDb();
  const colors = useColors();
  const money = useMoney();
  const balances = envelopeBalances(db);
  const total = db.envelopes.reduce((sum, e) => sum + Math.max(0, balances[e.id] ?? 0), 0);
  const inAccounts = Object.values(accountBalances(db)).reduce((a, b) => a + b, 0);
  const uncovered = total - inAccounts;

  return (
    <Screen
      title="Apartados"
      subtitle="Dinero que ya tiene destino"
      tabs
      back={!db.settings.tabs.includes('apartados')}
      right={<IconButton icon="add" label="Nuevo apartado" onPress={() => router.push('/apartado')} />}>
      {db.envelopes.length === 0 ? (
        <EmptyState
          icon="wallet"
          title="Sin apartados"
          message="Separa dinero para ahorro, doctores o emergencias. Lo apartado deja de contarse como libre para gastar."
          action="Crear apartado"
          onAction={() => router.push('/apartado')}
        />
      ) : (
        <>
          <FadeIn>
            <View style={[styles.hero, { backgroundColor: colors.heroNeutral }]}>
              <Txt variant="caption" color="rgba(255,255,255,0.8)">
                Total apartado
              </Txt>
              <AnimatedMoney value={total} variant="display" color="#FFFFFF" />
              <Txt color="rgba(255,255,255,0.9)">
                {uncovered > 0
                  ? `Ojo: tienes ${money(uncovered)} más apartado de lo que hay en tus cuentas`
                  : 'Sigue en tus cuentas, pero no se cuenta como libre'}
              </Txt>
            </View>
          </FadeIn>

          {SECTIONS.map((section, sectionIndex) => {
            const items = db.envelopes.filter((e) => e.kind === section.kind);
            return (
              <FadeIn key={section.kind} index={sectionIndex + 1}>
                <SectionTitle title={section.title} />
                {items.length === 0 ? (
                  <Card>
                    <Txt muted>{section.empty}</Txt>
                  </Card>
                ) : (
                  <View style={{ gap: space.md }}>
                    {items.map((envelope) => (
                      <EnvelopeCard key={envelope.id} envelope={envelope} balance={balances[envelope.id] ?? 0} />
                    ))}
                  </View>
                )}
              </FadeIn>
            );
          })}
        </>
      )}
    </Screen>
  );
}

const PLAN_TAG: Record<PlanState, { label: string; tone: 'positive' | 'negative' | 'warning' | 'neutral' }> = {
  cumplida: { label: 'Meta cumplida', tone: 'positive' },
  adelantado: { label: 'Vas adelantado', tone: 'positive' },
  al_dia: { label: 'Vas al día', tone: 'positive' },
  atrasado: { label: 'Vas atrasado', tone: 'warning' },
  vencida: { label: 'Se pasó la fecha', tone: 'negative' },
};

function EnvelopeCard({ envelope, balance }: { envelope: Envelope; balance: number }) {
  const money = useMoney();
  const colors = useColors();
  const db = useDb();
  const today = useToday();
  const plan = envelope.plan;
  // Lo que se sacó de este ahorro desde que empezó (o se reajustó) el plan.
  const takenOut = takenOutOfPlan(envelope, db.transactions);
  const progress = planProgress(envelope, balance, today, takenOut);
  const adjust = (next: SavingsPlan | null) => {
    if (!next) return;
    haptic.success();
    db.save('envelopes', { ...envelope, plan: next });
  };
  const hasTarget = envelope.target > 0;
  const reached = hasTarget && balance >= envelope.target;
  return (
    <Card style={{ gap: space.md }}>
      <PressableScale onPress={() => router.push({ pathname: '/apartado', params: { id: envelope.id } })} style={styles.head}>
        <IconBadge icon={iconName(envelope.icon, 'wallet')} color={envelope.color} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {envelope.name}
          </Txt>
          <Txt variant="small" muted>
            {hasTarget ? (reached ? '¡Meta alcanzada!' : `Meta ${money(envelope.target, { compact: true })}`) : 'Sin meta'}
          </Txt>
        </View>
        <Money value={balance} variant="heading" color={balance < 0 ? colors.negative : undefined} />
      </PressableScale>
      {hasTarget ? <ProgressBar value={balance / envelope.target} color={envelope.color} /> : null}
      {plan && progress ? (
        <View style={{ gap: space.sm }}>
          <View style={styles.planHead}>
            <Tag label={PLAN_TAG[progress.state].label} tone={PLAN_TAG[progress.state].tone} />
            <Txt variant="small" muted style={{ flex: 1, textAlign: 'right' }} numberOfLines={1}>
              Para el {formatShort(plan.targetDate)} · {money(plan.amount, { compact: true })} {describeStep(plan.step)}
            </Txt>
          </View>
          {progress.state !== 'cumplida' && progress.nextDate ? (
            <Txt variant="small" muted>
              Próximo aporte: {formatShort(progress.nextDate)} ({relativeDay(progress.nextDate, today)}) · faltan {money(progress.missing)}
            </Txt>
          ) : null}
          {progress.needsAdjustment ? (
            <View style={[styles.adjust, { backgroundColor: colors.warningSoft }]}>
              <Txt variant="bodyStrong">
                {progress.state === 'vencida'
                  ? 'La fecha llegó y aún falta'
                  : takenOut > 0
                    ? `Sacaste ${money(takenOut)} de este ahorro`
                    : 'Con el aporte actual no llegas a tiempo'}
              </Txt>
              <Txt variant="small">¿Quieres mantener la fecha o aplazarla?</Txt>
              <Button
                small
                label={`Mantener: ${money(progress.keepDateAmount)} ${describeStep(plan.step)}`}
                onPress={() => adjust(keepDate(envelope, balance, today, { takenOut, now: timestamp() }))}
              />
              <Button
                small
                variant="soft"
                label={`Aplazar al ${formatShort(progress.postponedDate)} (mismo aporte)`}
                onPress={() => adjust(postpone(envelope, balance, today, { takenOut, now: timestamp() }))}
              />
            </View>
          ) : progress.state === 'atrasado' ? (
            <Txt variant="small" color={colors.warning}>
              Te falta aportar {money(-progress.gap)} para ponerte al día.
            </Txt>
          ) : null}
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button
          small
          variant="soft"
          label="Apartar"
          icon="add"
          style={{ flex: 1 }}
          onPress={() =>
            router.push({
              pathname: '/movimiento',
              params: { type: 'aporte', envelopeId: envelope.id, ...(plan && progress && progress.missing > 0 ? { amount: (Math.min(plan.amount, progress.missing) / 100).toFixed(2) } : {}) },
            })
          }
        />
        <Button
          small
          variant="soft"
          label="Sacar"
          icon="remove"
          style={{ flex: 1 }}
          disabled={balance <= 0}
          onPress={() => router.push({ pathname: '/movimiento', params: { type: 'retiro', envelopeId: envelope.id } })}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.xl, padding: space.xl, gap: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  adjust: { borderRadius: radius.md, padding: space.md, gap: space.sm },
  actions: { flexDirection: 'row', gap: space.sm },
});

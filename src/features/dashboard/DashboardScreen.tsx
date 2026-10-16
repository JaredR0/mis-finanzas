import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ReactNode } from 'react';

import { envelopeBalances, paydayPrompt, type UpcomingItem } from '@/core/balances';
import { budgetAlerts } from '@/core/budget';
import { cardStatus } from '@/core/creditCard';
import { monthEndOutlook } from '@/core/forecast';
import { addDays, formatLong, formatShort, relativeDay, monthKey } from '@/core/dates';
import type { ISODate } from '@/core/types';
import { useDb, useMoney, useOverview, useToday } from '@/data/hooks';
import { GoalCard } from '@/features/forecast/GoalCard';
import { newestFirst, TxRow } from '@/features/shared/TxList';
import {
  AnimatedMoney,
  Button,
  Card,
  EmptyState,
  FadeIn,
  haptic,
  IconButton,
  type IconName,
  iconName,
  Money,
  ProgressBar,
  radius,
  Row,
  Screen,
  SectionTitle,
  space,
  Tag,
  Txt,
  useColors,
} from '@/ui';

const UPCOMING_ICON: Record<UpcomingItem['kind'], IconName> = { tarjeta: 'card', fijo: 'repeat', deuda: 'trending-down', planeado: 'calendar' };

export default function DashboardScreen() {
  const colors = useColors();
  const db = useDb();
  const today = useToday();
  const money = useMoney();
  const o = useOverview(today);

  const payday = paydayPrompt(db, today);
  const toReview = db.transactions.filter((tx) => tx.needsReview);
  const recent = [...db.transactions].sort(newestFirst).slice(0, 5);
  const next = o.upcoming.slice(0, 6);
  const heroColor = o.free >= 0 ? colors.heroPositive : colors.heroNegative;
  const title = formatLong(today);

  if (db.accounts.length === 0) {
    return (
      <Screen title="Inicio" tabs>
        <EmptyState
          icon="wallet"
          title="Agrega tu primera cuenta"
          message="Registra cuánto dinero tienes hoy para empezar a llevar el control."
          action="Agregar cuenta"
          onAction={() => router.push('/cuenta')}
        />
      </Screen>
    );
  }

  const registerPay = (date: ISODate) => {
    haptic.success();
    db.addTx({
      type: 'ingreso',
      amount: db.settings.payAmount,
      date: today,
      note: 'Pago de salario',
      accountId: db.settings.payAccountId ?? db.accounts[0].id,
      categoryId: db.categories.find((c) => c.key === 'salario')?.id,
      payDate: date,
      source: 'manual',
    });
  };

  const rows: { label: string; hint?: string; value: number; icon: IconName }[] = [
    { label: 'En tus cuentas', value: o.inAccounts, icon: 'business' },
    { label: 'Apartados', hint: 'Ahorro y guardaditos', value: -o.inEnvelopes, icon: 'wallet' },
    { label: 'Tarjetas', hint: 'Vencen antes de tu pago', value: -o.cardsDue, icon: 'card' },
    { label: 'Gastos fijos', hint: 'Pendientes antes de tu pago', value: -o.fixedDue, icon: 'repeat' },
    { label: 'Deudas', hint: 'Vencen antes de tu pago', value: -o.debtsDue, icon: 'trending-down' },
    { label: 'Gastos planeados', hint: 'Caen antes de tu pago', value: -o.plannedDue, icon: 'calendar' },
  ];
  const breakdown = rows.filter((row, index) => index === 0 || row.value !== 0);

  const envelopeTotals = envelopeBalances(db);
  const alerts = budgetAlerts(db, monthKey(today));
  // Cada sección de Inicio por separado; el usuario elige cuáles se ven y en qué orden (Más → Apariencia).
  const sections: Record<string, ReactNode> = {
    meta: (
      <View style={{ marginTop: space.lg }}>
        <GoalCard outlook={monthEndOutlook(db, today)} action />
      </View>
    ),
    calculo: (
      <>
        <SectionTitle title="Cómo se calcula" />
        <Card style={{ paddingVertical: space.xs }}>
          {breakdown.map((row) => (
            <Row
              key={row.label}
              icon={row.icon}
              color={row.value < 0 ? colors.negative : colors.positive}
              title={row.label}
              subtitle={row.hint}
              right={<Money value={row.value} toned sign={row.value > 0} />}
            />
          ))}
          <View style={styles.totalRow}>
            <Txt variant="bodyStrong">Libre para gastar</Txt>
            <Money value={o.free} toned variant="heading" />
          </View>
        </Card>
      </>
    ),
    proximos: (
      <>
        <SectionTitle title="Próximos pagos" action="Tarjetas" onAction={() => router.push('/tarjetas')} />
        {next.length === 0 ? (
          <Card>
            <Txt muted>No tienes pagos próximos. Agrega tus tarjetas y gastos fijos para verlos aquí.</Txt>
          </Card>
        ) : (
          <Card style={{ paddingVertical: space.xs }}>
            {next.map((item, index) => (
              <Row
                key={item.key}
                icon={UPCOMING_ICON[item.kind]}
                color={item.overdue ? colors.negative : item.beforePayday ? colors.warning : colors.primary}
                title={item.title}
                subtitle={`${formatShort(item.date)} · ${relativeDay(item.date, today)}`}
                last={index === next.length - 1}
                onPress={() => router.push(item.kind === 'tarjeta' ? '/tarjetas' : item.kind === 'fijo' ? '/fijos' : item.kind === 'planeado' ? '/calendario' : '/deudas')}
                below={
                  item.overdue ? (
                    <Tag label="Vencido" tone="negative" />
                  ) : item.estimate ? (
                    <Tag label="Estimado" tone="neutral" />
                  ) : item.beforePayday ? (
                    <Tag label="Antes de tu pago" tone="warning" />
                  ) : (
                    <Tag label="Con tu próximo pago" tone="neutral" />
                  )
                }
                right={<Money value={item.amount} />}
              />
            ))}
          </Card>
        )}
      </>
    ),
    tarjetas: (
      <>
        <SectionTitle title="Mis tarjetas" action="Ver" onAction={() => router.push('/tarjetas')} />
        {db.cards.length === 0 ? (
          <Card>
            <Txt muted>Aún no has agregado tarjetas.</Txt>
          </Card>
        ) : (
          <Card style={{ paddingVertical: space.xs }}>
            {db.cards.map((card, index) => {
              const status = cardStatus(card, db.transactions, today);
              return (
                <Row
                  key={card.id}
                  icon="card"
                  color={card.color}
                  title={card.name}
                  subtitle={status.pending > 0 ? `Pagar ${money(status.pending)} antes del ${formatShort(status.lastDue)}` : 'Al día'}
                  last={index === db.cards.length - 1}
                  onPress={() => router.push('/tarjetas')}
                  right={<Money value={Math.max(0, status.debt)} color={status.debt > 0 ? colors.negative : colors.muted} />}
                />
              );
            })}
          </Card>
        )}
      </>
    ),
    apartados: (
      <>
        <SectionTitle title="Mis apartados" action="Ver" onAction={() => router.push('/apartados')} />
        {db.envelopes.length === 0 ? (
          <Card>
            <Txt muted>Aún no has creado apartados.</Txt>
          </Card>
        ) : (
          <Card style={{ paddingVertical: space.xs }}>
            {db.envelopes.map((envelope, index) => (
              <Row
                key={envelope.id}
                icon={iconName(envelope.icon, 'wallet')}
                color={envelope.color}
                title={envelope.name}
                subtitle={envelope.kind === 'ahorro' ? 'Ahorro' : 'Guardadito'}
                last={index === db.envelopes.length - 1}
                onPress={() => router.push('/apartados')}
                right={<Money value={envelopeTotals[envelope.id] ?? 0} />}
              />
            ))}
          </Card>
        )}
      </>
    ),
    movimientos: (
      <>
        <SectionTitle title="Últimos movimientos" action="Ver todos" onAction={() => router.push('/gastos')} />
        {recent.length === 0 ? (
          <Card>
            <Txt muted>Toca el botón + para registrar tu primer gasto.</Txt>
          </Card>
        ) : (
          <Card style={{ paddingVertical: space.xs }}>
            {recent.map((tx, index) => (
              <TxRow key={tx.id} db={db} tx={tx} last={index === recent.length - 1} />
            ))}
          </Card>
        )}
      </>
    ),
  };

  return (
    <Screen
      title="Inicio"
      subtitle={title.charAt(0).toUpperCase() + title.slice(1)}
      tabs
      right={<IconButton icon="settings-outline" label="Ajustes" onPress={() => router.push('/ajustes')} />}>
      <FadeIn>
        <View style={[styles.hero, { backgroundColor: heroColor }]}>
          <View style={[styles.bubble, styles.bubbleA]} />
          <View style={[styles.bubble, styles.bubbleB]} />
          <Txt variant="caption" color="rgba(255,255,255,0.8)">
            Libre para gastar
          </Txt>
          <AnimatedMoney value={o.free} variant="display" color={colors.onHero} style={styles.heroAmount} />
          <Txt color="rgba(255,255,255,0.9)">
            {o.free > 0
              ? `${money(o.perDay)} por día hasta tu próximo pago`
              : o.free === 0
                ? 'Ya no queda dinero libre hasta tu próximo pago'
                : `Te faltan ${money(-o.free)} para cubrir lo que viene`}
          </Txt>
          <View style={styles.heroPeriod}>
            <ProgressBar value={o.period.progress} color="#FFFFFF" track="rgba(255,255,255,0.25)" height={6} />
            <View style={styles.between}>
              <Txt variant="small" color="rgba(255,255,255,0.85)">
                Próximo pago: {formatShort(o.period.end)}
              </Txt>
              <Txt variant="small" color="rgba(255,255,255,0.85)">
                {o.period.daysLeft === 1 ? 'Falta 1 día' : `Faltan ${o.period.daysLeft} días`}
              </Txt>
            </View>
          </View>
        </View>
      </FadeIn>

      {payday ? (
        <FadeIn index={1}>
          <Card style={[styles.notice, { borderColor: colors.positive, backgroundColor: colors.positiveSoft }]}>
            <View style={styles.noticeHead}>
              <Ionicons name="cash" size={22} color={colors.positive} />
              <Txt variant="bodyStrong" style={styles.flex}>
                ¿Ya te pagaron lo del {formatShort(payday)}?
              </Txt>
            </View>
            <View style={styles.noticeActions}>
              <Button small label={`Sí, sumar ${money(db.settings.payAmount)}`} onPress={() => registerPay(payday)} style={styles.flex} />
              <Button small variant="ghost" label="Todavía no" onPress={() => db.setSettings({ payAskAfter: addDays(today, 1) })} />
            </View>
            <View style={styles.noticeActions}>
              <Txt variant="small" muted style={styles.flex}>
                Si dices “todavía no”, te vuelvo a preguntar mañana.
              </Txt>
              <Pressable
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => db.setSettings({ skippedPaydays: [...db.settings.skippedPaydays.slice(-40), payday] })}>
                <Txt variant="small" color={colors.primary}>
                  Ya lo tenía contado
                </Txt>
              </Pressable>
            </View>
          </Card>
        </FadeIn>
      ) : null}

      {toReview.length > 0 ? (
        <FadeIn index={1}>
          <Card style={styles.review} onPress={() => router.push({ pathname: '/gastos', params: { filtro: 'revisar', ts: String(Date.now()) } })}>
            <Ionicons name="sparkles" size={20} color={colors.warning} />
            <Txt variant="bodyStrong" style={styles.flex}>
              {toReview.length === 1 ? '1 movimiento por revisar' : `${toReview.length} movimientos por revisar`}
            </Txt>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Card>
        </FadeIn>
      ) : null}

      {alerts.length > 0 ? (
        <FadeIn index={1}>
          <Card
            style={[styles.notice, { borderColor: alerts[0].level === 'pasado' ? colors.negative : colors.warning, backgroundColor: alerts[0].level === 'pasado' ? colors.negativeSoft : colors.warningSoft }]}
            onPress={() => router.push('/gastos')}>
            <View style={styles.noticeHead}>
              <Ionicons name="pie-chart" size={20} color={alerts[0].level === 'pasado' ? colors.negative : colors.warning} />
              <Txt variant="bodyStrong" style={styles.flex}>
                {alerts.some((a) => a.level === 'pasado') ? 'Presupuesto superado' : 'Te estás acercando a tu presupuesto'}
              </Txt>
            </View>
            {alerts.slice(0, 3).map((alert) => (
              <Txt key={alert.category.id} variant="small">
                {alert.category.name}:{' '}
                {alert.level === 'pasado'
                  ? `te pasaste por ${money(-alert.left)}`
                  : `llevas ${Math.round(alert.ratio * 100)} %, te quedan ${money(alert.left)}`}
              </Txt>
            ))}
          </Card>
        </FadeIn>
      ) : null}

      {db.settings.homeSections.map((key, index) =>
        sections[key] ? (
          <FadeIn key={key} index={index + 2}>
            {sections[key]}
          </FadeIn>
        ) : null,
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { borderRadius: radius.xl, padding: space.xl, gap: space.xs, overflow: 'hidden' },
  heroAmount: { marginVertical: 2 },
  heroPeriod: { marginTop: space.lg, gap: space.sm },
  bubble: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.09)' },
  bubbleA: { width: 220, height: 220, right: -70, top: -90 },
  bubbleB: { width: 140, height: 140, right: 40, bottom: -90 },
  between: { flexDirection: 'row', justifyContent: 'space-between' },
  notice: { marginTop: space.lg, gap: space.md, borderWidth: 1 },
  noticeHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  noticeActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  review: { marginTop: space.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: space.md },
});

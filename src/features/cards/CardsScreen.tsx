import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { cardStatus } from '@/core/creditCard';
import { formatShort, relativeDay } from '@/core/dates';
import type { CreditCard } from '@/core/types';
import { useDb, useMoney, useToday } from '@/data/hooks';
import {
  Button,
  Card,
  EmptyState,
  FadeIn,
  IconButton,
  Money,
  PressableScale,
  ProgressBar,
  radius,
  Screen,
  space,
  Tag,
  Txt,
  useColors,
} from '@/ui';

export default function CardsScreen() {
  const db = useDb();
  const today = useToday();
  const colors = useColors();
  const total = db.cards.reduce((sum, card) => sum + Math.max(0, cardStatus(card, db.transactions, today).debt), 0);

  return (
    <Screen
      title="Tarjetas"
      subtitle={db.cards.length ? 'Cada una con su corte y su fecha de pago' : undefined}
      tabs
      back={!db.settings.tabs.includes('tarjetas')}
      right={<IconButton icon="add" label="Agregar tarjeta" onPress={() => router.push('/tarjeta')} />}>
      {db.cards.length === 0 ? (
        <EmptyState
          icon="card"
          title="Agrega tus tarjetas"
          message="Con el día de corte y el día de pago de cada una, la app te dice cuánto pagar y antes de qué fecha."
          action="Agregar tarjeta"
          onAction={() => router.push('/tarjeta')}
        />
      ) : (
        <>
          {db.cards.length > 1 ? (
            <FadeIn>
              <Card style={styles.total}>
                <Txt muted>Deuda total en tarjetas</Txt>
                <Money value={total} variant="heading" color={total > 0 ? colors.negative : colors.positive} />
              </Card>
            </FadeIn>
          ) : null}
          {db.cards.map((card, index) => (
            <FadeIn key={card.id} index={index + 1}>
              <CardBlock card={card} />
            </FadeIn>
          ))}
        </>
      )}
    </Screen>
  );
}

function CardBlock({ card }: { card: CreditCard }) {
  const db = useDb();
  const today = useToday();
  const colors = useColors();
  const money = useMoney();
  const s = cardStatus(card, db.transactions, today);
  const usageColor = s.usage !== null && s.usage > 0.8 ? colors.negative : s.usage !== null && s.usage > 0.5 ? colors.warning : colors.positive;

  return (
    <View style={styles.block}>
      <PressableScale onPress={() => router.push({ pathname: '/tarjeta', params: { id: card.id } })} style={[styles.plastic, { backgroundColor: card.color }]}>
        <View style={styles.shade} />
        <View style={[styles.shine, styles.shineA]} />
        <View style={[styles.shine, styles.shineB]} />
        <View style={styles.between}>
          <Txt variant="caption" color="rgba(255,255,255,0.85)">
            {card.bank || 'Tarjeta de crédito'}
          </Txt>
          <Ionicons name="create-outline" size={18} color="rgba(255,255,255,0.85)" />
        </View>
        <View style={{ gap: 2 }}>
          <Txt variant="heading" color="#FFFFFF" numberOfLines={1}>
            {card.name}
          </Txt>
          <Txt variant="small" color="rgba(255,255,255,0.85)">
            Corte día {card.cutoffDay} · pago día {card.paymentDay}
          </Txt>
        </View>
        <View style={styles.between}>
          <View>
            <Txt variant="small" color="rgba(255,255,255,0.8)">
              Debes hoy
            </Txt>
            <Money value={Math.max(0, s.debt)} variant="title" color="#FFFFFF" />
          </View>
          <Ionicons name="card" size={26} color="rgba(255,255,255,0.9)" />
        </View>
      </PressableScale>

      <Card style={{ gap: space.md }}>
        {s.debt < 0 ? <Tag label={`Saldo a favor ${money(-s.debt)}`} tone="positive" /> : null}

        {s.pending > 0 ? (
          <View style={[styles.due, { backgroundColor: s.overdue ? colors.negativeSoft : colors.warningSoft }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt variant="caption" color={s.overdue ? colors.negative : colors.warning}>
                {s.overdue ? 'Pago vencido' : 'Pagar para no generar intereses'}
              </Txt>
              <Money value={s.pending} variant="heading" />
              <Txt variant="small" muted>
                Antes del {formatShort(s.lastDue)} · {relativeDay(s.lastDue, today)}
              </Txt>
            </View>
            <Button
              small
              label="Pagar"
              icon="checkmark-circle"
              onPress={() =>
                router.push({ pathname: '/movimiento', params: { type: 'pago_tarjeta', cardId: card.id, amount: (s.pending / 100).toFixed(2) } })
              }
            />
          </View>
        ) : (
          <View style={[styles.due, { backgroundColor: colors.positiveSoft }]}>
            <Ionicons name="checkmark-circle" size={22} color={colors.positive} />
            <Txt style={{ flex: 1 }} color={colors.positive} variant="bodyStrong">
              Al día: no hay nada pendiente del último corte
            </Txt>
          </View>
        )}

        <View style={styles.between}>
          <View style={styles.cell}>
            <Txt variant="caption" muted>
              Ciclo actual
            </Txt>
            <Money value={s.cycleSpend} />
            <Txt variant="small" muted>
              Corta el {formatShort(s.nextCutoff)}
            </Txt>
          </View>
          <View style={[styles.cell, { alignItems: 'flex-end' }]}>
            <Txt variant="caption" muted>
              Ese ciclo se paga
            </Txt>
            <Txt variant="bodyStrong">{formatShort(s.nextDue)}</Txt>
            <Txt variant="small" muted>
              {relativeDay(s.nextDue, today)}
            </Txt>
          </View>
        </View>

        {s.usage !== null && s.available !== null ? (
          <View style={{ gap: 6 }}>
            <ProgressBar value={s.usage} color={usageColor} />
            <View style={styles.between}>
              <Txt variant="small" muted>
                Usado {Math.round(s.usage * 100)}%
              </Txt>
              <Txt variant="small" muted>
                Disponible {money(Math.max(0, s.available), { compact: true })} de {money(card.limit, { compact: true })}
              </Txt>
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            small
            variant="soft"
            label="Compra"
            icon="add"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: '/movimiento', params: { type: 'gasto', cardId: card.id } })}
          />
          {s.pending === 0 && s.debt > 0 ? (
            <Button
              small
              variant="soft"
              label="Abonar"
              icon="arrow-down-circle"
              style={{ flex: 1 }}
              onPress={() => router.push({ pathname: '/movimiento', params: { type: 'pago_tarjeta', cardId: card.id } })}
            />
          ) : null}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  total: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  block: { marginTop: space.lg, gap: space.sm },
  plastic: { borderRadius: radius.xl, padding: space.xl, gap: space.md, overflow: 'hidden', minHeight: 184, justifyContent: 'space-between' },
  shade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.22)' },
  shine: { position: 'absolute', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)' },
  shineA: { width: 240, height: 240, right: -90, top: -120 },
  shineB: { width: 160, height: 160, left: -60, bottom: -100 },
  between: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: space.md },
  due: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md },
  cell: { flex: 1, gap: 2 },
  actions: { flexDirection: 'row', gap: space.sm },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { formatShort, monthEnd } from '@/core/dates';
import type { MonthEnd } from '@/core/forecast';
import { useMoney } from '@/data/hooks';
import { Button, type IconName, radius, space, Txt, useColors } from '@/ui';

/** Texto del aviso según cómo va el mes frente a la meta. */
export function goalMessage(o: MonthEnd, money: (cents: number) => string): { title: string; detail: string } {
  const days = o.daysLeft === 1 ? 'hoy' : `en los ${o.daysLeft} días que quedan`;
  switch (o.status) {
    case 'sin_meta':
      return {
        title: '¿Con cuánto quieres llegar a fin de mes?',
        detail: 'Pon una meta y la app te dirá cada día cuánto puedes gastar todavía.',
      };
    case 'alto':
      return o.canSpend === 0
        ? { title: 'Ya no puedes gastar más', detail: `Estás justo en tu meta de ${money(o.goal)} para fin de mes.` }
        : {
            title: 'Ya no puedes gastar más',
            detail: `Aunque no gastes nada más, llegarías con ${money(o.freeIfNoMoreSpending)} libres: ${money(-o.canSpend)} menos que tu meta de ${money(o.goal)}.`,
          };
    case 'cuidado':
      return {
        title: `Aún puedes gastar ${money(o.canSpend)}`,
        detail: `Son ${money(o.canSpendPerDay)} por día. Ojo: a tu ritmo normal llegarías con ${money(o.freeProjected)} libres, por debajo de tu meta de ${money(o.goal)}.`,
      };
    case 'bien':
      return {
        title: `Aún puedes gastar ${money(o.canSpend)}`,
        detail: `Son ${money(o.canSpendPerDay)} por día ${days}, y llegas a fin de mes con ${money(o.goal)} libres.`,
      };
  }
}

/** Aviso grande de la meta de fin de mes: "aún puedes gastar…" o "ya no puedes gastar más". */
export function GoalCard({ outlook, action }: { outlook: MonthEnd; action?: boolean }) {
  const colors = useColors();
  const money = useMoney();
  const { title, detail } = goalMessage(outlook, money);
  const look: Record<MonthEnd['status'], { bg: string; fg: string; icon: IconName }> = {
    sin_meta: { bg: colors.primarySoft, fg: colors.primary, icon: 'flag-outline' },
    bien: { bg: colors.positiveSoft, fg: colors.positive, icon: 'checkmark-circle' },
    cuidado: { bg: colors.warningSoft, fg: colors.warning, icon: 'alert-circle' },
    alto: { bg: colors.negativeSoft, fg: colors.negative, icon: 'hand-left' },
  };
  const { bg, fg, icon } = look[outlook.status];
  return (
    <View style={[styles.card, { backgroundColor: bg, borderColor: fg }]}>
      <View style={styles.head}>
        <Ionicons name={icon} size={24} color={fg} />
        <Txt variant="heading" color={fg} style={styles.flex}>
          {title}
        </Txt>
      </View>
      <Txt>{detail}</Txt>
      {outlook.status !== 'sin_meta' ? (
        <Txt variant="small" muted>
          Meta para el {formatShort(monthEnd(outlook.key))}: {money(outlook.goal)}
        </Txt>
      ) : null}
      {action ? (
        <Button
          small
          variant="ghost"
          label={outlook.status === 'sin_meta' ? 'Poner mi meta' : 'Ver mi plan'}
          onPress={() => router.push('/plan')}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  action: { alignSelf: 'flex-start', marginLeft: -space.md, marginBottom: -space.sm },
});

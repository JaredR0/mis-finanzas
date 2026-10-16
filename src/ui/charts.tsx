import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import type { MonthPoint } from '@/core/reports';

import { Txt } from './primitives';
import { space, useColors } from './theme';

const CHART_HEIGHT = 130;

function Bar({ ratio, color, index }: { ratio: number; color: string; index: number }) {
  const height = useSharedValue(0);
  useEffect(() => {
    height.set(withDelay(index * 40, withTiming(ratio, { duration: 600 })));
  }, [ratio, index, height]);
  const colors = useColors();
  const style = useAnimatedStyle(() => ({ height: Math.max(3, height.get() * CHART_HEIGHT) }));
  // Un mes sin datos deja solo una marca gris en la base.
  return <Animated.View style={[styles.bar, { backgroundColor: ratio > 0 ? color : colors.border }, style]} />;
}

/** Barras de ingresos (verde) y gastos (rojo) por mes. Toca un mes para seleccionarlo. */
export function IncomeExpenseChart({ points, selected, onSelect }: { points: MonthPoint[]; selected?: string; onSelect?: (key: string) => void }) {
  const colors = useColors();
  const max = Math.max(1, ...points.map((p) => Math.max(p.income, p.expense)));
  return (
    <View>
      <View style={styles.chart}>
        {points.map((point, index) => {
          const active = point.key === selected;
          return (
            <Pressable
              key={point.key}
              accessibilityRole="button"
              accessibilityLabel={`Mes ${point.label}`}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect?.(point.key)}
              style={styles.column}>
              <View style={[styles.bars, active && { backgroundColor: colors.cardAlt }]}>
                <Bar ratio={point.income / max} color={colors.positive} index={index} />
                <Bar ratio={point.expense / max} color={colors.negative} index={index} />
              </View>
              <Txt variant="small" color={active ? colors.text : colors.muted} style={active ? { fontWeight: '700' } : undefined}>
                {point.label}
              </Txt>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.legend}>
        <Legend color={colors.positive} label="Ingresos" />
        <Legend color={colors.negative} label="Gastos" />
      </View>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Txt variant="small" muted>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  column: { flex: 1, alignItems: 'center', gap: 6 },
  bars: {
    height: CHART_HEIGHT + space.sm,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 3,
    borderRadius: 8,
    paddingBottom: 2,
  },
  bar: { width: '34%', maxWidth: 16, borderRadius: 4 },
  legend: { flexDirection: 'row', justifyContent: 'center', gap: space.lg, marginTop: space.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});

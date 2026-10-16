import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, type TextInputProps, type TextStyle, View } from 'react-native';
import Animated, { FadeIn as FadeInAnim } from 'react-native-reanimated';

import {
  addDays,
  dayInMonth,
  daysInMonth,
  formatLong,
  monthKey,
  monthLabel,
  shiftMonthKey,
  weekday,
} from '@/core/dates';
import { ICON_CHOICES, PALETTE } from '@/core/defaults';
import type { ISODate } from '@/core/types';
import { useStore } from '@/data/store';

import { haptic } from './feedback';
import { Chip, type IconName, iconName, Txt } from './primitives';
import { radius, space, useColors, withAlpha } from './theme';

/** En web quita el contorno de enfoque del navegador y deja que el campo se encoja dentro de una fila. */
const webInput = (Platform.OS === 'web' ? { outlineStyle: 'none', minWidth: 0 } : {}) as TextStyle;

/** Bloque de formulario con su etiqueta arriba. */
export function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Txt variant="caption" muted>
        {label}
      </Txt>
      {children}
      {hint ? (
        <Txt variant="small" muted>
          {hint}
        </Txt>
      ) : null}
    </View>
  );
}

export function Field({ style, ...props }: TextInputProps) {
  const colors = useColors();
  return (
    <TextInput
      placeholderTextColor={colors.faint}
      selectionColor={colors.primary}
      {...props}
      style={[styles.field, webInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.text }, style]}
    />
  );
}

/** Campo de monto grande, con el símbolo de la moneda. */
export function AmountField({ value, onChangeText, color, autoFocus }: { value: string; onChangeText: (v: string) => void; color?: string; autoFocus?: boolean }) {
  const colors = useColors();
  const symbol = useStore((s) => s.settings.currency);
  const tint = color ?? colors.text;
  return (
    <View style={[styles.amount, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Txt variant="title" color={withAlpha(tint, 0.55)}>
        {symbol}
      </Txt>
      <TextInput
        accessibilityLabel="Monto"
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/[^\d.,]/g, ''))}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder="0.00"
        placeholderTextColor={colors.faint}
        selectionColor={tint}
        autoFocus={autoFocus}
        maxLength={12}
        style={[styles.amountInput, webInput, { color: tint }]}
      />
    </View>
  );
}

/** Campo pequeño de monto (para metas, límites, saldos iniciales). */
export function MoneyField({ value, onChangeText, placeholder = '0.00' }: { value: string; onChangeText: (v: string) => void; placeholder?: string }) {
  const colors = useColors();
  const symbol = useStore((s) => s.settings.currency);
  return (
    <View style={[styles.moneyField, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Txt variant="bodyStrong" muted>
        {symbol}
      </Txt>
      <TextInput
        value={value}
        onChangeText={(text) => onChangeText(text.replace(/[^\d.,]/g, ''))}
        keyboardType="decimal-pad"
        inputMode="decimal"
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        selectionColor={colors.primary}
        maxLength={12}
        style={[styles.moneyInput, webInput, { color: colors.text }]}
      />
    </View>
  );
}

export interface Choice {
  id: string;
  label: string;
  icon?: string;
  color?: string;
}

/** Varias opciones en forma de pastillas; se elige una. */
export function ChoicePicker({ choices, value, onChange, allowNone, noneLabel = 'Ninguno' }: { choices: Choice[]; value: string | undefined; onChange: (id: string | undefined) => void; allowNone?: boolean; noneLabel?: string }) {
  return (
    <View style={styles.wrap}>
      {allowNone ? <Chip label={noneLabel} selected={value === undefined} onPress={() => onChange(undefined)} /> : null}
      {choices.map((choice) => (
        <Chip
          key={choice.id}
          label={choice.label}
          icon={choice.icon ? iconName(choice.icon) : undefined}
          color={choice.color}
          selected={value === choice.id}
          onPress={() => onChange(choice.id)}
        />
      ))}
    </View>
  );
}

const WEEK = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];

/** Fecha con atajos "Hoy / Ayer" y un calendario que se despliega. */
export function DateField({ value, onChange, today, allowNone, onClear, future }: { value: ISODate | undefined; onChange: (d: ISODate) => void; today: ISODate; allowNone?: boolean; onClear?: () => void; /** Fecha futura (vencimientos): cambia los atajos. */ future?: boolean }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(monthKey(value ?? today));
  const [y, m] = month.split('-').map(Number);
  const first = dayInMonth(y, m, 1);
  const blanks = weekday(first);
  const cells: (ISODate | null)[] = [
    ...Array<null>(blanks).fill(null),
    ...Array.from({ length: daysInMonth(y, m) }, (_, i) => dayInMonth(y, m, i + 1)),
  ];

  const pick = (date: ISODate) => {
    haptic.tap();
    onChange(date);
    setMonth(monthKey(date));
    setOpen(false);
  };

  return (
    <View style={{ gap: space.sm }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((v) => !v)}
        style={[styles.field, styles.dateRow, { backgroundColor: colors.card, borderColor: open ? colors.primary : colors.border }]}>
        <Ionicons name="calendar-outline" size={18} color={colors.muted} />
        <Txt style={{ flex: 1 }} color={value ? colors.text : colors.faint}>
          {value ? formatLong(value) : 'Sin fecha'}
        </Txt>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.faint} />
      </Pressable>
      <View style={styles.wrap}>
        {future ? (
          <>
            <Chip label="En 15 días" selected={value === addDays(today, 15)} onPress={() => pick(addDays(today, 15))} />
            <Chip label="En 30 días" selected={value === addDays(today, 30)} onPress={() => pick(addDays(today, 30))} />
          </>
        ) : (
          <>
            <Chip label="Hoy" selected={value === today} onPress={() => pick(today)} />
            <Chip label="Ayer" selected={value === addDays(today, -1)} onPress={() => pick(addDays(today, -1))} />
          </>
        )}
        {allowNone && value && onClear ? <Chip label="Quitar fecha" selected={false} onPress={onClear} /> : null}
      </View>
      {open ? (
        <Animated.View entering={FadeInAnim.duration(180)} style={[styles.calendar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.calendarHeader}>
            <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" hitSlop={12} onPress={() => setMonth(shiftMonthKey(month, -1))}>
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
            </Pressable>
            <Txt variant="bodyStrong">{monthLabel(month)}</Txt>
            <Pressable accessibilityRole="button" accessibilityLabel="Mes siguiente" hitSlop={12} onPress={() => setMonth(shiftMonthKey(month, 1))}>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </Pressable>
          </View>
          <View style={styles.grid}>
            {WEEK.map((d, i) => (
              <View key={`w${i}`} style={styles.cell}>
                <Txt variant="small" muted>
                  {d}
                </Txt>
              </View>
            ))}
            {cells.map((date, i) => {
              if (!date) return <View key={`b${i}`} style={styles.cell} />;
              const selected = date === value;
              return (
                <Pressable key={date} accessibilityRole="button" onPress={() => pick(date)} style={styles.cell}>
                  <View style={[styles.day, selected && { backgroundColor: colors.primary }, !selected && date === today && { borderWidth: 1.5, borderColor: colors.primary }]}>
                    <Txt variant="label" color={selected ? colors.onPrimary : colors.text}>
                      {Number(date.slice(8))}
                    </Txt>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Día del mes (1–31). Con `lastLabel`, el 31 se muestra como "Último". */
export function DayField({ value, onChange, lastLabel }: { value: number; onChange: (day: number) => void; lastLabel?: boolean }) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const text = lastLabel && value >= 31 ? 'Último día del mes' : `Día ${value}`;
  return (
    <View style={{ gap: space.sm }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen((v) => !v)}
        style={[styles.field, styles.dateRow, { backgroundColor: colors.card, borderColor: open ? colors.primary : colors.border }]}>
        <Ionicons name="today-outline" size={18} color={colors.muted} />
        <Txt style={{ flex: 1 }}>{text}</Txt>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.faint} />
      </Pressable>
      {open ? (
        <Animated.View entering={FadeInAnim.duration(180)} style={[styles.calendar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <DayGrid selected={[value]} onToggle={(day) => { onChange(day); setOpen(false); }} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Cuadrícula de días 1–31; marca los seleccionados. */
export function DayGrid({ selected, onToggle }: { selected: number[]; onToggle: (day: number) => void }) {
  const colors = useColors();
  return (
    <View style={styles.grid}>
      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
        const on = selected.includes(day);
        return (
          <Pressable
            key={day}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => {
              haptic.tap();
              onToggle(day);
            }}
            style={styles.cell}>
            <View style={[styles.day, on && { backgroundColor: colors.primary }]}>
              <Txt variant="label" color={on ? colors.onPrimary : colors.text}>
                {day}
              </Txt>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      {PALETTE.map((color) => (
        <Pressable
          key={color}
          accessibilityRole="button"
          accessibilityLabel={`Color ${color}`}
          accessibilityState={{ selected: value === color }}
          onPress={() => {
            haptic.tap();
            onChange(color);
          }}
          style={[styles.swatch, { backgroundColor: color, borderColor: value === color ? colors.text : 'transparent' }]}>
          {value === color ? <Ionicons name="checkmark" size={18} color="#FFFFFF" /> : null}
        </Pressable>
      ))}
    </View>
  );
}

export function IconPicker({ value, onChange, color }: { value: string; onChange: (icon: string) => void; color: string }) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      {ICON_CHOICES.map((icon) => {
        const selected = value === icon;
        return (
          <Pressable
            key={icon}
            accessibilityRole="button"
            accessibilityLabel={`Icono ${icon}`}
            accessibilityState={{ selected }}
            onPress={() => {
              haptic.tap();
              onChange(icon);
            }}
            style={[styles.iconCell, { backgroundColor: selected ? withAlpha(color, 0.18) : colors.cardAlt, borderColor: selected ? color : 'transparent' }]}>
            <Ionicons name={icon as IconName} size={20} color={selected ? color : colors.muted} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space.sm },
  field: {
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    fontSize: 16,
  },
  amount: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingVertical: space.lg,
    paddingHorizontal: space.lg,
  },
  amountInput: { fontSize: 44, fontWeight: '800', letterSpacing: -1, minWidth: 130, maxWidth: 260, padding: 0, fontVariant: ['tabular-nums'] },
  moneyField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: 50,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space.lg,
  },
  moneyInput: { flex: 1, fontSize: 16, paddingVertical: space.md, fontVariant: ['tabular-nums'] },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  calendar: { borderRadius: radius.lg, borderWidth: 1, padding: space.md },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm, paddingBottom: space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 42, alignItems: 'center', justifyContent: 'center' },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  iconCell: { width: 44, height: 44, borderRadius: radius.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useEffect } from 'react';
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type TextProps,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { haptic } from './feedback';
import { radius, space, useColors, withAlpha } from './theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type IconName = keyof typeof Ionicons.glyphMap;

/** Convierte un nombre guardado en los datos a un icono válido. */
export const iconName = (name: string | undefined, fallback: IconName = 'pricetag'): IconName =>
  name && name in Ionicons.glyphMap ? (name as IconName) : fallback;

// ───────────────────────── Texto ─────────────────────────

const textVariants = {
  display: { fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: 18, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 16, fontWeight: '400' },
  bodyStrong: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600' },
  small: { fontSize: 13, fontWeight: '400' },
  caption: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

interface TxtProps extends TextProps {
  variant?: keyof typeof textVariants;
  color?: string;
  muted?: boolean;
  center?: boolean;
  /** Números alineados (para montos). */
  tabular?: boolean;
}

export function Txt({ variant = 'body', color, muted, center, tabular, style, ...rest }: TxtProps) {
  const colors = useColors();
  return (
    <Text
      {...rest}
      style={[
        textVariants[variant],
        { color: color ?? (muted ? colors.muted : colors.text) },
        center && { textAlign: 'center' },
        tabular && { fontVariant: ['tabular-nums'] },
        style,
      ]}
    />
  );
}

// ───────────────────────── Animación de entrada ─────────────────────────

/** Aparece deslizándose; `index` escalona varios elementos seguidos. */
export function FadeIn({ index = 0, children, style }: { index?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 8) * 55).duration(380)} style={style}>
      {children}
    </Animated.View>
  );
}

// ───────────────────────── Botones y superficies ─────────────────────────

interface PressableScaleProps {
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
  accessibilityLabel?: string;
  hitSlop?: number;
}

/** Cualquier cosa que se pueda tocar: se encoge un poco al presionarla. */
export function PressableScale({ onPress, onLongPress, disabled, style, children, accessibilityLabel, hitSlop }: PressableScaleProps) {
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={hitSlop}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        scale.set(withSpring(0.97, { damping: 20, stiffness: 400 }));
      }}
      onPressOut={() => {
        scale.set(withSpring(1, { damping: 16, stiffness: 300 }));
      }}
      style={[style, animated, disabled && { opacity: 0.45 }]}>
      {children}
    </AnimatedPressable>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const colors = useColors();
  const base: StyleProp<ViewStyle> = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style];
  if (onPress) {
    return (
      <PressableScale onPress={onPress} style={base}>
        {children}
      </PressableScale>
    );
  }
  return <View style={base}>{children}</View>;
}

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'soft' | 'ghost' | 'danger';
  icon?: IconName;
  disabled?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'primary', icon, disabled, small, style }: ButtonProps) {
  const colors = useColors();
  const palette = {
    primary: { bg: colors.primary, fg: colors.onPrimary },
    soft: { bg: colors.primarySoft, fg: colors.primary },
    ghost: { bg: 'transparent', fg: colors.primary },
    danger: { bg: colors.negativeSoft, fg: colors.negative },
  }[variant];
  return (
    <PressableScale
      disabled={disabled}
      onPress={() => {
        haptic.press();
        onPress();
      }}
      style={[styles.button, small && styles.buttonSmall, { backgroundColor: palette.bg }, style]}>
      {icon ? <Ionicons name={icon} size={small ? 16 : 19} color={palette.fg} /> : null}
      <Txt variant={small ? 'label' : 'bodyStrong'} color={palette.fg}>
        {label}
      </Txt>
    </PressableScale>
  );
}

export function IconBadge({ icon, color, size = 42 }: { icon: IconName; color: string; size?: number }) {
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 3, backgroundColor: withAlpha(color, 0.16) }]}>
      <Ionicons name={icon} size={size * 0.48} color={color} />
    </View>
  );
}

/** Botón redondo con solo un icono. */
export function IconButton({ icon, onPress, label, color }: { icon: IconName; onPress: () => void; label: string; color?: string }) {
  const colors = useColors();
  return (
    <PressableScale accessibilityLabel={label} hitSlop={8} onPress={onPress} style={[styles.iconButton, { backgroundColor: colors.cardAlt }]}>
      <Ionicons name={icon} size={20} color={color ?? colors.text} />
    </PressableScale>
  );
}

// ───────────────────────── Barras de progreso ─────────────────────────

export function ProgressBar({ value, color, track, height = 8 }: { value: number; color: string; track?: string; height?: number }) {
  const colors = useColors();
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(withTiming(clamped, { duration: 700 }));
  }, [clamped, progress]);
  const fill = useAnimatedStyle(() => ({ width: `${progress.get() * 100}%` }));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track ?? colors.cardAlt, overflow: 'hidden' }}>
      <Animated.View style={[{ height, borderRadius: height / 2, backgroundColor: color }, fill]} />
    </View>
  );
}

// ───────────────────────── Selección ─────────────────────────

export function Chip({ label, selected, onPress, icon, color }: { label: string; selected: boolean; onPress: () => void; icon?: IconName; color?: string }) {
  const colors = useColors();
  const accent = color ?? colors.primary;
  return (
    <PressableScale
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      style={[
        styles.chip,
        { backgroundColor: selected ? withAlpha(accent, 0.16) : colors.cardAlt, borderColor: selected ? accent : 'transparent' },
      ]}>
      {icon ? <Ionicons name={icon} size={15} color={selected ? accent : colors.muted} /> : null}
      <Txt variant="label" color={selected ? accent : colors.muted} numberOfLines={1}>
        {label}
      </Txt>
    </PressableScale>
  );
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const colors = useColors();
  return (
    <View style={[styles.segmented, { backgroundColor: colors.cardAlt }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => {
              haptic.tap();
              onChange(option.value);
            }}
            style={[styles.segment, selected && { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Txt variant="label" color={selected ? colors.text : colors.muted} numberOfLines={1}>
              {option.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

// ───────────────────────── Listas ─────────────────────────

interface RowProps {
  icon?: IconName;
  color?: string;
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onPress?: () => void;
  chevron?: boolean;
  last?: boolean;
  /** Líneas máximas del subtítulo (1 por defecto). */
  subtitleLines?: number;
  /** Contenido extra debajo del subtítulo (p. ej. una etiqueta). */
  below?: ReactNode;
}

/** Fila estándar: icono, título/subtítulo y algo a la derecha. */
export function Row({ icon, color, title, subtitle, right, onPress, chevron, last, subtitleLines = 1, below }: RowProps) {
  const colors = useColors();
  const content = (
    <View style={[styles.row, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      {icon ? <IconBadge icon={icon} color={color ?? colors.primary} size={38} /> : null}
      <View style={styles.rowText}>
        <Txt variant="bodyStrong" numberOfLines={1}>
          {title}
        </Txt>
        {subtitle ? (
          <Txt variant="small" muted numberOfLines={subtitleLines}>
            {subtitle}
          </Txt>
        ) : null}
        {below}
      </View>
      {right}
      {chevron ? <Ionicons name="chevron-forward" size={18} color={colors.faint} /> : null}
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.6 }}>
      {content}
    </Pressable>
  );
}

export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.sectionTitle}>
      <Txt variant="heading">{title}</Txt>
      {action && onAction ? (
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onAction}>
          <Txt variant="label" color={colors.primary}>
            {action}
          </Txt>
        </Pressable>
      ) : null}
    </View>
  );
}

export function EmptyState({ icon, title, message, action, onAction }: { icon: IconName; title: string; message: string; action?: string; onAction?: () => void }) {
  const colors = useColors();
  return (
    <View style={styles.empty}>
      <IconBadge icon={icon} color={colors.primary} size={64} />
      <Txt variant="heading" center>
        {title}
      </Txt>
      <Txt muted center style={{ maxWidth: 320 }}>
        {message}
      </Txt>
      {action && onAction ? <Button label={action} onPress={onAction} icon="add" style={{ marginTop: space.sm }} /> : null}
    </View>
  );
}

/** Etiqueta pequeña de estado ("Vencido", "Por revisar"). */
export function Tag({ label, tone }: { label: string; tone: 'positive' | 'negative' | 'warning' | 'neutral' }) {
  const colors = useColors();
  const palette = {
    positive: [colors.positiveSoft, colors.positive],
    negative: [colors.negativeSoft, colors.negative],
    warning: [colors.warningSoft, colors.warning],
    neutral: [colors.cardAlt, colors.muted],
  }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: palette[0] }]}>
      <Txt variant="small" color={palette[1]} style={{ fontWeight: '700' }}>
        {label}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, padding: space.lg, borderWidth: StyleSheet.hairlineWidth },
  button: {
    minHeight: 52,
    borderRadius: radius.md,
    paddingHorizontal: space.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  buttonSmall: { minHeight: 38, paddingHorizontal: space.md, borderRadius: radius.sm },
  badge: { alignItems: 'center', justifyContent: 'center' },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: space.md,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    maxWidth: 220,
  },
  segmented: { flexDirection: 'row', borderRadius: radius.md, padding: 4, gap: 4 },
  segment: {
    flex: 1,
    minHeight: 38,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  rowText: { flex: 1, gap: 2 },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: space.xl,
    marginBottom: space.md,
  },
  empty: { alignItems: 'center', gap: space.md, paddingVertical: space.xxl * 1.5, paddingHorizontal: space.xl },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
});

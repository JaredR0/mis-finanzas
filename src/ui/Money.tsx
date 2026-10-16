import { useEffect, useRef, useState } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import type { Cents } from '@/core/types';
import { useMoney } from '@/data/hooks';

import { Txt } from './primitives';
import { toneColor, useColors } from './theme';

interface MoneyProps {
  value: Cents;
  variant?: React.ComponentProps<typeof Txt>['variant'];
  /** Verde si es positivo y rojo si es negativo. */
  toned?: boolean;
  /** Fuerza el color de gasto (rojo) o ingreso (verde) aunque el valor sea positivo. */
  tone?: 'in' | 'out';
  sign?: boolean;
  compact?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
}

/** Un monto con formato y color. */
export function Money({ value, variant = 'bodyStrong', toned, tone, sign, compact, color, style }: MoneyProps) {
  const colors = useColors();
  const money = useMoney();
  const resolved =
    color ?? (tone === 'in' ? colors.positive : tone === 'out' ? colors.negative : toned ? toneColor(colors, value) : undefined);
  const shown = tone === 'out' ? -Math.abs(value) : value;
  return (
    <Txt variant={variant} color={resolved} tabular style={style} numberOfLines={1}>
      {money(shown, { sign: sign || tone === 'in', compact })}
    </Txt>
  );
}

const DURATION = 650;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/** Monto grande que "cuenta" hacia su nuevo valor cuando cambia. */
export function AnimatedMoney({ value, ...rest }: MoneyProps) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    const began = Date.now();
    let frame = 0;
    const tick = () => {
      const t = Math.min(1, (Date.now() - began) / DURATION);
      const current = Math.round(start + (value - start) * easeOut(t));
      from.current = current;
      setShown(current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <Money value={shown} {...rest} />;
}

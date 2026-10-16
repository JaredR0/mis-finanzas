import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { addDays, diffDays, formatShort, weekday } from '@/core/dates';
import { describePayDays, DIARIO, MENSUAL, type PayFrequency, payFrequency, type PaySchedule, QUINCENAL } from '@/core/payCycle';
import type { ISODate } from '@/core/types';
import { Chip, DayGrid, space, Txt } from '@/ui';

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/** Texto de la pregunta del monto según cada cuánto se cobra. */
export const PAY_AMOUNT_LABEL: Record<PayFrequency, string> = {
  diario: 'Cuánto ganas por día',
  semanal: 'Cuánto recibes cada semana',
  catorcenal: 'Cuánto recibes cada dos semanas',
  quincenal: 'Cuánto recibes cada quincena',
  mensual: 'Cuánto recibes al mes',
  otro: 'Cuánto recibes en cada pago',
  variable: 'Cuánto calculas ganar al mes (aproximado)',
};

/** Última fecha, hoy o antes, que cae en ese día de la semana. */
const lastWeekday = (today: ISODate, day: number): ISODate => addDays(today, -((weekday(today) - day + 7) % 7));

/** Selector de cada cuánto te pagan: por día, semanal, cada dos semanas, quincenal, mensual, otros días o variable. */
export function PaySchedulePicker({ value, onChange, today }: { value: PaySchedule; onChange: (next: PaySchedule) => void; today: ISODate }) {
  const [custom, setCustom] = useState(payFrequency(value) === 'otro');
  const frequency = custom && !value.payWeekly && value.payDays.length > 0 ? 'otro' : payFrequency(value);
  const weekly = value.payWeekly;
  const set = (next: PaySchedule) => {
    setCustom(false);
    onChange(next);
  };
  const setWeekly = (every: number, day = weekly ? weekday(weekly.anchor) : 5) => set({ payDays: value.payDays.length ? value.payDays : QUINCENAL, payWeekly: { anchor: lastWeekday(today, day), every } });
  const toggleDay = (day: number) => {
    const has = value.payDays.includes(day);
    const next = has ? value.payDays.filter((d) => d !== day) : [...value.payDays, day];
    if (next.length > 0) onChange({ payDays: next.sort((a, b) => a - b) });
  };
  const recent = weekly ? lastWeekday(today, weekday(weekly.anchor)) : today;

  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.wrap}>
        <Chip label="Por día" selected={frequency === 'diario'} onPress={() => set({ payDays: DIARIO })} />
        <Chip label="Semanal" selected={frequency === 'semanal'} onPress={() => setWeekly(1)} />
        <Chip label="Cada 2 semanas" selected={frequency === 'catorcenal'} onPress={() => setWeekly(2)} />
        <Chip label="Quincenal (15 y último)" selected={frequency === 'quincenal'} onPress={() => set({ payDays: QUINCENAL })} />
        <Chip label="Mensual (último día)" selected={frequency === 'mensual'} onPress={() => set({ payDays: MENSUAL })} />
        <Chip
          label="Otros días"
          selected={frequency === 'otro'}
          onPress={() => {
            const days = value.payWeekly || value.payDays.length === 0 || payFrequency(value.payDays) === 'diario' ? QUINCENAL : value.payDays;
            onChange({ payDays: days });
            setCustom(true);
          }}
        />
        <Chip label="Variable" selected={frequency === 'variable'} onPress={() => set({ payDays: [] })} />
      </View>

      {weekly ? (
        <>
          <Txt variant="small" muted>
            ¿Qué día de la semana te pagan?
          </Txt>
          <View style={styles.wrap}>
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <Chip key={day} label={WEEKDAYS[day]} selected={weekday(weekly.anchor) === day} onPress={() => setWeekly(weekly.every, day)} />
            ))}
          </View>
          {weekly.every === 2 ? (
            <>
              <Txt variant="small" muted>
                ¿Cuál fue (o es) tu pago más reciente?
              </Txt>
              <View style={styles.wrap}>
                {[recent, addDays(recent, -7)].map((date) => {
                  // Las dos semanas posibles: se elige la que coincide con el pago real.
                  const selected = Math.abs(diffDays(weekly.anchor, date) / 7) % 2 === 0;
                  return <Chip key={date} label={date === today ? `Hoy, ${formatShort(date)}` : formatShort(date)} selected={selected} onPress={() => onChange({ payDays: value.payDays, payWeekly: { anchor: date, every: 2 } })} />;
                })}
              </View>
            </>
          ) : null}
        </>
      ) : null}

      {frequency === 'otro' ? <DayGrid selected={value.payDays} onToggle={toggleDay} /> : null}

      <Txt variant="small" muted>
        {frequency === 'diario'
          ? 'Todos los días. Si no trabajas todos los días, elige “Otros días”.'
          : frequency === 'variable'
            ? 'Sin sueldo fijo: la app usa lo que calculas ganar y, con el tiempo, el promedio de lo que de verdad te entra. Lo libre se reparte hasta fin de mes.'
            : describePayDays(value)}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
});

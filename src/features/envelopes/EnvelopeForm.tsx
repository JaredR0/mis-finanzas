import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { envelopeBalances } from '@/core/balances';
import { addDays, formatShort } from '@/core/dates';
import { PALETTE } from '@/core/defaults';
import { newId, timestamp } from '@/core/id';
import { linkedTransactions } from '@/core/mutations';
import { amountToInput, parseAmount } from '@/core/money';
import { amountNeeded, dateReached, describeStep } from '@/core/savingsGoal';
import type { Envelope, ISODate, SavingsPlan, SavingsStep } from '@/core/types';
import { useDb, useMoney, useToday } from '@/data/hooks';
import { Card, Chip, ColorPicker, confirm, DateField, Field, FormScreen, goBack, Group, haptic, IconPicker, MoneyField, notify, Segmented, space, Txt, useColors } from '@/ui';

export default function EnvelopeForm() {
  const db = useDb();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = db.envelopes.find((e) => e.id === id);

  const [name, setName] = useState(editing?.name ?? '');
  const [kind, setKind] = useState<Envelope['kind']>(editing?.kind ?? 'guardadito');
  const [target, setTarget] = useState(amountToInput(editing?.target ?? 0));
  const [icon, setIcon] = useState(editing?.icon ?? 'wallet');
  const [color, setColor] = useState(editing?.color ?? PALETTE[db.envelopes.length % PALETTE.length]);

  // Plan con fecha: cada cuánto se aporta y cuánto, para llegar a la meta el día elegido.
  const today = useToday();
  const money = useMoney();
  const colors = useColors();
  const old = editing?.plan;
  const [dated, setDated] = useState(!!old);
  const [targetDate, setTargetDate] = useState<ISODate>(old?.targetDate ?? addDays(today, 90));
  const [unit, setUnit] = useState<SavingsStep['unit']>(old?.step.unit ?? 'semana');
  const [everyText, setEveryText] = useState(String(old?.step.every ?? 1));
  const [planAmount, setPlanAmount] = useState(amountToInput(old?.amount ?? 0));

  const balance = editing ? (envelopeBalances(db)[editing.id] ?? 0) : 0;
  const targetCents = parseAmount(target) ?? 0;
  const missing = Math.max(0, targetCents - balance);
  const step: SavingsStep = { unit, every: Math.min(365, Math.max(1, Math.floor(Number(everyText) || 1))) };
  const suggested = amountNeeded(missing, today, targetDate, step);
  const chosen = parseAmount(planAmount) ?? 0;
  const amountEach = chosen > 0 ? chosen : suggested;
  const reachedOn = amountEach > 0 ? dateReached(missing, today, amountEach, step) : targetDate;

  const save = () => {
    if (!name.trim()) {
      haptic.warning();
      notify('Falta un dato', 'Ponle un nombre al apartado.');
      return;
    }
    let plan: SavingsPlan | undefined;
    if (dated) {
      const issue =
        targetCents <= 0 ? 'Escribe cuánto quieres juntar.' : targetDate <= today ? 'Elige una fecha futura para tu meta.' : missing > 0 && amountEach <= 0 ? 'Escribe cuánto vas a aportar cada vez.' : null;
      if (issue) {
        haptic.warning();
        notify('Revisa tu meta', issue);
        return;
      }
      const unchanged =
        old && old.targetDate === targetDate && old.step.unit === step.unit && old.step.every === step.every && old.amount === amountEach && editing?.target === targetCents;
      // Si cambió algo del plan, vuelve a empezar desde hoy con lo que ya hay ahorrado.
      plan = unchanged ? old : { startDate: today, targetDate, step, amount: Math.max(1, amountEach), baseBalance: balance, since: timestamp() };
    }
    db.save('envelopes', {
      id: editing?.id ?? newId(),
      name: name.trim(),
      kind,
      icon,
      color,
      target: targetCents,
      createdAt: editing?.createdAt ?? timestamp(),
      plan,
    });
    haptic.success();
    goBack();
  };

  const remove = () => {
    if (!editing) return;
    const count = linkedTransactions(db, 'envelopes', editing.id);
    confirm({
      title: `¿Eliminar ${editing.name}?`,
      message: count ? 'El dinero apartado vuelve a contarse como libre.' : undefined,
      confirmLabel: 'Eliminar',
      destructive: true,
      onConfirm: () => {
        db.remove('envelopes', editing.id);
        goBack();
      },
    });
  };

  return (
    <FormScreen title={editing ? 'Editar apartado' : 'Nuevo apartado'} onSave={save} onDelete={editing ? remove : undefined}>
      <Group label="Nombre">
        <Field value={name} onChangeText={setName} placeholder="Ej. Doctores, Viaje, Emergencias" maxLength={30} autoFocus={!editing} />
      </Group>
      <Group label="Tipo">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'guardadito', label: 'Guardadito' },
            { value: 'ahorro', label: 'Ahorro' },
          ]}
        />
      </Group>
      <Group label="Meta (opcional)" hint="Cuánto quieres juntar. Verás una barra con tu avance.">
        <MoneyField value={target} onChangeText={setTarget} />
      </Group>
      <Group label="¿Para cuándo?" hint={dated ? undefined : 'Con fecha, la app te dice cuánto apartar y cada cuánto, y te avisa si te atrasas.'}>
        <Segmented
          value={dated ? 'si' : 'no'}
          onChange={(value) => setDated(value === 'si')}
          options={[
            { value: 'no', label: 'Sin fecha' },
            { value: 'si', label: 'Con fecha' },
          ]}
        />
      </Group>
      {dated ? (
        <>
          <Group label="Fecha en que quieres tenerlo">
            <DateField value={targetDate} onChange={setTargetDate} today={today} future />
          </Group>
          <Group label="¿Cada cuánto vas a aportar?">
            <Segmented
              value={unit}
              onChange={setUnit}
              options={[
                { value: 'dia', label: 'Días' },
                { value: 'semana', label: 'Semanas' },
                { value: 'mes', label: 'Meses' },
              ]}
            />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {(unit === 'dia' ? [1, 2, 3, 15] : unit === 'semana' ? [1, 2] : [1, 2, 3]).map((n) => (
                <Chip key={n} label={describeStep({ unit, every: n })} selected={step.every === n} onPress={() => setEveryText(String(n))} />
              ))}
            </View>
            <Field
              value={everyText}
              onChangeText={(text) => setEveryText(text.replace(/\D/g, '').slice(0, 3))}
              placeholder="Otro número"
              accessibilityLabel="Cada cuántos"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={3}
            />
          </Group>
          <Group label={`Aporte ${describeStep(step)}`} hint={targetCents > 0 ? `Para llegar a tiempo necesitas ${money(suggested)} ${describeStep(step)}.` : 'Escribe primero la meta.'}>
            <MoneyField value={planAmount} onChangeText={setPlanAmount} placeholder={suggested > 0 ? (suggested / 100).toFixed(2) : '0.00'} />
          </Group>
          {targetCents > 0 && amountEach > 0 ? (
            <Card style={{ backgroundColor: reachedOn > targetDate ? colors.warningSoft : colors.positiveSoft, borderColor: reachedOn > targetDate ? colors.warning : colors.positive }}>
              <Txt>
                {missing === 0
                  ? 'Ya tienes esa cantidad apartada.'
                  : reachedOn > targetDate
                    ? `Con ${money(amountEach)} ${describeStep(step)} llegarías el ${formatShort(reachedOn)}, después de tu fecha. Sube el aporte a ${money(suggested)} o mueve la fecha.`
                    : `Con ${money(amountEach)} ${describeStep(step)} juntas ${money(missing)} para el ${formatShort(reachedOn)}.`}
              </Txt>
            </Card>
          ) : null}
        </>
      ) : null}
      <Group label="Color">
        <ColorPicker value={color} onChange={setColor} />
      </Group>
      <Group label="Icono">
        <IconPicker value={icon} onChange={setIcon} color={color} />
      </Group>
    </FormScreen>
  );
}

import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { isValidISO } from '@/core/dates';
import { newId } from '@/core/id';
import { amountToInput, parseAmount } from '@/core/money';
import type { ExtraIncome, ISODate } from '@/core/types';
import { useDb, useToday } from '@/data/hooks';
import { AmountField, ChoicePicker, confirm, DateField, Field, FormScreen, goBack, Group, haptic, notify, Segmented, useColors } from '@/ui';

const HINT: Record<ExtraIncome['frequency'], string> = {
  unica: 'Se espera una sola vez, en la fecha que elijas.',
  mensual: 'Se espera cada mes, el mismo día, a partir de esa fecha.',
  anual: 'Se espera cada año en ese mes (por ejemplo, el aguinaldo en diciembre).',
};

export default function ExtraIncomeForm() {
  const db = useDb();
  const today = useToday();
  const colors = useColors();
  const { id, date: dateParam } = useLocalSearchParams<{ id?: string; date?: string }>();
  const editing = db.extraIncomes.find((x) => x.id === id);

  const [name, setName] = useState(editing?.name ?? '');
  const [amountText, setAmountText] = useState(amountToInput(editing?.amount ?? 0));
  const [frequency, setFrequency] = useState<ExtraIncome['frequency']>(editing?.frequency ?? 'unica');
  const [date, setDate] = useState<ISODate>(editing?.date ?? (dateParam && isValidISO(dateParam) ? dateParam : today));
  const [accountId, setAccountId] = useState(editing?.accountId ?? db.settings.payAccountId ?? db.accounts[0]?.id);
  const [active, setActive] = useState(editing?.active ?? true);

  const save = () => {
    const amount = parseAmount(amountText) ?? 0;
    const issue = !name.trim() ? 'Escribe de qué es el ingreso.' : amount <= 0 ? 'Escribe un monto mayor a cero.' : null;
    if (issue) {
      haptic.warning();
      notify('Falta un dato', issue);
      return;
    }
    db.save('extraIncomes', {
      id: editing?.id ?? newId(),
      name: name.trim(),
      amount,
      frequency,
      date,
      accountId,
      active,
      createdAt: editing?.createdAt ?? Date.now(),
    });
    haptic.success();
    goBack();
  };

  const remove = () => {
    if (!editing) return;
    confirm({
      title: `¿Eliminar ${editing.name}?`,
      message: 'Deja de contarse en tu proyección. Los ingresos que ya registraste se conservan.',
      confirmLabel: 'Eliminar',
      destructive: true,
      onConfirm: () => {
        db.remove('extraIncomes', editing.id);
        goBack();
      },
    });
  };

  return (
    <FormScreen title={editing ? 'Editar ingreso extra' : 'Nuevo ingreso extra'} onSave={save} onDelete={editing ? remove : undefined}>
      <AmountField value={amountText} onChangeText={setAmountText} color={colors.positive} />
      <Group label="¿De qué es?">
        <Field value={name} onChangeText={setName} placeholder="Ej. Aguinaldo, Bono 14, Clases particulares" maxLength={40} autoFocus={!editing} />
      </Group>
      <Group label="¿Cada cuánto?" hint={HINT[frequency]}>
        <Segmented
          value={frequency}
          onChange={setFrequency}
          options={[
            { value: 'unica', label: 'Una vez' },
            { value: 'mensual', label: 'Cada mes' },
            { value: 'anual', label: 'Cada año' },
          ]}
        />
      </Group>
      <Group label={frequency === 'unica' ? '¿Cuándo lo esperas?' : 'Primera fecha'}>
        <DateField value={date} onChange={setDate} today={today} future />
      </Group>
      {db.accounts.length > 0 ? (
        <Group label="Entra a">
          <ChoicePicker
            choices={db.accounts.map((a) => ({ id: a.id, label: a.name, icon: a.kind === 'efectivo' ? 'cash' : 'business', color: a.color }))}
            value={accountId}
            onChange={(value) => value && setAccountId(value)}
          />
        </Group>
      ) : null}
      {editing ? (
        <Group label="Estado" hint="En pausa no se cuenta en la proyección.">
          <Segmented
            value={active ? 'on' : 'off'}
            onChange={(value) => setActive(value === 'on')}
            options={[
              { value: 'on', label: 'Activo' },
              { value: 'off', label: 'En pausa' },
            ]}
          />
        </Group>
      ) : null}
    </FormScreen>
  );
}

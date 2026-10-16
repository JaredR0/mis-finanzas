import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { isValidISO } from '@/core/dates';
import { newId, timestamp } from '@/core/id';
import { amountToInput, parseAmount } from '@/core/money';
import type { ISODate, PlannedExpense } from '@/core/types';
import { useDb, useToday } from '@/data/hooks';
import { AmountField, type Choice, ChoicePicker, confirm, DateField, Field, FormScreen, goBack, Group, haptic, notify, Segmented } from '@/ui';

const HINT: Record<PlannedExpense['frequency'], string> = {
  unica: 'Un gasto de una sola vez, en la fecha que elijas.',
  anual: 'Se repite cada año en ese mes (por ejemplo, la matrícula o el seguro del carro).',
};

/** Gasto planeado: algo que ya sabes que vas a pagar en una fecha. */
export default function PlannedForm() {
  const db = useDb();
  const today = useToday();
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const editing = db.plannedExpenses.find((p) => p.id === params.id);
  const startDate = params.date && isValidISO(params.date) ? params.date : today;
  const defaultAccount = db.settings.payAccountId ?? db.accounts[0]?.id;

  const [name, setName] = useState(editing?.name ?? '');
  const [amountText, setAmountText] = useState(amountToInput(editing?.amount ?? 0));
  const [frequency, setFrequency] = useState<PlannedExpense['frequency']>(editing?.frequency ?? 'unica');
  const [date, setDate] = useState<ISODate>(editing?.date ?? startDate);
  const [categoryId, setCategoryId] = useState(editing?.categoryId);
  const [paidWith, setPaidWith] = useState<string | undefined>(
    editing ? (editing.cardId ? `c:${editing.cardId}` : editing.accountId ? `a:${editing.accountId}` : undefined) : defaultAccount ? `a:${defaultAccount}` : undefined,
  );
  const [active, setActive] = useState(editing?.active ?? true);

  const paymentChoices: Choice[] = [
    ...db.accounts.map((a) => ({ id: `a:${a.id}`, label: a.name, icon: a.kind === 'efectivo' ? 'cash' : 'business', color: a.color })),
    ...db.cards.map((c) => ({ id: `c:${c.id}`, label: c.name, icon: 'card', color: c.color })),
  ];
  const categories = db.categories.filter((c) => c.kind !== 'ingreso');

  const save = () => {
    const amount = parseAmount(amountText) ?? 0;
    const issue = !name.trim() ? 'Escribe de qué es el gasto.' : amount <= 0 ? 'Escribe un monto mayor a cero.' : null;
    if (issue) {
      haptic.warning();
      notify('Falta un dato', issue);
      return;
    }
    db.save('plannedExpenses', {
      id: editing?.id ?? newId(),
      name: name.trim(),
      amount,
      frequency,
      date,
      categoryId,
      accountId: paidWith?.startsWith('a:') ? paidWith.slice(2) : undefined,
      cardId: paidWith?.startsWith('c:') ? paidWith.slice(2) : undefined,
      active,
      createdAt: editing?.createdAt ?? timestamp(),
    });
    haptic.success();
    goBack();
  };

  const remove = () => {
    if (!editing) return;
    confirm({
      title: `¿Eliminar ${editing.name}?`,
      message: 'Deja de contarse en tu calendario y en tu proyección. Si ya lo pagaste, ese gasto se conserva.',
      confirmLabel: 'Eliminar',
      destructive: true,
      onConfirm: () => {
        db.remove('plannedExpenses', editing.id);
        goBack();
      },
    });
  };

  return (
    <FormScreen title={editing ? 'Editar gasto planeado' : 'Nuevo gasto planeado'} onSave={save} onDelete={editing ? remove : undefined}>
      <AmountField value={amountText} onChangeText={setAmountText} />
      <Group label="¿De qué es?">
        <Field value={name} onChangeText={setName} placeholder="Ej. Matrícula, Seguro del carro, Regalo" maxLength={40} autoFocus={!editing} />
      </Group>
      <Group label="¿Cuándo?" hint="Cuando se acerque la fecha, la app lo aparta de lo que tienes libre para gastar.">
        <DateField value={date} onChange={setDate} today={today} future />
      </Group>
      <Group label="¿Se repite?" hint={HINT[frequency]}>
        <Segmented
          value={frequency}
          onChange={setFrequency}
          options={[
            { value: 'unica', label: 'Una vez' },
            { value: 'anual', label: 'Cada año' },
          ]}
        />
      </Group>
      {paymentChoices.length > 0 ? (
        <Group label="Lo pagarás con" hint="Si es con tarjeta, se suma a la deuda de esa tarjeta cuando lo pagues.">
          <ChoicePicker choices={paymentChoices} value={paidWith} onChange={setPaidWith} />
        </Group>
      ) : null}
      <Group label="Categoría (opcional)">
        <ChoicePicker choices={categories.map((c) => ({ id: c.id, label: c.name, icon: c.icon, color: c.color }))} value={categoryId} onChange={setCategoryId} />
      </Group>
      {editing ? (
        <Group label="Estado" hint="En pausa no se cuenta ni aparece en el calendario.">
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

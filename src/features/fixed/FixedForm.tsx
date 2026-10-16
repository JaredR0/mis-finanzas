import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { newId } from '@/core/id';
import { amountToInput, parseAmount } from '@/core/money';
import { useDb } from '@/data/hooks';
import { AmountField, type Choice, ChoicePicker, confirm, DayField, Field, FormScreen, goBack, Group, haptic, notify, Segmented } from '@/ui';

export default function FixedForm() {
  const db = useDb();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = db.fixedExpenses.find((f) => f.id === id);
  const defaultAccount = db.settings.payAccountId ?? db.accounts[0]?.id;

  const [name, setName] = useState(editing?.name ?? '');
  const [amountText, setAmountText] = useState(amountToInput(editing?.amount ?? 0));
  const [day, setDay] = useState(editing?.day ?? 1);
  const [categoryId, setCategoryId] = useState(editing?.categoryId);
  const [paidWith, setPaidWith] = useState<string | undefined>(
    editing ? (editing.cardId ? `c:${editing.cardId}` : editing.accountId ? `a:${editing.accountId}` : undefined) : defaultAccount ? `a:${defaultAccount}` : undefined,
  );
  const [active, setActive] = useState(editing?.active ?? true);
  const [auto, setAuto] = useState(editing?.auto ?? false);

  const paymentChoices: Choice[] = [
    ...db.accounts.map((a) => ({ id: `a:${a.id}`, label: a.name, icon: a.kind === 'efectivo' ? 'cash' : 'business', color: a.color })),
    ...db.cards.map((c) => ({ id: `c:${c.id}`, label: c.name, icon: 'card', color: c.color })),
  ];
  const fixedCategories = db.categories.filter((c) => c.kind === 'fijo');
  const otherCategories = db.categories.filter((c) => c.kind === 'corriente');

  const save = () => {
    const amount = parseAmount(amountText) ?? 0;
    const issue = !name.trim() ? 'Ponle un nombre.' : amount <= 0 ? 'Escribe un monto mayor a cero.' : !paidWith ? 'Elige con qué se paga.' : null;
    if (issue || !paidWith) {
      haptic.warning();
      notify('Falta un dato', issue ?? '');
      return;
    }
    db.save('fixedExpenses', {
      ...editing, // conserva las fechas de inicio y fin si es una cuota
      id: editing?.id ?? newId(),
      name: name.trim(),
      amount,
      day,
      categoryId,
      accountId: paidWith.startsWith('a:') ? paidWith.slice(2) : undefined,
      cardId: paidWith.startsWith('c:') ? paidWith.slice(2) : undefined,
      active,
      auto,
    });
    haptic.success();
    goBack();
  };

  const remove = () => {
    if (!editing) return;
    confirm({
      title: `¿Eliminar ${editing.name}?`,
      message: 'Los pagos que ya registraste se conservan como gastos.',
      confirmLabel: 'Eliminar',
      destructive: true,
      onConfirm: () => {
        db.remove('fixedExpenses', editing.id);
        goBack();
      },
    });
  };

  return (
    <FormScreen title={editing ? 'Editar gasto fijo' : 'Nuevo gasto fijo'} onSave={save} onDelete={editing ? remove : undefined}>
      <AmountField value={amountText} onChangeText={setAmountText} />
      <Group label="Nombre">
        <Field value={name} onChangeText={setName} placeholder="Ej. Internet, Renta, Netflix" maxLength={30} autoFocus={!editing} />
      </Group>
      <Group label="Se paga el">
        <DayField value={day} onChange={setDay} lastLabel />
      </Group>
      <Group label="Se paga con" hint="Si es con tarjeta, se suma a la deuda de esa tarjeta.">
        <ChoicePicker choices={paymentChoices} value={paidWith} onChange={setPaidWith} />
      </Group>
      <Group label="¿Cómo se paga?" hint={auto ? 'La app lo registra sola el día que toca, aunque no la abras ese día.' : 'Cada mes tocas “Marcar como pagado” cuando lo pagues.'}>
        <Segmented
          value={auto ? 'auto' : 'manual'}
          onChange={(v) => setAuto(v === 'auto')}
          options={[
            { value: 'manual', label: 'Lo marco yo' },
            { value: 'auto', label: 'Se cobra solo' },
          ]}
        />
      </Group>
      <Group label="Categoría">
        <ChoicePicker
          choices={[...fixedCategories, ...otherCategories].map((c) => ({ id: c.id, label: c.name, icon: c.icon, color: c.color }))}
          value={categoryId}
          onChange={setCategoryId}
        />
      </Group>
      {editing ? (
        <Group label="Estado" hint="En pausa no se reserva ni aparece en los próximos pagos.">
          <Segmented
            value={active ? 'on' : 'off'}
            onChange={(v) => setActive(v === 'on')}
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

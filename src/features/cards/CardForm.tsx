import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { dueDateFor, nextCutoff } from '@/core/creditCard';
import { formatShort } from '@/core/dates';
import { PALETTE } from '@/core/defaults';
import { newId, timestamp } from '@/core/id';
import { linkedTransactions } from '@/core/mutations';
import { amountToInput, parseAmount } from '@/core/money';
import { BANKS } from '@/core/banks';
import type { CreditCard } from '@/core/types';
import { useDb, useToday } from '@/data/hooks';
import { Card, ChoicePicker, ColorPicker, confirm, DayField, Field, FormScreen, goBack, Group, haptic, MoneyField, notify, Txt } from '@/ui';

export default function CardForm() {
  const db = useDb();
  const today = useToday();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = db.cards.find((c) => c.id === id);

  const [name, setName] = useState(editing?.name ?? '');
  const [bank, setBank] = useState(editing?.bank ?? '');
  const [cutoffDay, setCutoffDay] = useState(editing?.cutoffDay ?? 20);
  const [paymentDay, setPaymentDay] = useState(editing?.paymentDay ?? 15);
  const [limit, setLimit] = useState(amountToInput(editing?.limit ?? 0));
  const [statement, setStatement] = useState(amountToInput(editing?.openingStatement ?? 0));
  const [cycle, setCycle] = useState(amountToInput(editing?.openingCycle ?? 0));
  const [color, setColor] = useState(editing?.color ?? PALETTE[(db.cards.length * 3 + 2) % PALETTE.length]);

  const preview: CreditCard = {
    id: editing?.id ?? 'preview',
    name: name.trim(),
    bank: bank.trim(),
    cutoffDay,
    paymentDay,
    limit: parseAmount(limit) ?? 0,
    openingStatement: parseAmount(statement) ?? 0,
    openingCycle: parseAmount(cycle) ?? 0,
    openedOn: editing?.openedOn ?? today,
    color,
    createdAt: editing?.createdAt ?? 0,
  };
  const cutoff = nextCutoff(preview, today);

  const save = () => {
    if (!preview.name) {
      haptic.warning();
      notify('Falta un dato', 'Ponle un nombre a la tarjeta.');
      return;
    }
    db.save('cards', { ...preview, id: editing?.id ?? newId(), createdAt: editing?.createdAt ?? timestamp() });
    haptic.success();
    goBack();
  };

  const remove = () => {
    if (!editing) return;
    const count = linkedTransactions(db, 'cards', editing.id);
    confirm({
      title: `¿Eliminar ${editing.name}?`,
      message: count ? `También se borrarán sus ${count} movimientos.` : undefined,
      confirmLabel: 'Eliminar',
      destructive: true,
      onConfirm: () => {
        db.remove('cards', editing.id);
        goBack();
      },
    });
  };

  return (
    <FormScreen title={editing ? 'Editar tarjeta' : 'Nueva tarjeta'} onSave={save} onDelete={editing ? remove : undefined}>
      <Group label="Nombre">
        <Field value={name} onChangeText={setName} placeholder="Ej. Visa Banrural" maxLength={30} autoFocus={!editing} />
      </Group>
      <Group label="Banco (opcional)">
        <ChoicePicker
          choices={BANKS.map((b) => ({ id: b.name, label: b.name }))}
          value={BANKS.some((b) => b.name === bank) ? bank : undefined}
          onChange={(value) => setBank(value ?? '')}
        />
        <Field value={bank} onChangeText={setBank} placeholder="Otro banco" maxLength={30} />
      </Group>
      <Group label="Día de corte">
        <DayField value={cutoffDay} onChange={setCutoffDay} lastLabel />
      </Group>
      <Group label="Día límite de pago">
        <DayField value={paymentDay} onChange={setPaymentDay} lastLabel />
      </Group>
      <Card>
        <Txt variant="small" muted>
          Próximo corte: {formatShort(cutoff)}. Lo que compres hasta ese día se paga a más tardar el {formatShort(dueDateFor(preview, cutoff))}.
        </Txt>
      </Card>
      <Group label="Por pagar del último corte" hint="Lo que dice tu estado de cuenta y aún no has pagado. Déjalo en 0 si ya pagaste.">
        <MoneyField value={statement} onChangeText={setStatement} />
      </Group>
      <Group label="Compras después del último corte" hint="Lo que llevas gastado en el ciclo actual, antes de empezar a usar la app.">
        <MoneyField value={cycle} onChangeText={setCycle} />
      </Group>
      <Group label="Límite de crédito (opcional)">
        <MoneyField value={limit} onChangeText={setLimit} />
      </Group>
      <Group label="Color">
        <ColorPicker value={color} onChange={setColor} />
      </Group>
    </FormScreen>
  );
}

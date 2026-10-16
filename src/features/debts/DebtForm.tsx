import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { newId, timestamp } from '@/core/id';
import { linkedTransactions } from '@/core/mutations';
import { amountToInput, parseAmount } from '@/core/money';
import type { Debt, ISODate } from '@/core/types';
import { useDb, useToday } from '@/data/hooks';
import { AmountField, ChoicePicker, confirm, DateField, Field, FormScreen, goBack, Group, haptic, MoneyField, notify, Segmented, useColors } from '@/ui';

export default function DebtForm() {
  const db = useDb();
  const today = useToday();
  const colors = useColors();
  const params = useLocalSearchParams<{ id?: string; direction?: string }>();
  const editing = db.debts.find((d) => d.id === params.id);

  const [name, setName] = useState(editing?.name ?? '');
  const [direction, setDirection] = useState<Debt['direction']>(editing?.direction ?? (params.direction === 'me_deben' ? 'me_deben' : 'debo'));
  const [groupId, setGroupId] = useState(editing?.groupId ?? db.debtGroups[0]?.id);
  const [amountText, setAmountText] = useState(amountToInput(editing?.amount ?? 0));
  const [date, setDate] = useState<ISODate>(editing?.date ?? today);
  const [dueDate, setDueDate] = useState<ISODate | undefined>(editing?.dueDate);
  const [note, setNote] = useState(editing?.note ?? '');
  const [rateText, setRateText] = useState(editing?.rate ? String(editing.rate) : '');
  const [minText, setMinText] = useState(amountToInput(editing?.minPayment ?? 0));
  const [moveAccountId, setMoveAccountId] = useState<string | undefined>(undefined);

  const owes = direction === 'debo';

  const save = () => {
    const amount = parseAmount(amountText) ?? 0;
    const issue = !name.trim()
      ? owes ? 'Escribe a quién le debes o el nombre del crédito.' : 'Escribe quién te debe.'
      : amount <= 0
        ? 'Escribe un monto mayor a cero.'
        : !groupId
          ? 'Elige un grupo.'
          : null;
    if (issue || !groupId) {
      haptic.warning();
      notify('Falta un dato', issue ?? '');
      return;
    }
    const id = editing?.id ?? newId();
    const rate = Math.min(500, Math.max(0, Number(rateText.replace(',', '.')) || 0));
    db.save('debts', {
      id, name: name.trim(), groupId, direction, amount, date, dueDate,
      rate: owes && rate > 0 ? rate : undefined,
      minPayment: owes ? (parseAmount(minText) ?? 0) || undefined : undefined,
      note: note.trim(), createdAt: editing?.createdAt ?? timestamp(),
    });
    if (!editing && moveAccountId) {
      db.addTx({ type: 'prestamo', amount, date, note: '', accountId: moveAccountId, debtId: id, source: 'manual' });
    }
    haptic.success();
    goBack();
  };

  const remove = () => {
    if (!editing) return;
    const count = linkedTransactions(db, 'debts', editing.id);
    confirm({
      title: `¿Eliminar ${editing.name}?`,
      message: count ? `También se borrarán sus ${count} abonos y movimientos.` : undefined,
      confirmLabel: 'Eliminar',
      destructive: true,
      onConfirm: () => {
        db.remove('debts', editing.id);
        goBack();
      },
    });
  };

  return (
    <FormScreen title={editing ? 'Editar deuda' : 'Nueva deuda'} onSave={save} onDelete={editing ? remove : undefined}>
      {!editing ? (
        <Segmented
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'debo', label: 'Yo debo' },
            { value: 'me_deben', label: 'Me deben' },
          ]}
        />
      ) : null}
      <AmountField value={amountText} onChangeText={setAmountText} color={owes ? colors.negative : colors.positive} />
      <Group label={owes ? '¿A quién o de qué?' : '¿Quién te debe?'}>
        <Field value={name} onChangeText={setName} placeholder={owes ? 'Ej. Préstamo del banco, Mamá' : 'Ej. Luis'} maxLength={40} autoFocus={!editing} />
      </Group>
      <Group label="Grupo" hint="Puedes crear más grupos en la pantalla de Deudas.">
        <ChoicePicker choices={db.debtGroups.map((g) => ({ id: g.id, label: g.name, icon: g.icon }))} value={groupId} onChange={(value) => value && setGroupId(value)} />
      </Group>
      {!editing && db.accounts.length > 0 ? (
        <Group
          label={owes ? '¿El dinero entró a una cuenta?' : '¿Salió de una cuenta?'}
          hint={owes ? 'Elige la cuenta si acabas de recibir este préstamo.' : 'Elige la cuenta si acabas de prestar este dinero.'}>
          <ChoicePicker
            choices={db.accounts.map((a) => ({ id: a.id, label: a.name, icon: a.kind === 'efectivo' ? 'cash' : 'business', color: a.color }))}
            value={moveAccountId}
            onChange={setMoveAccountId}
            allowNone
            noneLabel="No, ya existía"
          />
        </Group>
      ) : null}
      <Group label="Fecha">
        <DateField value={date} onChange={setDate} today={today} />
      </Group>
      <Group label="Vence (opcional)" hint={owes ? 'Si vence antes de tu próximo pago, se resta de lo libre para gastar.' : undefined}>
        <DateField value={dueDate} onChange={setDueDate} today={today} allowNone future onClear={() => setDueDate(undefined)} />
      </Group>
      {owes ? (
        <>
          <Group label="Interés anual % (opcional)" hint="Lo que te cobran al año. Sirve para el plan para salir de deudas; si no lo sabes, déjalo vacío.">
            <Field
              value={rateText}
              onChangeText={(text) => setRateText(text.replace(/[^0-9.,]/g, '').slice(0, 6))}
              placeholder="Ej. 24"
              accessibilityLabel="Interés anual"
              keyboardType="decimal-pad"
              inputMode="decimal"
              maxLength={6}
            />
          </Group>
          <Group label="Pago mínimo al mes (opcional)" hint="La cuota o el mínimo que te exigen cada mes.">
            <MoneyField value={minText} onChangeText={setMinText} />
          </Group>
        </>
      ) : null}
      <Group label="Nota (opcional)">
        <Field value={note} onChangeText={setNote} placeholder="Detalles, cuotas, intereses…" maxLength={120} />
      </Group>
    </FormScreen>
  );
}

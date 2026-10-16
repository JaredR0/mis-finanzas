import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { accountBalances } from '@/core/balances';
import { PALETTE } from '@/core/defaults';
import { newId } from '@/core/id';
import { linkedTransactions } from '@/core/mutations';
import { parseAmount } from '@/core/money';
import type { Account } from '@/core/types';
import { useDb } from '@/data/hooks';
import { AmountField, ColorPicker, confirm, Field, FormScreen, goBack, Group, haptic, notify, Segmented } from '@/ui';

export default function AccountForm() {
  const db = useDb();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = db.accounts.find((a) => a.id === id);
  // Al editar se muestra el saldo actual; si se cambia, se ajusta el saldo inicial por la diferencia.
  const currentBalance = editing ? (accountBalances(db)[editing.id] ?? 0) : 0;

  const [name, setName] = useState(editing?.name ?? '');
  const [kind, setKind] = useState<Account['kind']>(editing?.kind ?? 'banco');
  const initialText = editing ? (currentBalance / 100).toFixed(2) : '';
  const [balance, setBalance] = useState(initialText);
  const [color, setColor] = useState(editing?.color ?? PALETTE[(db.accounts.length + 1) % PALETTE.length]);

  const save = () => {
    if (!name.trim()) {
      haptic.warning();
      notify('Falta un dato', 'Ponle un nombre a la cuenta.');
      return;
    }
    const wanted = parseAmount(balance) ?? 0;
    // Solo se ajusta el saldo si el usuario escribió uno distinto.
    const adjustment = editing && balance !== initialText ? wanted - currentBalance : 0;
    const account: Account = {
      id: editing?.id ?? newId(),
      name: name.trim(),
      kind,
      color,
      initialBalance: editing ? editing.initialBalance + adjustment : wanted,
      createdAt: editing?.createdAt ?? Date.now(),
    };
    db.save('accounts', account);
    if (!db.settings.payAccountId) db.setSettings({ payAccountId: account.id });
    haptic.success();
    goBack();
  };

  const remove = () => {
    if (!editing) return;
    const count = linkedTransactions(db, 'accounts', editing.id);
    confirm({
      title: `¿Eliminar ${editing.name}?`,
      message: count ? `También se borrarán sus ${count} movimientos.` : undefined,
      confirmLabel: 'Eliminar',
      destructive: true,
      onConfirm: () => {
        db.remove('accounts', editing.id);
        goBack();
      },
    });
  };

  return (
    <FormScreen title={editing ? 'Editar cuenta' : 'Nueva cuenta'} onSave={save} onDelete={editing ? remove : undefined}>
      <Group label={editing ? 'Saldo actual' : '¿Cuánto tiene hoy?'} hint={editing ? 'Corrígelo si no coincide con tu banco; los movimientos no se tocan.' : undefined}>
        <AmountField value={balance} onChangeText={setBalance} />
      </Group>
      <Group label="Nombre">
        <Field value={name} onChangeText={setName} placeholder="Ej. Monetaria Banrural" maxLength={30} autoFocus={!editing} />
      </Group>
      <Group label="Tipo">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'banco', label: 'Banco' },
            { value: 'efectivo', label: 'Efectivo' },
          ]}
        />
      </Group>
      <Group label="Color">
        <ColorPicker value={color} onChange={setColor} />
      </Group>
    </FormScreen>
  );
}

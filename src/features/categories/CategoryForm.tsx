import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { PALETTE } from '@/core/defaults';
import { newId } from '@/core/id';
import { amountToInput, parseAmount } from '@/core/money';
import type { CategoryKind } from '@/core/types';
import { useDb } from '@/data/hooks';
import { ColorPicker, confirm, Field, FormScreen, goBack, Group, haptic, IconPicker, MoneyField, notify, Segmented } from '@/ui';

export default function CategoryForm() {
  const db = useDb();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = db.categories.find((c) => c.id === id);

  const [name, setName] = useState(editing?.name ?? '');
  const [kind, setKind] = useState<CategoryKind>(editing?.kind ?? 'corriente');
  const [budget, setBudget] = useState(amountToInput(editing?.monthlyBudget ?? 0));
  const [icon, setIcon] = useState(editing?.icon ?? 'pricetag');
  const [color, setColor] = useState(editing?.color ?? PALETTE[db.categories.length % PALETTE.length]);

  const save = () => {
    if (!name.trim()) {
      haptic.warning();
      notify('Falta un dato', 'Ponle un nombre a la categoría.');
      return;
    }
    db.save('categories', {
      id: editing?.id ?? newId(),
      key: editing?.key,
      name: name.trim(),
      kind,
      icon,
      color,
      monthlyBudget: kind === 'ingreso' ? 0 : (parseAmount(budget) ?? 0),
    });
    haptic.success();
    goBack();
  };

  const remove = () => {
    if (!editing) return;
    confirm({
      title: `¿Eliminar ${editing.name}?`,
      message: 'Sus movimientos se conservan, pero quedan sin categoría.',
      confirmLabel: 'Eliminar',
      destructive: true,
      onConfirm: () => {
        db.remove('categories', editing.id);
        goBack();
      },
    });
  };

  return (
    <FormScreen title={editing ? 'Editar categoría' : 'Nueva categoría'} onSave={save} onDelete={editing ? remove : undefined}>
      <Group label="Nombre">
        <Field value={name} onChangeText={setName} placeholder="Ej. Mascotas" maxLength={28} autoFocus={!editing} />
      </Group>
      <Group label="Tipo">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: 'corriente', label: 'Corriente' },
            { value: 'fijo', label: 'Fijo' },
            { value: 'ingreso', label: 'Ingreso' },
          ]}
        />
      </Group>
      {kind !== 'ingreso' ? (
        <Group label="Presupuesto mensual (opcional)" hint="La app te avisa en rojo cuando te pasas.">
          <MoneyField value={budget} onChangeText={setBudget} />
        </Group>
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

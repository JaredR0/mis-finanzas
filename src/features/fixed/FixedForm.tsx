import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { addDays, diffDays, formatShort, weekday } from '@/core/dates';
import { anchorForWeekday, type FixedEvery, fixedEvery, fixedMonthlyAverage, fixedOccurrences } from '@/core/fixed';
import { newId } from '@/core/id';
import { amountToInput, parseAmount } from '@/core/money';
import { useDb, useMoney, useToday } from '@/data/hooks';
import { AmountField, Chip, type Choice, ChoicePicker, confirm, DayField, Field, FormScreen, goBack, Group, haptic, notify, Segmented } from '@/ui';

const WEEKDAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function FixedForm() {
  const db = useDb();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = db.fixedExpenses.find((f) => f.id === id);
  const defaultAccount = db.settings.payAccountId ?? db.accounts[0]?.id;

  const [name, setName] = useState(editing?.name ?? '');
  const [amountText, setAmountText] = useState(amountToInput(editing?.amount ?? 0));
  const today = useToday();
  const money = useMoney();
  const [day, setDay] = useState(editing?.day ?? 1);
  // Las cuotas siempre son mensuales.
  const isInstallment = !!editing && db.installments.some((p) => p.fixedId === editing.id);
  const [every, setEvery] = useState<FixedEvery>(editing ? fixedEvery(editing) : 'mes');
  // Semanal: el día de la semana. Cada dos semanas: además, si el próximo toca esta semana o la siguiente.
  const firstNext = editing && fixedEvery(editing) !== 'mes' ? fixedOccurrences(editing, today, addDays(today, 13))[0]?.date : undefined;
  const [weekDay, setWeekDay] = useState(editing?.anchor ? weekday(editing.anchor) : weekday(today));
  const [later, setLater] = useState(firstNext ? diffDays(today, firstNext) >= 7 : false);
  const freshAnchor = addDays(anchorForWeekday(today, weekDay), every === 'dos_semanas' && later ? 7 : 0);
  // Si al editar no cambió el día ni el ritmo, se conserva el primer cobro (y los pagos ya hechos siguen contando).
  const keepAnchor =
    !!editing?.anchor &&
    fixedEvery(editing) === every &&
    weekday(editing.anchor) === weekDay &&
    (every !== 'dos_semanas' || (firstNext ? diffDays(today, firstNext) >= 7 : false) === later);
  const anchor = keepAnchor && editing?.anchor ? editing.anchor : freshAnchor;
  const [categoryId, setCategoryId] = useState(editing?.categoryId);
  const [paidWith, setPaidWith] = useState<string | undefined>(
    editing
      ? editing.cardId
        ? `c:${editing.cardId}`
        : editing.accountId
          ? `a:${editing.accountId}`
          : undefined
      : defaultAccount
        ? `a:${defaultAccount}`
        : undefined,
  );
  const [active, setActive] = useState(editing?.active ?? true);
  const [auto, setAuto] = useState(editing?.auto ?? false);

  const paymentChoices: Choice[] = [
    ...db.accounts.map((a) => ({
      id: `a:${a.id}`,
      label: a.name,
      icon: a.kind === 'efectivo' ? 'cash' : 'business',
      color: a.color,
    })),
    ...db.cards.map((c) => ({
      id: `c:${c.id}`,
      label: c.name,
      icon: 'card',
      color: c.color,
    })),
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
      every: every === 'mes' ? undefined : every,
      anchor: every === 'mes' ? undefined : anchor,
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
        <Field value={name} onChangeText={setName} placeholder="Ej. Renta, Netflix, Gasolina" maxLength={30} autoFocus={!editing} />
      </Group>
      {isInstallment ? null : (
        <Group label="Cada cuánto">
          <Segmented
            value={every}
            onChange={setEvery}
            options={[
              { value: 'mes', label: 'Mensual' },
              { value: 'semana', label: 'Semanal' },
              { value: 'dos_semanas', label: 'Cada 14 días' },
            ]}
          />
        </Group>
      )}
      {every === 'mes' ? (
        <Group label="Se paga el">
          <DayField value={day} onChange={setDay} lastLabel />
        </Group>
      ) : (
        <Group
          label="Qué día de la semana"
          hint={`Próximo: ${formatShort(keepAnchor && firstNext ? firstNext : anchor)}. Al mes son unos ${money(fixedMonthlyAverage({ id: '', name: '', amount: parseAmount(amountText) ?? 0, day: 1, active: true, every, anchor }))}.`}>
          <View style={styles.chips}>
            {WEEKDAYS.map((label, i) => (
              <Chip key={label} label={label} selected={weekDay === i} onPress={() => setWeekDay(i)} />
            ))}
          </View>
          {every === 'dos_semanas' ? (
            <Segmented
              value={later ? 'proxima' : 'esta'}
              onChange={(v) => setLater(v === 'proxima')}
              options={[
                {
                  value: 'esta',
                  label: `Toca el ${formatShort(anchorForWeekday(today, weekDay))}`,
                },
                {
                  value: 'proxima',
                  label: `Toca el ${formatShort(addDays(anchorForWeekday(today, weekDay), 7))}`,
                },
              ]}
            />
          ) : null}
        </Group>
      )}
      <Group label="Se paga con" hint="Si es con tarjeta, se suma a la deuda de esa tarjeta.">
        <ChoicePicker choices={paymentChoices} value={paidWith} onChange={setPaidWith} />
      </Group>
      <Group
        label="¿Cómo se paga?"
        hint={
          auto
            ? 'La app lo registra sola el día que toca, aunque no la abras ese día.'
            : every === 'mes'
              ? 'Cada mes tocas “Marcar como pagado” cuando lo pagues.'
              : 'Cada vez que toca, marcas “pagado” en Gastos fijos.'
        }>
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
          choices={[...fixedCategories, ...otherCategories].map((c) => ({
            id: c.id,
            label: c.name,
            icon: c.icon,
            color: c.color,
          }))}
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

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { monthKey, monthLabel, shiftMonthKey } from '@/core/dates';
import { newId, timestamp } from '@/core/id';
import { evaluatePlan, paidBefore, paidInstallments } from '@/core/installments';
import { amountToInput, parseAmount } from '@/core/money';
import type { InstallmentPlan } from '@/core/types';
import { useDb, useMoney, useToday } from '@/data/hooks';
import {
  Button,
  Card,
  type Choice,
  ChoicePicker,
  confirm,
  DayField,
  Field,
  FormScreen,
  goBack,
  Group,
  haptic,
  MoneyField,
  notify,
  ProgressBar,
  radius,
  Segmented,
  space,
  Txt,
  useColors,
} from '@/ui';

import { reasonText, VERDICT_LABEL, verdictHeadline } from './verdict';

/** Evaluar una compra a cuotas; si se decide tomarla, pasa a ser un pago mensual. */
export default function InstallmentForm() {
  const colors = useColors();
  const db = useDb();
  const today = useToday();
  const money = useMoney();
  const { id, modo } = useLocalSearchParams<{ id?: string; modo?: string }>();
  const editing = db.installments.find((p) => p.id === id);
  const isActive = editing?.status === 'activa';
  // Dos usos: anotar una compra que ya se está pagando, o evaluar una antes de hacerla.
  const registering = !editing && modo === 'registrar';
  const linkedFixed = db.fixedExpenses.find((f) => f.id === editing?.fixedId);
  const defaultAccount = db.settings.payAccountId ?? db.accounts[0]?.id;

  const [name, setName] = useState(editing?.name ?? '');
  const [priceText, setPriceText] = useState(amountToInput(editing?.cashPrice ?? 0));
  const [monthsText, setMonthsText] = useState(editing ? String(editing.months) : '');
  const [monthlyText, setMonthlyText] = useState(amountToInput(editing?.monthly ?? 0));
  const [beforeText, setBeforeText] = useState(editing?.paidBefore ? String(editing.paidBefore) : '');
  const [day, setDay] = useState(linkedFixed?.day ?? 1);
  const [firstMonth, setFirstMonth] = useState<'este' | 'proximo'>('proximo');
  const [auto, setAuto] = useState(linkedFixed?.auto ?? false);
  const [paidWith, setPaidWith] = useState<string | undefined>(
    linkedFixed ? (linkedFixed.cardId ? `c:${linkedFixed.cardId}` : linkedFixed.accountId ? `a:${linkedFixed.accountId}` : undefined) : defaultAccount ? `a:${defaultAccount}` : undefined,
  );

  const cashPrice = parseAmount(priceText) ?? 0;
  const months = Math.min(120, Math.max(0, Math.floor(Number(monthsText) || 0)));
  const monthly = parseAmount(monthlyText) ?? 0;
  const complete = cashPrice > 0 && months > 0 && monthly > 0;
  // Cuotas que ya venían pagadas (compra en curso) y las que faltan por cobrar.
  const before = paidBefore({ months, paidBefore: Number(beforeText) || 0 });
  const toCharge = Math.max(1, months - before);

  const draft: InstallmentPlan = {
    id: editing?.id ?? 'borrador',
    name: name.trim(),
    cashPrice,
    months,
    monthly,
    status: editing?.status ?? 'idea',
    fixedId: editing?.fixedId,
    paidBefore: before || undefined,
    createdAt: editing?.createdAt ?? 0,
  };
  const e = complete ? evaluatePlan(db, draft, today) : null;
  const paid = editing ? Math.min(editing.months, paidInstallments(db, editing)) : 0;

  const paymentChoices: Choice[] = [
    ...db.accounts.map((a) => ({ id: `a:${a.id}`, label: a.name, icon: a.kind === 'efectivo' ? 'cash' : 'business', color: a.color })),
    ...db.cards.map((c) => ({ id: `c:${c.id}`, label: c.name, icon: 'card', color: c.color })),
  ];

  const problem = (): string | null =>
    !name.trim() ? 'Escribe qué quieres comprar.' : cashPrice <= 0 ? 'Escribe el precio de contado.' : months <= 0 ? 'Escribe cuántas cuotas son.' : monthly <= 0 ? 'Escribe de cuánto es cada cuota.' : null;

  const stop = (issue: string) => {
    haptic.warning();
    notify('Falta un dato', issue);
  };

  /** Guarda el plan. Si `take` es true, además lo convierte en un pago mensual. */
  const save = (take: boolean) => {
    const issue = problem() ?? (take && !paidWith ? 'Elige con qué la vas a pagar.' : null);
    if (issue) return stop(issue);
    const planId = editing?.id ?? newId();
    let fixedId = editing?.fixedId;

    if (take && paidWith) {
      fixedId = newId();
      const start = firstMonth === 'este' ? monthKey(today) : shiftMonthKey(monthKey(today), 1);
      db.save('fixedExpenses', {
        id: fixedId,
        name: `Cuota: ${name.trim()}`,
        amount: monthly,
        day,
        accountId: paidWith.startsWith('a:') ? paidWith.slice(2) : undefined,
        cardId: paidWith.startsWith('c:') ? paidWith.slice(2) : undefined,
        active: true,
        auto,
        startMonth: start,
        endMonth: shiftMonthKey(start, toCharge - 1),
      });
    } else if (isActive && linkedFixed) {
      // Si se corrigen los números de una cuota activa, su pago mensual se actualiza con ellos.
      const start = linkedFixed.startMonth ?? monthKey(today);
      db.save('fixedExpenses', { ...linkedFixed, name: `Cuota: ${name.trim()}`, amount: monthly, endMonth: shiftMonthKey(start, toCharge - 1) });
    }

    db.save('installments', {
      ...draft,
      id: planId,
      status: take || isActive ? 'activa' : 'idea',
      fixedId,
      createdAt: editing?.createdAt ?? timestamp(),
    });
    haptic.success();
    goBack();
  };

  const remove = () => {
    if (!editing) return;
    confirm({
      title: `¿Eliminar ${editing.name}?`,
      message: isActive ? 'Deja de cobrarse cada mes. Las cuotas que ya pagaste se conservan como gastos.' : undefined,
      confirmLabel: 'Eliminar',
      destructive: true,
      onConfirm: () => {
        db.remove('installments', editing.id);
        goBack();
      },
    });
  };

  const tone = e ? { si: colors.positive, ajustado: colors.warning, no: colors.negative, sin_datos: colors.muted }[e.verdict] : colors.muted;
  const soft = e ? { si: colors.positiveSoft, ajustado: colors.warningSoft, no: colors.negativeSoft, sin_datos: colors.cardAlt }[e.verdict] : colors.cardAlt;
  const verdictIcon = e ? ({ si: 'checkmark-circle', ajustado: 'alert-circle', no: 'close-circle', sin_datos: 'help-circle' } as const)[e.verdict] : 'help-circle';

  return (
    <FormScreen
      title={isActive || registering ? 'Compra a cuotas' : '¿Me conviene esta compra?'}
      saveLabel={isActive ? 'Guardar cambios' : registering ? 'Agregar a mis pagos' : 'Guardar para pensarlo'}
      onSave={() => save(registering)}
      onDelete={editing ? remove : undefined}>
      <Group label={isActive || registering ? '¿Qué compraste?' : '¿Qué quieres comprar?'}>
        <Field value={name} onChangeText={setName} placeholder="Ej. Televisor, teléfono, laptop" maxLength={40} autoFocus={!editing} />
      </Group>
      <Group label="Precio de contado" hint={registering ? 'Lo que costaba pagándolo de una vez. Si no lo sabes, pon el total que vas a pagar.' : 'Lo que cuesta si lo pagas de una vez.'}>
        <MoneyField value={priceText} onChangeText={setPriceText} />
      </Group>
      <View style={styles.pair}>
        <View style={styles.flex}>
          <Group label="Número de cuotas">
            <Field
              value={monthsText}
              onChangeText={(text) => setMonthsText(text.replace(/\D/g, '').slice(0, 3))}
              placeholder="Ej. 24"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={3}
            />
          </Group>
        </View>
        <View style={styles.flex}>
          <Group label="Cuota mensual">
            <MoneyField value={monthlyText} onChangeText={setMonthlyText} />
          </Group>
        </View>
      </View>

      {e ? (
        <>
          {registering ? null : (
          <View style={[styles.verdict, { backgroundColor: soft, borderColor: tone }]}>
            <View style={styles.verdictHead}>
              <Ionicons name={verdictIcon} size={26} color={tone} />
              <Txt variant="heading" color={tone}>
                {VERDICT_LABEL[e.verdict]}
              </Txt>
            </View>
            <Txt>{verdictHeadline(e, money)}</Txt>
            {e.reasons.map((reason) => (
              <View key={reason} style={styles.reason}>
                <Txt color={tone}>•</Txt>
                <Txt style={styles.flex}>{reasonText(reason, e, months, money)}</Txt>
              </View>
            ))}
          </View>
          )}

          <Card style={{ paddingVertical: space.xs }}>
            <Line label="Total que terminas pagando" value={money(e.total)} strong />
            <Line
              label="Pagas de más"
              value={e.extra > 0 ? `${money(e.extra)} (${Math.round(e.extraRatio * 100)} %)` : 'Nada'}
              color={e.extra > 0 ? colors.negative : colors.positive}
            />
            <Line label="Interés anual equivalente" value={e.annualRate > 0 ? `${Math.round(e.annualRate * 100)} %` : '0 %'} />
            <Line
              label="Terminas de pagar"
              value={monthLabel(isActive ? e.lastMonth : shiftMonthKey(firstMonth === 'este' ? monthKey(today) : shiftMonthKey(monthKey(today), 1), toCharge - 1))}
            />
            {e.verdict !== 'sin_datos' ? (
              <>
                <Line label="Hoy te sobra al mes" value={money(e.marginBefore)} color={e.marginBefore >= 0 ? undefined : colors.negative} />
                <Line label="Con la cuota te sobraría" value={money(e.marginAfter)} color={e.marginAfter >= 0 ? colors.positive : colors.negative} last />
              </>
            ) : null}
          </Card>
        </>
      ) : (
        <Card>
          <Txt muted>Llena el precio, el número de cuotas y la cuota mensual para ver si te conviene.</Txt>
        </Card>
      )}

      {isActive && editing ? (
        <Card style={{ gap: space.sm }}>
          <Txt variant="bodyStrong">
            {paid} de {editing.months} cuotas pagadas
          </Txt>
          <ProgressBar value={paid / editing.months} color={colors.positive} />
          <Txt variant="small" muted>
            Se cobra como gasto fijo “{linkedFixed?.name ?? `Cuota: ${editing.name}`}”. Cada mes la marcas como pagada desde Cuotas, Deudas o Gastos fijos.
          </Txt>
          <Group label="Cuotas que ya habías pagado antes de anotarla" hint="Solo si la compra ya venía en curso. Cambia cuántas llevas y cuándo terminas.">
            <Field
              value={beforeText}
              onChangeText={(text) => setBeforeText(text.replace(/\D/g, '').slice(0, 3))}
              placeholder="0"
              accessibilityLabel="Cuotas ya pagadas"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={3}
            />
          </Group>
        </Card>
      ) : (
        <Card style={{ gap: space.lg }}>
          <Txt variant="bodyStrong">{registering ? 'Cómo la estás pagando' : 'Si decides tomarla'}</Txt>
          <Group label="¿Cuántas cuotas llevas pagadas?" hint="Si es una compra nueva, déjalo en 0. Si ya la venías pagando, escribe cuántas llevas.">
            <Field
              value={beforeText}
              onChangeText={(text) => setBeforeText(text.replace(/\D/g, '').slice(0, 3))}
              placeholder="0"
              accessibilityLabel="Cuotas ya pagadas"
              keyboardType="number-pad"
              inputMode="numeric"
              maxLength={3}
            />
          </Group>
          <Group label={before > 0 ? 'Próxima cuota' : 'Primera cuota'}>
            <Segmented
              value={firstMonth}
              onChange={setFirstMonth}
              options={[
                { value: 'este', label: 'Este mes' },
                { value: 'proximo', label: 'El próximo mes' },
              ]}
            />
          </Group>
          <Group label="Día de pago">
            <DayField value={day} onChange={setDay} lastLabel />
          </Group>
          <Group label="Se paga con">
            <ChoicePicker choices={paymentChoices} value={paidWith} onChange={setPaidWith} />
          </Group>
          <Group label="¿Cómo se paga cada mes?" hint={auto ? 'La app registra la cuota sola el día que toca.' : 'Cada mes tocas “Pagar cuota” cuando la pagues.'}>
            <Segmented
              value={auto ? 'auto' : 'manual'}
              onChange={(v) => setAuto(v === 'auto')}
              options={[
                { value: 'manual', label: 'La marco yo' },
                { value: 'auto', label: 'Se cobra sola' },
              ]}
            />
          </Group>
          {registering ? null : <Button variant="soft" icon="checkmark-done" label="Ya la tomé: agregar a mis pagos" onPress={() => save(true)} />}
          <Txt variant="small" muted>
            Se agrega a tus gastos fijos durante {months ? toCharge : 'esos'} {toCharge === 1 && months ? 'mes' : 'meses'} y se descuenta sola de lo que puedes gastar. Luego la ves en Cuotas y en Deudas, con cuántas llevas y cuánto falta.
          </Txt>
        </Card>
      )}
    </FormScreen>
  );
}

function Line({ label, value, color, strong, last }: { label: string; value: string; color?: string; strong?: boolean; last?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.line, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <Txt style={styles.flex}>{label}</Txt>
      <Txt variant={strong ? 'heading' : 'bodyStrong'} color={color} tabular>
        {value}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pair: { flexDirection: 'row', gap: space.md },
  verdict: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.sm },
  verdictHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  reason: { flexDirection: 'row', gap: space.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
});

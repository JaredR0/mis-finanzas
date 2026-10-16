import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { accountBalances, debtRemaining, envelopeBalances } from '@/core/balances';
import type { TxDraft } from '@/core/txDraft';
import { budgetCrossing } from '@/core/budget';
import { cardStatus } from '@/core/creditCard';
import { isValidISO, monthKey } from '@/core/dates';
import { amountToInput, parseAmount } from '@/core/money';
import type { ISODate, Transaction, TxType } from '@/core/types';
import { useDb, useMoney, useToday } from '@/data/hooks';
import {
  AmountField,
  Card,
  Chip,
  type Choice,
  ChoicePicker,
  confirm,
  DateField,
  Field,
  FormScreen,
  goBack,
  Group,
  haptic,
  type IconName,
  notify,
  space,
  Txt,
  useColors,
} from '@/ui';

const TYPES: { value: TxType; label: string; icon: IconName }[] = [
  { value: 'gasto', label: 'Gasto', icon: 'remove-circle-outline' },
  { value: 'ingreso', label: 'Ingreso', icon: 'add-circle-outline' },
  { value: 'pago_tarjeta', label: 'Pago de tarjeta', icon: 'card-outline' },
  { value: 'aporte', label: 'Apartar', icon: 'wallet-outline' },
  { value: 'retiro', label: 'Sacar de apartado', icon: 'arrow-undo-outline' },
  { value: 'abono_deuda', label: 'Abono a deuda', icon: 'trending-down-outline' },
  { value: 'transferencia', label: 'Transferencia', icon: 'swap-horizontal-outline' },
];

const TITLES: Record<TxType, string> = {
  gasto: 'Gasto',
  ingreso: 'Ingreso',
  pago_tarjeta: 'Pago de tarjeta',
  aporte: 'Apartar dinero',
  retiro: 'Sacar de apartado',
  abono_deuda: 'Abono a deuda',
  transferencia: 'Transferencia',
  prestamo: 'Préstamo',
};

type Params = Partial<Record<'id' | 'type' | 'cardId' | 'accountId' | 'envelopeId' | 'debtId' | 'amount' | 'date', string>>;

const isTxType = (value: string | undefined): value is TxType => TYPES.some((t) => t.value === value);

export default function TransactionForm() {
  const colors = useColors();
  const db = useDb();
  const today = useToday();
  const money = useMoney();
  const params = useLocalSearchParams<Params>();
  const editing: Transaction | undefined = params.id ? db.transactions.find((tx) => tx.id === params.id) : undefined;
  const defaultAccount = db.settings.payAccountId ?? db.accounts[0]?.id;

  const initialType: TxType = editing?.type ?? (isTxType(params.type) ? params.type : 'gasto');
  const [type, setType] = useState<TxType>(initialType);
  const [amountText, setAmountText] = useState(editing ? amountToInput(editing.amount) : (params.amount ?? ''));
  // Desde el calendario se llega con el día ya elegido (solo hoy o días pasados).
  const [date, setDate] = useState<ISODate>(editing?.date ?? (params.date && isValidISO(params.date) && params.date <= today ? params.date : today));
  const [note, setNote] = useState(editing?.note ?? '');
  const [accountId, setAccountId] = useState(
    editing ? editing.accountId : (params.accountId ?? (initialType === 'gasto' && params.cardId ? undefined : defaultAccount)),
  );
  const [toAccountId, setToAccountId] = useState(editing?.toAccountId);
  const [cardId, setCardId] = useState(editing?.cardId ?? params.cardId ?? (initialType === 'pago_tarjeta' ? db.cards[0]?.id : undefined));
  const [categoryId, setCategoryId] = useState(editing?.categoryId);
  const [envelopeId, setEnvelopeId] = useState(editing?.envelopeId ?? params.envelopeId);
  const [debtId, setDebtId] = useState(editing?.debtId ?? params.debtId);

  const amount = parseAmount(amountText) ?? 0;
  const accounts: Choice[] = db.accounts.map((a) => ({ id: a.id, label: a.name, icon: a.kind === 'efectivo' ? 'cash' : 'business', color: a.color }));
  const cards: Choice[] = db.cards.map((c) => ({ id: c.id, label: c.name, icon: 'card', color: c.color }));
  const envelopes: Choice[] = db.envelopes.map((e) => ({ id: e.id, label: e.name, icon: e.icon, color: e.color }));
  const openDebts = db.debts.filter((d) => d.id === debtId || debtRemaining(d, db.transactions) > 0);
  const debts: Choice[] = openDebts.map((d) => ({ id: d.id, label: d.name, icon: d.direction === 'debo' ? 'trending-down' : 'trending-up' }));
  const categories: Choice[] = db.categories
    .filter((c) => (type === 'ingreso' ? c.kind === 'ingreso' : c.kind !== 'ingreso'))
    .map((c) => ({ id: c.id, label: c.name, icon: c.icon, color: c.color }));

  const balances = accountBalances(db);
  const envelopeBalance = envelopeId ? (envelopeBalances(db)[envelopeId] ?? 0) : 0;
  const card = db.cards.find((c) => c.id === cardId);
  const status = card ? cardStatus(card, db.transactions, today) : undefined;
  const debt = db.debts.find((d) => d.id === debtId);
  const debtLeft = debt ? debtRemaining(debt, db.transactions) : 0;

  // "Pagado con": una sola lista que mezcla cuentas y tarjetas.
  const paidWith = cardId ? `c:${cardId}` : accountId ? `a:${accountId}` : undefined;
  const paymentChoices: Choice[] = [
    ...accounts.map((c) => ({ ...c, id: `a:${c.id}` })),
    ...cards.map((c) => ({ ...c, id: `c:${c.id}` })),
  ];
  const choosePayment = (id: string | undefined) => {
    if (!id) return;
    if (id.startsWith('c:')) {
      setCardId(id.slice(2));
      setAccountId(undefined);
    } else {
      setAccountId(id.slice(2));
      setCardId(undefined);
    }
  };

  const changeType = (next: TxType) => {
    setType(next);
    setCategoryId(undefined);
    if (next === 'gasto') return;
    // Los demás tipos salen siempre de una cuenta, no de una tarjeta.
    if (!accountId) setAccountId(defaultAccount);
    if (next === 'pago_tarjeta') setCardId((current) => current ?? db.cards[0]?.id);
    else setCardId(undefined);
    if (next !== 'aporte' && next !== 'retiro') setEnvelopeId(undefined);
    if (next === 'aporte' || next === 'retiro') setEnvelopeId((current) => current ?? db.envelopes[0]?.id);
    if (next === 'abono_deuda') setDebtId((current) => current ?? openDebts[0]?.id);
  };

  /** Devuelve el mensaje de lo que falta, o null si todo está completo. */
  const problem = (): string | null => {
    if (amount <= 0) return 'Escribe un monto mayor a cero.';
    switch (type) {
      case 'gasto':
        return paidWith ? null : 'Elige con qué pagaste.';
      case 'ingreso':
        return accountId ? null : 'Elige a qué cuenta entró.';
      case 'pago_tarjeta':
        return !cardId ? 'Elige la tarjeta.' : !accountId ? 'Elige de qué cuenta sale el pago.' : null;
      case 'transferencia':
        return !accountId || !toAccountId ? 'Elige las dos cuentas.' : accountId === toAccountId ? 'Elige dos cuentas distintas.' : null;
      case 'aporte':
        return envelopeId ? null : 'Elige el apartado.';
      case 'retiro':
        if (!envelopeId) return 'Elige el apartado.';
        return amount > envelopeBalance + (editing?.type === 'retiro' ? editing.amount : 0)
          ? `Ese apartado solo tiene ${money(envelopeBalance)}.`
          : null;
      case 'abono_deuda':
        return !debtId ? 'Elige la deuda.' : !accountId ? 'Elige la cuenta.' : null;
      case 'prestamo':
        return null;
    }
  };

  const save = () => {
    const issue = problem();
    if (issue) {
      haptic.warning();
      notify('Falta un dato', issue);
      return;
    }
    const uses = {
      account: type !== 'aporte' && type !== 'retiro' && !(type === 'gasto' && cardId),
      card: type === 'pago_tarjeta' || (type === 'gasto' && !!cardId),
      category: type === 'gasto' || type === 'ingreso',
      envelope: type === 'gasto' || type === 'aporte' || type === 'retiro',
      debt: type === 'abono_deuda' || type === 'prestamo',
    };
    const draft: TxDraft = {
      type,
      amount,
      date,
      note: note.trim(),
      accountId: uses.account ? accountId : undefined,
      toAccountId: type === 'transferencia' ? toAccountId : undefined,
      cardId: uses.card ? cardId : undefined,
      categoryId: uses.category ? categoryId : undefined,
      envelopeId: uses.envelope ? envelopeId : undefined,
      debtId: uses.debt ? debtId : undefined,
      fixedId: editing?.fixedId,
      payDate: editing?.payDate,
      merchant: editing?.merchant,
      raw: undefined, // el mensaje original ya no hace falta una vez confirmado
      source: editing?.source ?? 'manual',
      needsReview: false,
    };
    // ¿Este gasto hace que la categoría se acerque a su presupuesto o lo pase?
    const others = db.transactions.filter((tx) => tx.id !== editing?.id);
    const after = { ...db, transactions: [...others, { ...draft, id: editing?.id ?? 'nuevo', createdAt: 0 }] };
    const alert = type === 'gasto' ? budgetCrossing({ ...db, transactions: editing ? db.transactions : others }, after, draft.categoryId, monthKey(date)) : null;

    if (editing) db.updateTx(editing.id, draft);
    else db.addTx(draft);
    haptic.success();
    goBack();
    if (alert) {
      const percent = Math.round(alert.ratio * 100);
      if (alert.level === 'pasado') {
        notify(`Te pasaste en ${alert.category.name}`, `Llevas ${money(alert.spent)} de ${money(alert.budget)} este mes: ${money(-alert.left)} más que tu presupuesto.`);
      } else {
        notify(`Te estás acercando en ${alert.category.name}`, `Llevas ${percent} % de tu presupuesto del mes. Te quedan ${money(alert.left)}.`);
      }
    }
  };

  const remove = () => {
    if (!editing) return;
    confirm({
      title: '¿Eliminar este movimiento?',
      message: 'Los saldos se recalculan sin él.',
      confirmLabel: 'Eliminar',
      destructive: true,
      onConfirm: () => {
        db.removeTx(editing.id);
        goBack();
      },
    });
  };

  if (params.id && !editing) {
    return (
      <FormScreen title="Movimiento" onSave={goBack} saveLabel="Cerrar">
        <Txt muted center>
          Este movimiento ya no existe.
        </Txt>
      </FormScreen>
    );
  }

  const amountColor = type === 'gasto' || type === 'pago_tarjeta' ? colors.negative : type === 'ingreso' ? colors.positive : colors.text;
  // En una deuda, el dinero entra o sale según quién le debe a quién.
  const debtMoneyIn = type === 'prestamo' ? debt?.direction === 'debo' : debt?.direction === 'me_deben';
  const accountLabel =
    type === 'ingreso' ? 'Entra a' : type === 'pago_tarjeta' ? 'Sale de' : type === 'transferencia' ? 'De la cuenta' : debtMoneyIn ? 'Entra a' : 'Sale de';

  return (
    <FormScreen title={editing ? `Editar ${TITLES[type].toLowerCase()}` : TITLES[type]} onSave={save} onDelete={editing ? remove : undefined}>
      {!editing ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {TYPES.map((t) => (
            <Chip key={t.value} label={t.label} icon={t.icon} selected={type === t.value} onPress={() => changeType(t.value)} />
          ))}
        </View>
      ) : null}

      <AmountField value={amountText} onChangeText={setAmountText} color={amountColor} autoFocus={!editing && !params.amount} />

      {editing?.needsReview ? (
        <Card style={{ backgroundColor: colors.warningSoft, borderColor: colors.warning, gap: space.xs }}>
          <Txt variant="bodyStrong">Capturado automáticamente</Txt>
          <Txt variant="small" muted>
            Revisa que la categoría y la forma de pago estén bien y guarda para confirmarlo.
          </Txt>
          {editing.raw ? (
            <Txt variant="small" muted style={{ fontStyle: 'italic' }}>
              “{editing.raw}”
            </Txt>
          ) : null}
        </Card>
      ) : null}

      {type === 'pago_tarjeta' ? (
        <Group label="Tarjeta">
          {cards.length ? <ChoicePicker choices={cards} value={cardId} onChange={setCardId} /> : <Txt muted>Primero agrega una tarjeta.</Txt>}
          {status ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {status.pending > 0 ? (
                <Chip label={`Pago del corte ${money(status.pending)}`} selected={amount === status.pending} onPress={() => setAmountText(amountToInput(status.pending))} />
              ) : null}
              {status.debt > 0 && status.debt !== status.pending ? (
                <Chip label={`Deuda total ${money(status.debt)}`} selected={amount === status.debt} onPress={() => setAmountText(amountToInput(status.debt))} />
              ) : null}
            </View>
          ) : null}
        </Group>
      ) : null}

      {type === 'aporte' || type === 'retiro' ? (
        <Group label="Apartado" hint={type === 'retiro' && envelopeId ? `Tiene ${money(envelopeBalance)}` : type === 'aporte' ? 'El dinero sigue en tu cuenta, pero deja de contarse como libre.' : undefined}>
          {envelopes.length ? <ChoicePicker choices={envelopes} value={envelopeId} onChange={setEnvelopeId} /> : <Txt muted>Primero crea un apartado.</Txt>}
        </Group>
      ) : null}

      {type === 'abono_deuda' ? (
        <Group label="Deuda" hint={debt ? `Falta ${money(debtLeft)}` : undefined}>
          {debts.length ? <ChoicePicker choices={debts} value={debtId} onChange={setDebtId} /> : <Txt muted>No tienes deudas pendientes.</Txt>}
          {debt && debtLeft > 0 ? (
            <View style={{ flexDirection: 'row' }}>
              <Chip label={`Todo: ${money(debtLeft)}`} selected={amount === debtLeft} onPress={() => setAmountText(amountToInput(debtLeft))} />
            </View>
          ) : null}
        </Group>
      ) : null}

      {type === 'gasto' ? (
        <Group label="Pagado con">
          <ChoicePicker choices={paymentChoices} value={paidWith} onChange={choosePayment} />
        </Group>
      ) : null}

      {type !== 'gasto' && type !== 'aporte' && type !== 'retiro' ? (
        <Group label={accountLabel} hint={accountId && type !== 'ingreso' ? `Saldo: ${money(balances[accountId] ?? 0)}` : undefined}>
          <ChoicePicker choices={accounts} value={accountId} onChange={setAccountId} />
        </Group>
      ) : null}

      {type === 'transferencia' ? (
        <Group label="A la cuenta">
          <ChoicePicker choices={accounts.filter((a) => a.id !== accountId)} value={toAccountId} onChange={setToAccountId} />
        </Group>
      ) : null}

      {type === 'gasto' || type === 'ingreso' ? (
        <Group label="Categoría">
          <ChoicePicker choices={categories} value={categoryId} onChange={setCategoryId} />
        </Group>
      ) : null}

      {type === 'gasto' && envelopes.length ? (
        <Group label="¿Sale de un apartado?" hint="Úsalo cuando gastas un guardadito (p. ej. una consulta médica).">
          <ChoicePicker choices={envelopes} value={envelopeId} onChange={setEnvelopeId} allowNone noneLabel="No" />
        </Group>
      ) : null}

      <Group label="Fecha">
        <DateField value={date} onChange={setDate} today={today} />
      </Group>

      <Group label="Descripción (opcional)">
        <Field value={note} onChangeText={setNote} placeholder="Ej. Almuerzo, gasolina…" maxLength={80} returnKeyType="done" />
      </Group>
    </FormScreen>
  );
}

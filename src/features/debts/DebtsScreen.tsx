import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { debtRemaining, debtTotals } from '@/core/balances';
import { installmentsRemaining } from '@/core/installments';
import { formatShort, relativeDay } from '@/core/dates';
import { newId } from '@/core/id';
import type { Debt } from '@/core/types';
import { useDb, useMoney, useToday } from '@/data/hooks';
import { InstallmentCard } from '@/features/installments/InstallmentCard';
import {
  Button,
  Card,
  confirm,
  EmptyState,
  FadeIn,
  Field,
  IconBadge,
  IconButton,
  iconName,
  Money,
  PressableScale,
  ProgressBar,
  Row,
  Screen,
  SectionTitle,
  Segmented,
  space,
  Tag,
  Txt,
  useColors,
} from '@/ui';

export default function DebtsScreen({ embedded }: { embedded?: boolean }) {
  const db = useDb();
  const inBar = db.settings.tabs.includes('deudas');
  const colors = useColors();
  const [direction, setDirection] = useState<Debt['direction']>('debo');
  const [groupName, setGroupName] = useState('');
  const totals = debtTotals(db);
  const visible = db.debts.filter((d) => d.direction === direction);
  const money = useMoney();
  // Compras a cuotas que se están pagando: también son algo que se debe, mes a mes.
  const plans = db.installments.filter((p) => p.status === 'activa');
  const inInstallments = installmentsRemaining(db);

  const addGroup = () => {
    const name = groupName.trim();
    if (!name) return;
    db.save('debtGroups', { id: newId(), name, icon: 'folder' });
    setGroupName('');
  };

  return (
    <Screen title="Deudas" subtitle={embedded ? 'Lo que debes y lo que te deben' : undefined} tabs back={!inBar} embedded={embedded} right={<IconButton icon="add" label="Nueva deuda" onPress={() => router.push({ pathname: '/deuda', params: { direction } })} />}>
      <FadeIn>
        <View style={styles.totals}>
          <Card style={styles.total}>
            <Txt variant="caption" muted>
              Debo
            </Txt>
            <Money value={totals.owe} variant="heading" color={totals.owe > 0 ? colors.negative : undefined} />
          </Card>
          <Card style={styles.total}>
            <Txt variant="caption" muted>
              Me deben
            </Txt>
            <Money value={totals.owed} variant="heading" color={totals.owed > 0 ? colors.positive : undefined} />
          </Card>
        </View>
      </FadeIn>

      {totals.owe > 0 ? (
        <Button variant="soft" icon="flag" label="Plan para salir de deudas" onPress={() => router.push('/plan-deudas')} style={{ marginTop: space.md }} />
      ) : null}

      <View style={{ marginTop: space.lg }}>
        <Segmented
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'debo', label: 'Lo que debo' },
            { value: 'me_deben', label: 'Lo que me deben' },
          ]}
        />
      </View>

      {visible.length === 0 && direction === 'debo' && plans.length > 0 ? null : visible.length === 0 ? (
        <EmptyState
          icon={direction === 'debo' ? 'trending-down' : 'trending-up'}
          title={direction === 'debo' ? 'No debes nada aquí' : 'Nadie te debe'}
          message={direction === 'debo' ? 'Registra préstamos, créditos o lo que le debes a alguien.' : 'Registra lo que prestaste para no olvidarlo.'}
          action="Agregar deuda"
          onAction={() => router.push({ pathname: '/deuda', params: { direction } })}
        />
      ) : (
        db.debtGroups.map((group, index) => {
          const debts = visible.filter((d) => d.groupId === group.id);
          if (debts.length === 0) return null;
          return (
            <FadeIn key={group.id} index={index + 1}>
              <SectionTitle title={group.name} />
              <View style={{ gap: space.md }}>
                {debts.map((debt) => (
                  <DebtCard key={debt.id} debt={debt} />
                ))}
              </View>
            </FadeIn>
          );
        })
      )}

      {direction === 'debo' ? (
        <FadeIn index={db.debtGroups.length + 1}>
          <SectionTitle title="Compras a cuotas" action="Agregar" onAction={() => router.push({ pathname: '/cuota', params: { modo: 'registrar' } })} />
          {plans.length === 0 ? (
            <Card style={{ gap: space.sm }}>
              <Txt muted>
                Lo que pagas mes a mes: una compra a cuotas con tarjeta, un teléfono, un electrodoméstico. Anota el precio, cuántas cuotas son y cuánto pagas al mes; aquí verás cuántas llevas y cuánto te falta.
              </Txt>
              <Button small variant="soft" icon="add" label="Agregar compra a cuotas" onPress={() => router.push({ pathname: '/cuota', params: { modo: 'registrar' } })} />
            </Card>
          ) : (
            <View style={{ gap: space.md }}>
              <Txt variant="small" muted>
                Te falta pagar {money(inInstallments)} en {plans.length === 1 ? 'una compra' : `${plans.length} compras`}. No se suma a “Debo” para no contarlo dos veces: cada cuota ya se descuenta de lo que puedes gastar.
              </Txt>
              {plans.map((plan) => (
                <InstallmentCard key={plan.id} plan={plan} />
              ))}
            </View>
          )}
        </FadeIn>
      ) : null}

      <SectionTitle title="Grupos de deudas" />
      <Card style={{ paddingVertical: space.xs }}>
        {db.debtGroups.map((group) => {
          const count = db.debts.filter((d) => d.groupId === group.id).length;
          return (
            <Row
              key={group.id}
              icon={iconName(group.icon, 'folder')}
              title={group.name}
              subtitle={count === 1 ? '1 deuda' : `${count} deudas`}
              right={
                db.debtGroups.length > 1 ? (
                  <IconButton
                    icon="trash-outline"
                    label={`Eliminar grupo ${group.name}`}
                    color={colors.negative}
                    onPress={() =>
                      confirm({
                        title: `¿Eliminar el grupo ${group.name}?`,
                        message: count ? 'Sus deudas pasan a otro grupo; no se borran.' : undefined,
                        confirmLabel: 'Eliminar',
                        destructive: true,
                        onConfirm: () => db.remove('debtGroups', group.id),
                      })
                    }
                  />
                ) : undefined
              }
            />
          );
        })}
        <View style={styles.addGroup}>
          <Field value={groupName} onChangeText={setGroupName} placeholder="Nuevo grupo (ej. Familia)" maxLength={24} style={{ flex: 1 }} onSubmitEditing={addGroup} returnKeyType="done" />
          <Button small label="Crear" onPress={addGroup} disabled={!groupName.trim()} />
        </View>
      </Card>
    </Screen>
  );
}

function DebtCard({ debt }: { debt: Debt }) {
  const db = useDb();
  const today = useToday();
  const colors = useColors();
  const money = useMoney();
  const rest = debtRemaining(debt, db.transactions);
  const paid = debt.amount - rest;
  const owes = debt.direction === 'debo';
  const done = rest === 0;
  const overdue = !done && !!debt.dueDate && debt.dueDate < today;

  return (
    <Card style={{ gap: space.md }}>
      <PressableScale onPress={() => router.push({ pathname: '/deuda', params: { id: debt.id } })} style={styles.head}>
        <IconBadge icon={owes ? 'trending-down' : 'trending-up'} color={owes ? colors.negative : colors.positive} />
        <View style={{ flex: 1, gap: 2 }}>
          <Txt variant="bodyStrong" numberOfLines={1}>
            {debt.name}
          </Txt>
          <Txt variant="small" muted numberOfLines={1}>
            {done ? 'Saldada' : debt.dueDate ? `Vence ${formatShort(debt.dueDate)} · ${relativeDay(debt.dueDate, today)}` : 'Sin fecha de vencimiento'}
          </Txt>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          <Money value={rest} variant="heading" color={done ? colors.muted : owes ? colors.negative : colors.positive} />
          {done ? <Tag label="Saldada" tone="positive" /> : overdue ? <Tag label="Vencida" tone="negative" /> : null}
        </View>
      </PressableScale>
      <ProgressBar value={debt.amount > 0 ? paid / debt.amount : 1} color={colors.positive} />
      <View style={styles.between}>
        <Txt variant="small" muted>
          {owes ? 'Pagado' : 'Cobrado'} {money(paid, { compact: true })} de {money(debt.amount, { compact: true })}
        </Txt>
        {!done ? (
          <Button
            small
            variant="soft"
            label={owes ? 'Abonar' : 'Registrar cobro'}
            icon="add"
            onPress={() => router.push({ pathname: '/movimiento', params: { type: 'abono_deuda', debtId: debt.id } })}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  totals: { flexDirection: 'row', gap: space.md },
  total: { flex: 1, gap: 4 },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  addGroup: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.md },
});

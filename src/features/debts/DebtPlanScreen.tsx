import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { monthLabel } from '@/core/dates';
import { type PayoffStrategy, payoffPlan } from '@/core/debtPlan';
import { amountToInput, parseAmount } from '@/core/money';
import { useDb, useMoney, useToday } from '@/data/hooks';
import { Button, Card, EmptyState, FadeIn, Group, IconBadge, Money, MoneyField, PressableScale, Screen, SectionTitle, Segmented, space, Tag, Txt, useColors } from '@/ui';

const STRATEGY_HINT: Record<PayoffStrategy, string> = {
  bola_de_nieve: 'Primero la deuda más pequeña. Terminas una pronto y eso anima a seguir.',
  avalancha: 'Primero la de mayor interés. Es la que menos intereses te hace pagar en total.',
};

/** Plan para salir de deudas: en qué orden pagarlas, cuánto abonar y cuándo quedas libre. */
export default function DebtPlanScreen() {
  const db = useDb();
  const today = useToday();
  const colors = useColors();
  const money = useMoney();
  const saved = db.settings.debtPlan;
  const [monthlyText, setMonthlyText] = useState(amountToInput(saved?.monthly ?? 0));
  const strategy: PayoffStrategy = saved?.strategy ?? 'bola_de_nieve';
  const useExtras = saved?.useExtras ?? true;
  const typed = parseAmount(monthlyText) ?? 0;

  const result = payoffPlan(db, today, { monthly: typed, strategy, useExtras });
  const { plan, minimumOnly } = result;
  const update = (patch: Partial<NonNullable<typeof saved>>) => db.setSettings({ debtPlan: { monthly: typed, strategy, useExtras, ...patch } });
  const month = (key: string | null) => (key ? monthLabel(key).toLowerCase() : '');
  const savedInterest = minimumOnly && minimumOnly.months !== null && plan.months !== null ? minimumOnly.totalInterest - plan.totalInterest : 0;
  const savedMonths = minimumOnly && minimumOnly.months !== null && plan.months !== null ? minimumOnly.months - plan.months : 0;

  if (result.inputs.length === 0) {
    return (
      <Screen title="Salir de deudas" back>
        <EmptyState
          icon="happy"
          title="No tienes deudas con saldo"
          message="Cuando registres una deuda en “Lo que debo”, aquí verás en qué orden pagarla y cuándo terminas."
          action="Agregar deuda"
          onAction={() => router.push({ pathname: '/deuda', params: { direction: 'debo' } })}
        />
      </Screen>
    );
  }

  return (
    <Screen title="Salir de deudas" subtitle="En qué orden pagar y cuándo terminas" back>
      <FadeIn>
        <Card style={{ gap: space.lg }}>
          <Group
            label="Cuánto puedes destinar a tus deudas cada mes"
            hint={
              result.suggested > 0
                ? `Si lo dejas vacío uso ${money(result.suggested)}${result.suggested > result.minimums ? ', lo que te sobra en un mes típico' : ', la suma de tus pagos mínimos'}.`
                : 'Incluye los pagos mínimos. Con una semana de gastos registrados la app te sugiere un monto.'
            }>
            <MoneyField
              value={monthlyText}
              placeholder={result.suggested > 0 ? (result.suggested / 100).toFixed(2) : '0.00'}
              onChangeText={(value) => {
                setMonthlyText(value);
                update({ monthly: parseAmount(value) ?? 0 });
              }}
            />
          </Group>
          <Group label="¿Cuál pagar primero?" hint={STRATEGY_HINT[strategy]}>
            <Segmented
              value={strategy}
              onChange={(value) => update({ strategy: value })}
              options={[
                { value: 'bola_de_nieve', label: 'La más pequeña' },
                { value: 'avalancha', label: 'La de más interés' },
              ]}
            />
          </Group>
          <Group label="¿Usar también tus bonos e ingresos extra?" hint="Suma al mes que toca los ingresos extra que anotaste (bono, aguinaldo) y aún no recibes.">
            <Segmented
              value={useExtras ? 'si' : 'no'}
              onChange={(value) => update({ useExtras: value === 'si' })}
              options={[
                { value: 'si', label: 'Sí' },
                { value: 'no', label: 'No' },
              ]}
            />
          </Group>
        </Card>
      </FadeIn>

      <FadeIn index={1}>
        <Card
          style={[
            styles.result,
            plan.months !== null ? { backgroundColor: colors.positiveSoft, borderColor: colors.positive } : { backgroundColor: colors.warningSoft, borderColor: colors.warning },
          ]}>
          {plan.months !== null ? (
            <>
              <Txt variant="caption" muted>
                Quedas libre de deudas en
              </Txt>
              <Txt variant="title" color={colors.positive}>
                {monthLabel(plan.debtFreeIn ?? '')}
              </Txt>
              <Txt>
                {plan.months === 1 ? 'Este mismo mes' : `En ${plan.months} meses`}, destinando {money(result.monthly)} al mes
                {plan.totalInterest > 0 ? `. Pagarías ${money(plan.totalInterest)} de intereses.` : '.'}
              </Txt>
              {minimumOnly && (savedInterest > 0 || savedMonths > 0) ? (
                <Txt variant="small" color={colors.positive} style={styles.strong}>
                  Pagando solo los mínimos terminarías en {month(minimumOnly.debtFreeIn)}: con este plan te ahorras
                  {savedMonths > 0 ? ` ${savedMonths} ${savedMonths === 1 ? 'mes' : 'meses'}` : ''}
                  {savedMonths > 0 && savedInterest > 0 ? ' y' : ''}
                  {savedInterest > 0 ? ` ${money(savedInterest)} de intereses` : ''}.
                </Txt>
              ) : minimumOnly && minimumOnly.months === null ? (
                <Txt variant="small" color={colors.positive} style={styles.strong}>
                  Pagando solo los pagos mínimos no terminarías nunca.
                </Txt>
              ) : null}
            </>
          ) : (
            <>
              <Txt variant="heading" color={colors.warning}>
                {result.monthly <= 0 ? 'Escribe cuánto puedes abonar al mes' : plan.stuck ? 'Con ese monto la deuda no baja' : 'Con ese monto tardarías más de 50 años'}
              </Txt>
              <Txt>
                {result.monthly <= 0
                  ? 'Con ese dato calculo en qué orden pagar y cuándo terminas.'
                  : 'Los intereses de cada mes son mayores o casi iguales a lo que abonas. Hay que subir el monto mensual o renegociar la deuda con más interés.'}
              </Txt>
            </>
          )}
          {plan.shortfall ? (
            <Txt variant="small" color={colors.negative} style={styles.strong}>
              Ojo: {money(result.monthly)} no cubre tus pagos mínimos, que suman {money(result.minimums)} al mes.
            </Txt>
          ) : null}
        </Card>
      </FadeIn>

      <FadeIn index={2}>
        <SectionTitle title="En este orden" />
        <View style={{ gap: space.md }}>
          {plan.debts.map((debt) => (
            <Card key={debt.id} style={{ gap: space.sm }}>
              <PressableScale onPress={() => router.push({ pathname: '/deuda', params: { id: debt.id } })} style={styles.head}>
                <IconBadge icon={debt.order === 1 ? 'flag' : 'trending-down'} color={debt.order === 1 ? colors.primary : colors.muted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="bodyStrong" numberOfLines={1}>
                    {debt.order}. {debt.name}
                  </Txt>
                  <Txt variant="small" muted numberOfLines={1}>
                    Debes {money(debt.balance)}
                    {debt.rate > 0 ? ` · ${Math.round(debt.rate * 1000) / 10} % anual` : ' · sin interés anotado'}
                    {debt.min > 0 ? ` · mínimo ${money(debt.min, { compact: true })}` : ''}
                  </Txt>
                </View>
                {debt.order === 1 ? <Tag label="Primero esta" tone="positive" /> : null}
              </PressableScale>
              <View style={styles.between}>
                <Txt variant="small" muted>
                  Este mes abónale
                </Txt>
                <Money value={debt.payNow} variant="bodyStrong" color={debt.payNow > 0 ? colors.text : colors.muted} />
              </View>
              <View style={styles.between}>
                <Txt variant="small" muted>
                  La terminas en
                </Txt>
                <Txt variant="bodyStrong" color={debt.paidOffIn ? colors.positive : colors.warning}>
                  {debt.paidOffIn ? `${monthLabel(debt.paidOffIn)}${debt.interest > 0 ? ` · ${money(debt.interest, { compact: true })} de interés` : ''}` : 'No con este monto'}
                </Txt>
              </View>
            </Card>
          ))}
        </View>
        <Txt variant="small" muted style={{ marginTop: space.md }}>
          A todas se les paga su mínimo; lo que sobra va a la primera. Cuando la terminas, todo lo que le pagabas pasa a la siguiente.
        </Txt>
        {result.withoutRate > 0 ? (
          <Txt variant="small" color={colors.warning} style={{ marginTop: space.sm }}>
            {result.withoutRate === 1 ? 'Una deuda no tiene' : `${result.withoutRate} deudas no tienen`} el interés anotado, así que el cálculo la{result.withoutRate === 1 ? '' : 's'} trata como sin interés. Toca la deuda para agregarlo.
          </Txt>
        ) : null}
        <Txt variant="small" muted style={{ marginTop: space.sm }}>
          Es una simulación con interés mensual simple sobre el saldo; tu banco puede calcularlo distinto. Las compras a cuotas y el saldo de tus tarjetas no entran aquí.
        </Txt>
        <Button variant="soft" icon="add" label="Agregar otra deuda" onPress={() => router.push({ pathname: '/deuda', params: { direction: 'debo' } })} style={{ marginTop: space.lg }} />
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  strong: { fontWeight: '700' },
  result: { gap: space.sm, marginTop: space.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
});

import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { monthLabel, monthName } from '@/core/dates';
import { baseline, forecast, monthEndOutlook, monthlyMargin } from '@/core/forecast';
import { amountToInput, parseAmount } from '@/core/money';
import { useDb, useMoney, useToday } from '@/data/hooks';
import { Card, FadeIn, Group, Money, MoneyField, Screen, SectionTitle, space, Txt, useColors } from '@/ui';

import { GoalCard } from './GoalCard';

const MONTHS_AHEAD = 12;

/** Plan: meta de fin de mes, cómo va el mes y cuánto se puede ahorrar en los próximos. */
export default function PlanScreen() {
  const colors = useColors();
  const db = useDb();
  const today = useToday();
  const money = useMoney();
  const inBar = db.settings.tabs.includes('plan');
  const [goalText, setGoalText] = useState(amountToInput(db.settings.monthEndGoal));

  const outlook = monthEndOutlook(db, today);
  const base = baseline(db, today);
  const months = forecast(db, today, MONTHS_AHEAD);
  // Un mes normal, sin bonos ni gastos planeados de una sola vez.
  const typical = monthlyMargin(db, today);
  const steady = typical - (base.income - (months[0]?.fixed ?? 0) - base.variable);
  const last = months[months.length - 1];
  const pace =
    base.currentPace !== null && base.previousAverage !== null && base.previousAverage > 0
      ? Math.round(((base.currentPace - base.previousAverage) / base.previousAverage) * 100)
      : null;

  const steps: { label: string; value: number; strong?: boolean }[] = [
    { label: 'Dinero neto hoy', value: outlook.net },
    { label: 'Sueldo que falta por recibir', value: outlook.incomeLeft - outlook.extraLeft },
    { label: 'Ingresos extra que esperas este mes', value: outlook.extraLeft },
    { label: 'Gastos fijos y cuotas por pagar', value: -outlook.fixedLeft },
    { label: 'Deudas que vencen este mes', value: -outlook.debtsLeft },
    { label: 'Gastos planeados de este mes', value: -outlook.plannedLeft },
    { label: 'Si no gastas nada más', value: outlook.ifNoMoreSpending, strong: true },
    { label: 'Apartados (ahorro y guardaditos, no se tocan)', value: -outlook.inEnvelopes },
    ...(outlook.inEnvelopes > 0 || outlook.goal > 0
      ? [{ label: 'Libre a fin de mes si no gastas más', value: outlook.freeIfNoMoreSpending, strong: true }]
      : []),
    ...(outlook.goal > 0
      ? [
          { label: 'Tu meta', value: -outlook.goal },
          { label: outlook.canSpend >= 0 ? 'Aún puedes gastar' : 'Te falta para llegar a tu meta', value: outlook.canSpend, strong: true },
        ]
      : []),
    { label: 'Gasto del día a día que falta (estimado)', value: -outlook.expectedSpending },
    { label: 'A tu ritmo te quedarían libres', value: outlook.freeProjected, strong: true },
  ];
  const shown = steps.filter((step) => step.strong || step.value !== 0 || step.label === 'Dinero neto hoy');

  return (
    <Screen title="Plan" subtitle={monthLabel(outlook.key)} tabs back={!inBar}>
      <FadeIn>
        <GoalCard outlook={outlook} />
      </FadeIn>

      <FadeIn index={1}>
        <SectionTitle title="Tu meta" />
        <Card>
          <Group label="Con cuánto quieres llegar a fin de mes" hint="Es dinero libre: lo que tengas en cuentas, sin contar lo que debas en tarjetas ni lo que tienes apartado. Déjalo vacío para no usar meta.">
            <MoneyField
              value={goalText}
              onChangeText={(value) => {
                setGoalText(value);
                db.setSettings({ monthEndGoal: parseAmount(value) ?? 0 });
              }}
            />
          </Group>
        </Card>
      </FadeIn>

      <FadeIn index={2}>
        <SectionTitle title="Cómo cierra este mes" />
        <Card style={{ paddingVertical: space.xs }}>
          {shown.map((step, index) => (
            <View
              key={step.label}
              style={[styles.line, index < shown.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
              <Txt variant={step.strong ? 'bodyStrong' : 'body'} style={styles.flex}>
                {step.label}
              </Txt>
              <Money value={step.value} toned sign={!step.strong && step.value > 0} variant={step.strong ? 'heading' : 'bodyStrong'} />
            </View>
          ))}
        </Card>
      </FadeIn>

      <FadeIn index={3}>
        <SectionTitle title="Tu ritmo de gasto" />
        <Card style={{ gap: space.sm }}>
          {base.noData ? (
            <Txt muted>Registra tus gastos unos días y aquí verás cuánto sueles gastar y cómo vas mejorando.</Txt>
          ) : (
            <>
              <View style={styles.between}>
                <Txt style={styles.flex}>Gasto del día a día esperado</Txt>
                <Money value={base.variable} variant="heading" />
              </View>
              <Txt variant="small" muted>
                {base.monthsUsed > 0
                  ? `Al mes, según ${base.monthsUsed === 1 ? 'tu último mes' : `tus últimos ${base.monthsUsed} meses`}; los más recientes pesan más. No incluye gastos fijos ni cuotas.`
                  : 'Al mes, según lo que llevas gastado este mes. No incluye gastos fijos ni cuotas.'}
              </Txt>
              {pace !== null && base.currentPace !== null ? (
                <Txt color={pace <= 0 ? colors.positive : colors.negative} variant="bodyStrong">
                  {pace === 0
                    ? 'Este mes vas igual que tu promedio.'
                    : `Este mes vas para ${money(base.currentPace)}: ${Math.abs(pace)} % ${pace < 0 ? 'menos' : 'más'} que tu promedio.`}
                </Txt>
              ) : null}
            </>
          )}
        </Card>
      </FadeIn>

      <FadeIn index={4}>
        <SectionTitle title="Próximos meses" />
        {base.noData || base.income <= 0 ? (
          <Card>
            <Txt muted>
              {base.income <= 0
                ? 'Configura cuánto te pagan en Ajustes para proyectar los próximos meses.'
                : 'Aún no hay suficientes gastos registrados para proyectar. Con una semana de uso aparece la proyección.'}
            </Txt>
          </Card>
        ) : (
          <Card style={{ gap: space.md }}>
            <View style={{ gap: 2 }}>
              <Txt variant="caption" muted>
                {typical >= 0 ? 'Podrías ahorrar al mes' : 'Te faltaría al mes'}
              </Txt>
              <Money value={Math.abs(typical)} variant="title" color={typical >= 0 ? colors.positive : colors.negative} />
              <Txt variant="small" muted>
                Ingreso {money(base.income + steady)}
                {steady > 0 ? ` (incluye ${money(steady)} extra de cada mes)` : ''} − fijos y cuotas {money(months[0].fixed)} − día a día {money(base.variable)}
              </Txt>
            </View>
            <View style={styles.tableRow}>
              <Txt variant="caption" muted style={styles.monthCell}>
                Mes
              </Txt>
              <Txt variant="caption" muted style={styles.numberCell}>
                Te sobra
              </Txt>
              <Txt variant="caption" muted style={styles.numberCell}>
                Tendrías
              </Txt>
            </View>
            {months.map((m) => {
              const oneOffExtra = m.extra - steady;
              return (
                <View key={m.key} style={{ gap: 2 }}>
                  <View style={styles.tableRow}>
                    <Txt variant="label" style={styles.monthCell}>
                      {monthName(Number(m.key.slice(5)))}
                    </Txt>
                    <Money value={m.saving} toned sign compact variant="label" style={styles.numberCell} />
                    <Money value={m.balance} toned compact variant="bodyStrong" style={styles.numberCell} />
                  </View>
                  {oneOffExtra > 0 || m.planned > 0 ? (
                    <Txt variant="small" muted>
                      {[oneOffExtra > 0 ? `+${money(oneOffExtra, { compact: true })} de ingreso extra` : '', m.planned > 0 ? `−${money(m.planned, { compact: true })} de gastos planeados` : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </Txt>
                  ) : null}
                </View>
              );
            })}
            {last ? (
              <Txt variant="small" color={last.balance >= outlook.projected ? colors.positive : colors.negative}>
                {typical >= 0
                  ? `Si sigues así, en ${MONTHS_AHEAD} meses tendrías ${money(last.balance)} netos.`
                  : `A este ritmo gastas más de lo que ganas: en ${MONTHS_AHEAD} meses estarías en ${money(last.balance)}.`}
              </Txt>
            ) : null}
          </Card>
        )}
        <Txt variant="small" muted style={{ marginTop: space.sm }}>
          Es una estimación con lo que has registrado: mejora sola cuando gastas menos y se ajusta cuando terminan tus cuotas. Los bonos y gastos que anotes en el Calendario se suman al mes que les toca.
        </Txt>
      </FadeIn>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  between: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tableRow: { flexDirection: 'row', alignItems: 'center' },
  monthCell: { width: 96 },
  numberCell: { flex: 1, textAlign: 'right' },
});

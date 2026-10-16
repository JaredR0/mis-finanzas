import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { monthKey, monthName } from '@/core/dates';
import { compareMonths, monthSummary, yearSummary, yearsWithData } from '@/core/reports';
import { useDb, useMoney, useToday } from '@/data/hooks';
import { Button, Card, Chip, FadeIn, IncomeExpenseChart, Money, Screen, SectionTitle, space, Txt, useColors } from '@/ui';

/** Reportes: cómo va el año, comparación mes a mes y exportación a Excel. */
export default function ReportsScreen() {
  const db = useDb();
  const inBar = db.settings.tabs.includes('reportes');
  const today = useToday();
  const colors = useColors();
  const money = useMoney();
  const currentYear = Number(today.slice(0, 4));
  const [year, setYear] = useState(currentYear);
  const [selected, setSelected] = useState(monthKey(today));

  const years = yearsWithData(db, currentYear);
  const summary = yearSummary(db, year);
  const lastMonth = year === currentYear ? Number(today.slice(5, 7)) : 12;
  const elapsed = summary.months.slice(0, lastMonth);
  const withData = elapsed.filter((m) => m.income > 0 || m.expense > 0);
  const average = withData.length ? Math.round(withData.reduce((a, m) => a + m.expense, 0) / withData.length) : 0;
  const best = withData.length ? withData.reduce((a, m) => (m.balance > a.balance ? m : a)) : undefined;
  const selectedKey = selected.startsWith(String(year)) ? selected : `${year}-${String(lastMonth).padStart(2, '0')}`;
  const month = monthSummary(db, selectedKey);
  const savingsRate = month.income > 0 ? Math.round((month.balance / month.income) * 100) : null;
  // Mes elegido contra el anterior; si es el mes en curso, solo hasta el día de hoy en ambos.
  const comparison = compareMonths(db, selectedKey, selectedKey === monthKey(today) ? Number(today.slice(8)) : null);
  const previousName = monthName(Number(comparison.previousKey.slice(5))).toLowerCase();
  const changes = comparison.categories.filter((c) => c.delta !== 0).slice(0, 8);

  return (
    <Screen title="Reportes" subtitle="Cómo vas mes a mes" tabs back={!inBar}>
      {years.length > 1 ? (
        <View style={styles.years}>
          {years.map((y) => (
            <Chip key={y} label={String(y)} selected={y === year} onPress={() => setYear(y)} />
          ))}
        </View>
      ) : null}

      <FadeIn key={`year-${year}`}>
        <Card style={{ gap: space.lg }}>
          <View style={{ gap: 2 }}>
            <Txt variant="caption" muted>
              Balance de {year}
            </Txt>
            <Money value={summary.balance} variant="title" toned sign />
          </View>
          <View style={styles.three}>
            <Stat label="Ingresos" value={summary.income} color={colors.positive} />
            <Stat label="Gastos" value={summary.expense} color={colors.negative} />
            <Stat label="Ahorrado" value={summary.saved} color={colors.primary} />
          </View>
          <IncomeExpenseChart points={summary.months} selected={selectedKey} onSelect={setSelected} />
          <Txt variant="small" muted center>
            Toca un mes para ver su detalle
          </Txt>
        </Card>
      </FadeIn>

      <FadeIn index={1} key={`month-${selectedKey}`}>
        <SectionTitle title={`${monthName(Number(selectedKey.slice(5)))} ${year}`} />
        <Card style={{ paddingVertical: space.xs }}>
          <Line label="Ingresos" value={month.income} color={colors.positive} />
          <Line label="Gastos fijos" value={-month.fixed} color={colors.negative} />
          <Line label="Gastos corrientes" value={-month.current} color={colors.negative} />
          <Line label="Balance del mes" value={month.balance} strong />
          <Line label="Apartado (ahorro y guardaditos)" value={month.saved} color={colors.primary} />
          <Line label="Pagado a tarjetas" value={month.cardPaid} />
          <Line label="Abonado a deudas" value={month.debtPaid} last />
        </Card>
        {savingsRate !== null ? (
          <Txt variant="small" color={savingsRate >= 0 ? colors.positive : colors.negative} style={{ marginTop: space.sm }}>
            {savingsRate >= 0 ? `Te quedó el ${savingsRate}% de lo que ganaste.` : `Gastaste ${-savingsRate}% más de lo que ganaste.`}
          </Txt>
        ) : null}
      </FadeIn>

      {comparison.current > 0 || comparison.previous > 0 ? (
        <FadeIn index={2} key={`compare-${selectedKey}`}>
          <SectionTitle title={`Contra ${previousName}`} />
          <Card style={{ gap: space.md }}>
            <View style={{ gap: 2 }}>
              <Txt variant="caption" muted>
                {comparison.previous === 0 ? `En ${previousName} no hubo gastos registrados` : comparison.delta === 0 ? 'Gastaste lo mismo' : comparison.delta > 0 ? 'Gastaste de más' : 'Gastaste de menos'}
              </Txt>
              <Txt variant="title" color={comparison.delta > 0 ? colors.negative : colors.positive} tabular>
                {money(Math.abs(comparison.delta))}
                {comparison.percent !== null ? ` (${comparison.percent > 0 ? '+' : ''}${comparison.percent} %)` : ''}
              </Txt>
              <Txt variant="small" muted>
                {money(comparison.current)} este mes contra {money(comparison.previous)} en {previousName}
                {comparison.throughDay !== null ? `, contando solo hasta el día ${comparison.throughDay} de cada mes` : ''}.
              </Txt>
            </View>
            {changes.map((c) => (
              <View key={c.categoryId ?? 'sin'} style={styles.changeRow}>
                <View style={[styles.swatch, { backgroundColor: c.color }]} />
                <View style={styles.flex}>
                  <Txt variant="label" numberOfLines={1}>
                    {c.name}
                  </Txt>
                  <Txt variant="small" muted>
                    {money(c.previous, { compact: true })} → {money(c.current, { compact: true })}
                  </Txt>
                </View>
                <Txt variant="bodyStrong" color={c.delta > 0 ? colors.negative : colors.positive} tabular>
                  {c.delta > 0 ? '+' : '−'}
                  {money(Math.abs(c.delta), { compact: true })}
                </Txt>
              </View>
            ))}
            {changes.length === 0 ? <Txt muted>Sin cambios por categoría.</Txt> : null}
          </Card>
        </FadeIn>
      ) : null}

      {withData.length > 0 ? (
        <FadeIn index={2}>
          <SectionTitle title="Mes a mes" />
          <Card style={{ gap: space.md }}>
            <View style={styles.tableRow}>
              <Txt variant="caption" muted style={styles.monthCell}>
                Mes
              </Txt>
              <Txt variant="caption" muted style={styles.numberCell}>
                Ingresos
              </Txt>
              <Txt variant="caption" muted style={styles.numberCell}>
                Gastos
              </Txt>
              <Txt variant="caption" muted style={styles.numberCell}>
                Balance
              </Txt>
            </View>
            {withData.map((m) => (
              <View key={m.key} style={styles.tableRow}>
                <Txt variant="label" style={styles.monthCell}>
                  {monthName(Number(m.key.slice(5))).slice(0, 3)}
                </Txt>
                <Money value={m.income} compact variant="small" style={styles.numberCell} />
                <Money value={m.expense} compact variant="small" style={styles.numberCell} />
                <Money value={m.balance} compact toned sign variant="label" style={styles.numberCell} />
              </View>
            ))}
            <Txt variant="small" muted>
              Gasto promedio: {money(average, { compact: true })} al mes
              {best ? ` · Mejor mes: ${monthName(Number(best.key.slice(5))).toLowerCase()}` : ''}
            </Txt>
          </Card>
        </FadeIn>
      ) : null}

      <Button
        variant="soft"
        icon="download-outline"
        label="Exportar datos a Excel"
        onPress={() => router.push('/exportar')}
        style={{ marginTop: space.xl }}
      />
    </Screen>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Txt variant="caption" muted>
        {label}
      </Txt>
      <Money value={value} compact color={color} />
    </View>
  );
}

function Line({ label, value, color, strong, last }: { label: string; value: number; color?: string; strong?: boolean; last?: boolean }) {
  const colors = useColors();
  return (
    <View style={[styles.line, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}>
      <Txt variant={strong ? 'bodyStrong' : 'body'} style={{ flex: 1 }}>
        {label}
      </Txt>
      {strong ? <Money value={value} toned sign variant="heading" /> : <Money value={value} color={value === 0 ? colors.faint : color} />}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  changeRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  swatch: { width: 10, height: 10, borderRadius: 5 },
  years: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  three: { flexDirection: 'row', gap: space.sm },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md },
  tableRow: { flexDirection: 'row', alignItems: 'center' },
  monthCell: { width: 46 },
  numberCell: { flex: 1, textAlign: 'right' },
});

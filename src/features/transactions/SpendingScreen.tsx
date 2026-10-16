import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { monthKey, monthLabel, shiftMonthKey } from '@/core/dates';
import { budgetLevel } from '@/core/budget';
import { monthSummary } from '@/core/reports';
import { searchTransactions } from '@/core/search';
import { useDb, useMoney, useToday } from '@/data/hooks';
import { TxList } from '@/features/shared/TxList';
import {
  Card,
  Chip,
  EmptyState,
  FadeIn,
  Field,
  IconBadge,
  iconName,
  Money,
  ProgressBar,
  Screen,
  SectionTitle,
  space,
  Txt,
  useColors,
} from '@/ui';

type Filter = 'todos' | 'gastos' | 'ingresos' | 'revisar';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'todos', label: 'Todos' },
  { value: 'gastos', label: 'Gastos' },
  { value: 'ingresos', label: 'Ingresos' },
  { value: 'revisar', label: 'Por revisar' },
];

/** "Cómo voy": resumen del mes, avance por categoría y la lista de movimientos. */
export default function SpendingScreen() {
  const colors = useColors();
  const db = useDb();
  const today = useToday();
  const money = useMoney();
  const params = useLocalSearchParams<{ filtro?: string; ts?: string }>();
  const [month, setMonth] = useState(monthKey(today));
  const [filter, setFilter] = useState<Filter>(params.filtro === 'revisar' ? 'revisar' : 'todos');
  // Cada vez que se llega desde "por revisar" en Inicio (marca `ts` nueva) se aplica ese filtro.
  const [seen, setSeen] = useState(params.ts);
  if (params.ts !== seen) {
    setSeen(params.ts);
    if (params.filtro === 'revisar') setFilter('revisar');
  }

  const summary = monthSummary(db, month);
  const previous = monthSummary(db, shiftMonthKey(month, -1));
  const isCurrent = month === monthKey(today);
  const difference = summary.expense - previous.expense;

  // "Por revisar" solo existe para movimientos capturados con versiones anteriores.
  const hasReview = db.transactions.some((tx) => tx.needsReview);
  const inMonth = db.transactions.filter((tx) => (filter === 'revisar' ? tx.needsReview : monthKey(tx.date) === month));
  const shown = inMonth.filter((tx) =>
    filter === 'gastos' ? tx.type === 'gasto' : filter === 'ingresos' ? tx.type === 'ingreso' : true,
  );
  const spendCategories = summary.byCategory.filter((c) => c.amount > 0 || c.budget > 0);

  // Buscador: con texto escrito se busca en todos los meses, no solo en el que se está viendo.
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  const results = searching ? searchTransactions(db, query) : [];
  const resultExpense = results.reduce((sum, tx) => sum + (tx.type === 'gasto' ? tx.amount : 0), 0);
  const resultIncome = results.reduce((sum, tx) => sum + (tx.type === 'ingreso' ? tx.amount : 0), 0);

  return (
    <Screen title="Gastos" subtitle="Cómo vas este mes" tabs back={!db.settings.tabs.includes('gastos')}>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.faint} style={styles.searchIcon} />
        <Field
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar por texto, monto o fecha"
          accessibilityLabel="Buscar movimientos"
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          style={styles.searchField}
        />
        {searching ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Borrar búsqueda" hitSlop={10} onPress={() => setQuery('')} style={styles.searchClear}>
            <Ionicons name="close-circle" size={20} color={colors.faint} />
          </Pressable>
        ) : null}
      </View>

      {searching ? (
        <>
          <Txt variant="small" muted style={{ marginBottom: space.md }}>
            {results.length === 0
              ? 'Prueba con una palabra, un monto (85 o 85.50) o una fecha (06/10, octubre, viernes).'
              : `${results.length} ${results.length === 1 ? 'movimiento' : 'movimientos'} en todos los meses` +
                (resultExpense > 0 ? ` · gastos ${money(resultExpense)}` : '') +
                (resultIncome > 0 ? ` · ingresos ${money(resultIncome)}` : '')}
          </Txt>
          {results.length === 0 ? (
            <EmptyState icon="search" title="Sin resultados" message={`No hay movimientos que coincidan con “${query.trim()}”.`} />
          ) : (
            <TxList db={db} transactions={results} today={today} />
          )}
        </>
      ) : (
        <>
      <View style={styles.monthBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Mes anterior" hitSlop={12} onPress={() => setMonth(shiftMonthKey(month, -1))}>
          <Ionicons name="chevron-back-circle" size={30} color={colors.primary} />
        </Pressable>
        <Txt variant="heading">{monthLabel(month)}</Txt>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
          hitSlop={12}
          disabled={isCurrent}
          onPress={() => setMonth(shiftMonthKey(month, 1))}>
          <Ionicons name="chevron-forward-circle" size={30} color={isCurrent ? colors.border : colors.primary} />
        </Pressable>
      </View>

      <FadeIn key={`summary-${month}`}>
        <Card style={{ gap: space.md }}>
          <View style={styles.three}>
            <View style={styles.stat}>
              <Txt variant="caption" muted>
                Ingresos
              </Txt>
              <Money value={summary.income} color={colors.positive} variant="heading" compact />
            </View>
            <View style={styles.stat}>
              <Txt variant="caption" muted>
                Gastos
              </Txt>
              <Money value={summary.expense} color={colors.negative} variant="heading" compact />
            </View>
            <View style={styles.stat}>
              <Txt variant="caption" muted>
                Balance
              </Txt>
              <Money value={summary.balance} toned sign variant="heading" compact />
            </View>
          </View>
          {summary.expense > 0 ? (
            <View style={{ gap: space.sm }}>
              <View style={[styles.split, { backgroundColor: colors.cardAlt }]}>
                <View style={{ flex: Math.max(summary.fixed, 1), backgroundColor: colors.primary }} />
                <View style={{ flex: Math.max(summary.current, 1), backgroundColor: colors.warning }} />
              </View>
              <View style={styles.between}>
                <Txt variant="small" muted>
                  Fijos {money(summary.fixed, { compact: true })}
                </Txt>
                <Txt variant="small" muted>
                  Corrientes {money(summary.current, { compact: true })}
                </Txt>
              </View>
            </View>
          ) : null}
          {previous.expense > 0 && summary.expense > 0 ? (
            <Txt variant="small" color={difference > 0 ? colors.negative : colors.positive}>
              {difference > 0 ? '▲' : '▼'} {money(Math.abs(difference), { compact: true })} {difference > 0 ? 'más' : 'menos'} que el mes anterior
            </Txt>
          ) : null}
        </Card>
      </FadeIn>

      {spendCategories.length > 0 ? (
        <FadeIn index={1} key={`categories-${month}`}>
          <SectionTitle title="Por categoría" action="Presupuestos" onAction={() => router.push('/categorias')} />
          <Card style={{ gap: space.lg }}>
            {spendCategories.map((c) => {
              const level = budgetLevel(c.amount, c.budget);
              const over = level === 'pasado';
              const near = level === 'cerca';
              const ratio = c.budget > 0 ? c.amount / c.budget : summary.expense > 0 ? c.amount / summary.expense : 0;
              return (
                <View key={c.categoryId ?? 'none'} style={styles.category}>
                  <IconBadge icon={iconName(c.icon)} color={c.color} size={38} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <View style={styles.between}>
                      <Txt variant="bodyStrong" numberOfLines={1} style={{ flex: 1 }}>
                        {c.name}
                      </Txt>
                      <Money value={c.amount} color={over ? colors.negative : undefined} />
                    </View>
                    <ProgressBar value={ratio} color={over ? colors.negative : near ? colors.warning : c.color} height={6} />
                    {c.budget > 0 ? (
                      <Txt variant="small" color={over ? colors.negative : near ? colors.warning : colors.muted} style={over || near ? { fontWeight: '700' } : undefined}>
                        {over
                          ? `Te pasaste por ${money(c.amount - c.budget)}`
                          : near
                            ? `Ojo, te estás acercando: te quedan ${money(c.budget - c.amount)} de ${money(c.budget, { compact: true })}`
                            : `Te quedan ${money(c.budget - c.amount)} de ${money(c.budget, { compact: true })}`}
                      </Txt>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </Card>
        </FadeIn>
      ) : null}

      <SectionTitle title="Movimientos" />
      <View style={styles.filters}>
        {FILTERS.filter((f) => f.value !== 'revisar' || hasReview || filter === 'revisar').map((f) => (
          <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />
        ))}
      </View>
      {shown.length === 0 ? (
        <EmptyState
          icon={filter === 'revisar' ? 'checkmark-done' : 'receipt-outline'}
          title={filter === 'revisar' ? 'Todo revisado' : 'Sin movimientos'}
          message={filter === 'revisar' ? 'No hay movimientos pendientes de confirmar.' : 'Toca el botón + para registrar uno.'}
        />
      ) : (
        <TxList db={db} transactions={shown} today={today} />
      )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  search: { marginBottom: space.lg, justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: space.lg, zIndex: 1 },
  searchField: { paddingLeft: 44, paddingRight: 44 },
  searchClear: { position: 'absolute', right: space.md },
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  three: { flexDirection: 'row', gap: space.sm },
  stat: { flex: 1, gap: 4 },
  split: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  category: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
});

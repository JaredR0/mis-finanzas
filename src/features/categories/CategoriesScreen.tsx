import { router } from 'expo-router';

import { monthKey } from '@/core/dates';
import { monthSummary } from '@/core/reports';
import type { CategoryKind } from '@/core/types';
import { useDb, useMoney, useToday } from '@/data/hooks';
import { Card, FadeIn, IconButton, iconName, Money, Row, Screen, SectionTitle, space, Txt } from '@/ui';

const SECTIONS: { kind: CategoryKind; title: string }[] = [
  { kind: 'corriente', title: 'Gastos corrientes' },
  { kind: 'fijo', title: 'Gastos fijos' },
  { kind: 'ingreso', title: 'Ingresos' },
];

/** Categorías y su presupuesto mensual. */
export default function CategoriesScreen() {
  const db = useDb();
  const today = useToday();
  const money = useMoney();
  const spent = new Map(monthSummary(db, monthKey(today)).byCategory.map((c) => [c.categoryId, c.amount]));
  const budgetTotal = db.categories.reduce((sum, c) => sum + (c.kind === 'ingreso' ? 0 : c.monthlyBudget), 0);

  return (
    <Screen
      title="Presupuesto"
      subtitle={budgetTotal > 0 ? `Presupuesto total: ${money(budgetTotal)} al mes` : 'Ponle un tope mensual a cada categoría'}
      back
      right={<IconButton icon="add" label="Nueva categoría" onPress={() => router.push('/categoria')} />}>
      {SECTIONS.map((section, index) => {
        const items = db.categories.filter((c) => c.kind === section.kind);
        if (items.length === 0) return null;
        return (
          <FadeIn key={section.kind} index={index}>
            <SectionTitle title={section.title} />
            <Card style={{ paddingVertical: space.xs }}>
              {items.map((c, i) => (
                <Row
                  key={c.id}
                  icon={iconName(c.icon)}
                  color={c.color}
                  title={c.name}
                  subtitle={
                    c.kind === 'ingreso'
                      ? undefined
                      : c.monthlyBudget > 0
                        ? `Llevas ${money(spent.get(c.id) ?? 0, { compact: true })} este mes`
                        : 'Sin presupuesto'
                  }
                  chevron
                  last={i === items.length - 1}
                  onPress={() => router.push({ pathname: '/categoria', params: { id: c.id } })}
                  right={c.kind !== 'ingreso' && c.monthlyBudget > 0 ? <Money value={c.monthlyBudget} compact /> : undefined}
                />
              ))}
            </Card>
          </FadeIn>
        );
      })}
      <Txt variant="small" muted style={{ marginTop: space.lg }}>
        Fijos son los que pagas igual cada mes (renta, internet). Corrientes son los del día a día (comida, transporte).
      </Txt>
    </Screen>
  );
}

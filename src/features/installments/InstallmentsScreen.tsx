import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { baseline } from '@/core/forecast';
import { installmentsRemaining } from '@/core/installments';
import type { InstallmentPlan } from '@/core/types';
import { useDb, useMoney, useToday } from '@/data/hooks';
import { Button, Card, EmptyState, FadeIn, IconButton, Money, Screen, SectionTitle, space, Tag, Txt } from '@/ui';

import { InstallmentCard } from './InstallmentCard';

/** Cuotas: evalúa si una compra a plazos conviene y lleva las que ya se tomaron. */
export default function InstallmentsScreen({ embedded }: { embedded?: boolean }) {
  const db = useDb();
  const today = useToday();
  const money = useMoney();
  const inBar = db.settings.tabs.includes('cuotas');
  const active = db.installments.filter((p) => p.status === 'activa');
  const ideas = db.installments.filter((p) => p.status === 'idea');
  const monthly = active.reduce((sum, p) => sum + p.monthly, 0);
  const income = baseline(db, today).income;

  const renderPlan = (plan: InstallmentPlan) => <InstallmentCard key={plan.id} plan={plan} />;
  const remaining = installmentsRemaining(db);
  const register = () => router.push({ pathname: '/cuota', params: { modo: 'registrar' } });

  return (
    <Screen
      title="Cuotas"
      subtitle="Lo que pagas mes a mes y lo que piensas comprar"
      tabs
      back={!inBar}
      embedded={embedded}
      right={<IconButton icon="add" label="Agregar compra a cuotas" onPress={register} />}>
      <View style={styles.actions}>
        <Button small variant="soft" icon="add" label="Agregar una que ya pago" onPress={register} style={styles.flex} />
        <Button small variant="soft" icon="calculator" label="¿Me conviene?" onPress={() => router.push({ pathname: '/cuota', params: { modo: 'evaluar' } })} style={styles.flex} />
      </View>
      {db.installments.length === 0 ? (
        <EmptyState
          icon="calculator"
          title="Compras a cuotas"
          message="Agrega lo que ya estás pagando a cuotas para ver cuántas llevas y cuánto falta. O usa “¿Me conviene?” antes de comprar: la app te dice cuánto terminas pagando de verdad y si te alcanza mes con mes."
        />
      ) : (
        <>
          {active.length > 0 ? (
            <FadeIn>
              <Card style={styles.summary}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt variant="caption" muted>
                    Pagas en cuotas cada mes
                  </Txt>
                  <Money value={monthly} variant="title" />
                  <Txt variant="small" muted>
                    Te falta pagar {money(remaining)} en total
                  </Txt>
                </View>
                {income > 0 ? (
                  <Tag
                    label={`${Math.round((monthly / income) * 100)} % de tu ingreso`}
                    tone={monthly > income * 0.3 ? 'negative' : monthly > income * 0.2 ? 'warning' : 'positive'}
                  />
                ) : null}
              </Card>
            </FadeIn>
          ) : null}

          {active.length > 0 ? (
            <FadeIn index={1}>
              <SectionTitle title="Las que estás pagando" />
              <View style={{ gap: space.md }}>
                {active.map(renderPlan)}
              </View>
            </FadeIn>
          ) : null}

          {ideas.length > 0 ? (
            <FadeIn index={2}>
              <SectionTitle title="Las que estás pensando" />
              <View style={{ gap: space.md }}>
                {ideas.map(renderPlan)}
              </View>
            </FadeIn>
          ) : null}

          <Txt variant="small" muted style={{ marginTop: space.lg }}>
            El veredicto usa lo que te sobra en un mes típico ({money(Math.max(0, income))} de ingreso menos tus gastos fijos, cuotas y gasto del día a día). Cambia solo cuando cambian tus gastos.
          </Txt>
        </>
      )}
    </Screen>
  );

}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  summary: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});

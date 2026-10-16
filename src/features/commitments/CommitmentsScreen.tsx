import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useDb } from '@/data/hooks';
import DebtsScreen from '@/features/debts/DebtsScreen';
import FixedScreen from '@/features/fixed/FixedScreen';
import ExtraIncomeScreen from '@/features/income/ExtraIncomeScreen';
import InstallmentsScreen from '@/features/installments/InstallmentsScreen';
import PlannedScreen from '@/features/planned/PlannedScreen';
import { Chip, type IconName, Screen, space } from '@/ui';

const TABS: { key: string; label: string; icon: IconName }[] = [
  { key: 'fijos', label: 'Fijos', icon: 'repeat' },
  { key: 'cuotas', label: 'Cuotas', icon: 'calculator' },
  { key: 'deudas', label: 'Deudas', icon: 'trending-down' },
  { key: 'planeados', label: 'Planeados', icon: 'calendar' },
  { key: 'ingresos', label: 'Ingresos extra', icon: 'add-circle' },
];

/**
 * Compromisos: en un solo lugar lo que pagas cada mes, lo que debes, lo que
 * tienes planeado pagar y lo que esperas recibir además de tu sueldo.
 */
export default function CommitmentsScreen() {
  const db = useDb();
  const { tab: requested } = useLocalSearchParams<{ tab?: string }>();
  const valid = TABS.some((t) => t.key === requested) ? requested : undefined;
  const [tab, setTab] = useState(valid ?? 'fijos');
  // Si se llega con otra pestaña pedida (desde un enlace de la app), se muestra esa.
  const [seen, setSeen] = useState(valid);
  if (valid !== seen) {
    setSeen(valid);
    if (valid) setTab(valid);
  }

  return (
    <Screen title="Compromisos" subtitle="Lo que pagas, lo que debes y lo que esperas recibir" tabs back={!db.settings.tabs.includes('compromisos')}>
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Chip key={t.key} label={t.label} icon={t.icon} selected={tab === t.key} onPress={() => setTab(t.key)} />
        ))}
      </View>
      {tab === 'fijos' ? <FixedScreen embedded /> : null}
      {tab === 'cuotas' ? <InstallmentsScreen embedded /> : null}
      {tab === 'deudas' ? <DebtsScreen embedded /> : null}
      {tab === 'planeados' ? <PlannedScreen embedded /> : null}
      {tab === 'ingresos' ? <ExtraIncomeScreen embedded /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
});

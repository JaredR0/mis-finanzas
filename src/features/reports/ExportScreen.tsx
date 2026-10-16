import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { monthKey, monthName } from '@/core/dates';
import { yearsWithData } from '@/core/reports';
import { useDb, useToday } from '@/data/hooks';
import { pickDatabase } from '@/data/store';
import { exportToExcel } from '@/services/exportExcel';
import { Button, Card, Chip, FadeIn, haptic, type IconName, notify, Row, Screen, SectionTitle, space, Txt, useColors } from '@/ui';

/** Exportar datos a Excel: un solo lugar, con un libro por cada mes. */
export default function ExportScreen() {
  const db = useDb();
  const today = useToday();
  const colors = useColors();
  const years = yearsWithData(db, Number(today.slice(0, 4)));
  const [year, setYear] = useState<number | 'todo'>('todo');
  const [exporting, setExporting] = useState(false);

  // Meses que tendrán su propio libro.
  const counts = new Map<string, number>();
  for (const tx of db.transactions) {
    const key = monthKey(tx.date);
    if (year !== 'todo' && Number(key.slice(0, 4)) !== year) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const months = [...counts.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));

  const run = async () => {
    setExporting(true);
    try {
      await exportToExcel(pickDatabase(db), today, year === 'todo' ? undefined : year);
      haptic.success();
    } catch (error) {
      notify('No se pudo exportar', error instanceof Error ? error.message : 'Intenta de nuevo.');
    } finally {
      setExporting(false);
    }
  };

  const contents: { icon: IconName; title: string; text: string }[] = [
    { icon: 'calendar', title: 'Un libro por cada mes', text: 'Cada gasto e ingreso con su fecha y su día de la semana, y el total del mes.' },
    { icon: 'stats-chart', title: 'Resumen del año', text: 'Ingresos, gastos, balance y ahorro de los 12 meses.' },
    { icon: 'pie-chart', title: 'Gastos por categoría', text: 'Cuánto se fue en cada categoría, mes a mes.' },
    { icon: 'albums', title: 'Estado actual', text: 'Cuentas, tarjetas, apartados, deudas, cuotas, ingresos extra y gastos planeados.' },
  ];

  return (
    <Screen title="Exportar a Excel" subtitle="Tus datos en un archivo" back>
      {years.length > 1 ? (
        <View style={styles.years}>
          <Chip label="Todo" selected={year === 'todo'} onPress={() => setYear('todo')} />
          {years.map((y) => (
            <Chip key={y} label={String(y)} selected={year === y} onPress={() => setYear(y)} />
          ))}
        </View>
      ) : null}

      <FadeIn>
        <Card style={{ paddingVertical: space.xs }}>
          {contents.map((item, index) => (
            <Row key={item.title} icon={item.icon} title={item.title} subtitle={item.text} subtitleLines={2} last={index === contents.length - 1} />
          ))}
        </Card>
      </FadeIn>

      <FadeIn index={1}>
        <SectionTitle title="Libros de este archivo" />
        <Card style={{ gap: space.sm }}>
          {months.length === 0 ? (
            <Txt muted>Aún no hay movimientos que exportar.</Txt>
          ) : (
            months.map(([key, count]) => (
              <View key={key} style={styles.month}>
                <Txt style={styles.flex}>
                  {monthName(Number(key.slice(5)))} {key.slice(0, 4)}
                </Txt>
                <Txt variant="small" muted>
                  {count} {count === 1 ? 'movimiento' : 'movimientos'}
                </Txt>
              </View>
            ))
          )}
        </Card>
      </FadeIn>

      <Txt variant="small" color={colors.warning} style={{ marginTop: space.lg }}>
        El archivo sale de la app sin cifrar. Tú eliges a dónde va; la copia temporal se borra del teléfono al terminar.
      </Txt>
      <Button
        label={exporting ? 'Generando…' : 'Exportar datos a Excel'}
        icon="download-outline"
        onPress={run}
        disabled={exporting || months.length === 0}
        style={{ marginTop: space.md }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  years: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.lg },
  month: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});

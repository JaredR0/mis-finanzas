import { router } from 'expo-router';

import { debtTotals, fixedActiveIn, fixedPayment } from '@/core/balances';
import { useDb, useMoney, useToday } from '@/data/hooks';
import { useStorageHealth } from '@/data/storage';
import { monthKey } from '@/core/dates';
import { monthEndOutlook } from '@/core/forecast';
import { APP_VERSION } from '@/services/appInfo';
import { Card, FadeIn, type IconName, Row, Screen, SectionTitle, space, Txt, useColors } from '@/ui';

interface Item {
  icon: IconName;
  color: string;
  title: string;
  subtitle: string;
  href: '/compromisos' | '/calendario' | '/gastos' | '/tarjetas' | '/apartados' | '/plan' | '/cuotas' | '/ingresos' | '/exportar' | '/deudas' | '/fijos' | '/reportes' | '/categorias' | '/cuentas' | '/apariencia' | '/seguridad' | '/ajustes';
}

export default function MoreScreen() {
  const db = useDb();
  const today = useToday();
  const money = useMoney();
  const colors = useColors();
  const health = useStorageHealth();
  const totals = debtTotals(db);
  const month = monthKey(today);
  const pendingFixed = db.fixedExpenses.filter((f) => fixedActiveIn(f, month) && !fixedPayment(f, month, db.transactions)).length;

  const outlook = monthEndOutlook(db, today);
  const goal =
    outlook.status === 'sin_meta'
      ? 'Cuánto puedes gastar y cuánto ahorrarás'
      : outlook.canSpend > 0
        ? `Aún puedes gastar ${money(outlook.canSpend, { compact: true })} este mes`
        : 'Ya no puedes gastar más este mes';
  const activePlans = db.installments.filter((p) => p.status === 'activa').length;

  // Las secciones que el usuario sacó de la barra de pestañas se abren desde aquí.
  const hidden = (key: string) => !db.settings.tabs.includes(key);
  const moved: Item[] = [
    ...(hidden('gastos') ? [{ icon: 'stats-chart', color: '#F97316', title: 'Gastos', href: '/gastos', subtitle: 'Cómo vas este mes y tus movimientos' } as Item] : []),
    ...(hidden('tarjetas') ? [{ icon: 'card', color: '#6366F1', title: 'Tarjetas', href: '/tarjetas', subtitle: 'Cortes, fechas de pago y deuda' } as Item] : []),
    ...(hidden('apartados') ? [{ icon: 'wallet', color: '#22C55E', title: 'Apartados', href: '/apartados', subtitle: 'Ahorro y guardaditos' } as Item] : []),
  ];

  const planned = db.plannedExpenses.filter((p) => p.active).length;
  // Resumen de la sección Compromisos: solo lo que tiene algo que decir.
  const commitments = [
    db.fixedExpenses.length ? (pendingFixed ? `${pendingFixed} ${pendingFixed === 1 ? 'fijo' : 'fijos'} por pagar` : 'fijos al día') : '',
    activePlans ? `${activePlans} ${activePlans === 1 ? 'compra' : 'compras'} a cuotas` : '',
    totals.owe ? `debes ${money(totals.owe, { compact: true })}` : '',
    totals.owed ? `te deben ${money(totals.owed, { compact: true })}` : '',
  ].filter(Boolean);
  const groups: { title: string; items: Item[] }[] = [
    {
      title: 'Tu dinero',
      items: [
        ...moved,
        {
          icon: 'layers', color: colors.primary, title: 'Compromisos', href: '/compromisos',
          subtitle: commitments.length ? commitments.join(' · ') : 'Gastos fijos, cuotas, deudas, gastos planeados e ingresos extra',
        },
        {
          icon: 'calendar', color: '#8B5CF6', title: 'Calendario', href: '/calendario',
          subtitle: planned ? `${planned} ${planned === 1 ? 'gasto planeado' : 'gastos planeados'} · lo que entra y sale cada día` : 'Bonos, aguinaldo y gastos que ya sabes que vienen',
        },
        { icon: 'pie-chart', color: '#F97316', title: 'Presupuesto y categorías', href: '/categorias', subtitle: 'Topes mensuales por categoría' },
        { icon: 'business', color: '#0EA5E9', title: 'Cuentas', href: '/cuentas', subtitle: `${db.accounts.length} ${db.accounts.length === 1 ? 'cuenta' : 'cuentas'}` },
      ],
    },
    {
      title: 'Análisis',
      items: [
        { icon: 'trending-up', color: colors.primary, title: 'Plan y meta de fin de mes', href: '/plan', subtitle: goal },
        { icon: 'bar-chart', color: colors.positive, title: 'Reportes', href: '/reportes', subtitle: 'Mes a mes y balance del año' },
        { icon: 'download', color: '#0EA5E9', title: 'Exportar datos a Excel', href: '/exportar', subtitle: 'Un libro por cada mes, con fecha y día' },
      ],
    },
    {
      title: 'Configuración',
      items: [
        { icon: 'color-palette', color: '#EC4899', title: 'Apariencia', href: '/apariencia', subtitle: 'Tema, color, pestañas y pantalla de inicio' },
        {
          icon: 'shield-checkmark', color: colors.positive, title: 'Seguridad', href: '/seguridad',
          subtitle: `Sin internet · ${health.mode === 'cifrado' ? 'datos cifrados' : 'datos sin cifrar'} · ${db.settings.lockEnabled ? 'bloqueo activado' : 'bloqueo desactivado'}`,
        },
        { icon: 'settings', color: '#64748B', title: 'Ajustes', href: '/ajustes', subtitle: 'Días de pago, recordatorios y respaldo' },
      ],
    },
  ];

  return (
    <Screen title="Más" tabs>
      {groups.map((group, index) => (
        <FadeIn key={group.title} index={index}>
          <SectionTitle title={group.title} />
          <Card style={{ paddingVertical: space.xs }}>
            {group.items.map((item, i) => (
              <Row
                key={item.href}
                icon={item.icon}
                color={item.color}
                title={item.title}
                subtitle={item.subtitle}
                subtitleLines={2}
                chevron
                last={i === group.items.length - 1}
                onPress={() => router.push(item.href)}
              />
            ))}
          </Card>
        </FadeIn>
      ))}
      <Txt variant="small" muted center style={{ marginTop: space.xl }}>
        Mis Finanzas · versión {APP_VERSION}
      </Txt>
    </Screen>
  );
}

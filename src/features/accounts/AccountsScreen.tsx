import { router } from 'expo-router';

import { accountBalances } from '@/core/balances';
import { useDb } from '@/data/hooks';
import { Card, EmptyState, FadeIn, IconButton, Money, Row, Screen, space, Txt } from '@/ui';

export default function AccountsScreen() {
  const db = useDb();
  const balances = accountBalances(db);
  const total = Object.values(balances).reduce((a, b) => a + b, 0);

  return (
    <Screen title="Cuentas" subtitle="Donde está tu dinero" back right={<IconButton icon="add" label="Nueva cuenta" onPress={() => router.push('/cuenta')} />}>
      {db.accounts.length === 0 ? (
        <EmptyState icon="business" title="Sin cuentas" message="Agrega tu cuenta del banco y, si quieres, tu efectivo." action="Agregar cuenta" onAction={() => router.push('/cuenta')} />
      ) : (
        <FadeIn>
          <Card style={{ paddingVertical: space.xs }}>
            {db.accounts.map((account) => (
              <Row
                key={account.id}
                icon={account.kind === 'efectivo' ? 'cash' : 'business'}
                color={account.color}
                title={account.name}
                subtitle={account.kind === 'efectivo' ? 'Efectivo' : 'Cuenta de banco'}
                chevron
                onPress={() => router.push({ pathname: '/cuenta', params: { id: account.id } })}
                right={<Money value={balances[account.id] ?? 0} toned />}
              />
            ))}
            <Row title="Total" last right={<Money value={total} toned variant="heading" />} />
          </Card>
          <Txt variant="small" muted style={{ marginTop: space.md }}>
            El saldo se calcula solo: saldo inicial más ingresos, menos gastos y pagos.
          </Txt>
        </FadeIn>
      )}
    </Screen>
  );
}

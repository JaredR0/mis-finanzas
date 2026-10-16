import { router } from 'expo-router';
import { View } from 'react-native';

import { dayHeading } from '@/core/dates';
import type { Database, ISODate, Transaction } from '@/core/types';
import { Card, iconName, Money, Row, space, Tag, Txt, useColors } from '@/ui';

import { describeTx } from './describeTx';

/** Ordena del más reciente al más antiguo. */
export const newestFirst = (a: Transaction, b: Transaction): number =>
  a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1;

export function TxRow({ db, tx, last }: { db: Database; tx: Transaction; last?: boolean }) {
  const colors = useColors();
  const view = describeTx(db, tx);
  return (
    <Row
      icon={iconName(view.icon)}
      color={view.color}
      title={view.title}
      subtitle={view.subtitle}
      last={last}
      onPress={() => router.push({ pathname: '/movimiento', params: { id: tx.id } })}
      right={
        <View style={{ alignItems: 'flex-end', gap: 3 }}>
          {view.flow === 'neutral' ? (
            <Money value={tx.amount} color={colors.muted} />
          ) : (
            <Money value={tx.amount} tone={view.flow} />
          )}
          {tx.needsReview ? <Tag label="Por revisar" tone="warning" /> : null}
        </View>
      }
    />
  );
}

/** Movimientos agrupados por día, cada día en su tarjeta. */
export function TxList({ db, transactions, today }: { db: Database; transactions: Transaction[]; today: ISODate }) {
  const groups: { date: ISODate; items: Transaction[] }[] = [];
  for (const tx of [...transactions].sort(newestFirst)) {
    const current = groups[groups.length - 1];
    if (current && current.date === tx.date) current.items.push(tx);
    else groups.push({ date: tx.date, items: [tx] });
  }
  return (
    <View style={{ gap: space.lg }}>
      {groups.map((group) => (
        <View key={group.date} style={{ gap: space.sm }}>
          <Txt variant="caption" muted>
            {dayHeading(group.date, today)}
          </Txt>
          <Card style={{ paddingVertical: space.xs }}>
            {group.items.map((tx, index) => (
              <TxRow key={tx.id} db={db} tx={tx} last={index === group.items.length - 1} />
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}

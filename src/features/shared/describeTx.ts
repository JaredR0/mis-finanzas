import { txTypeLabel } from '@/core/exportData';
import type { Database, Transaction } from '@/core/types';

export interface TxView {
  icon: string;
  color: string;
  title: string;
  subtitle: string;
  /** 'in' = entra dinero (verde), 'out' = sale (rojo), 'neutral' = solo se mueve. */
  flow: 'in' | 'out' | 'neutral';
}

const find = <T extends { id: string }>(list: T[], id?: string): T | undefined =>
  id ? list.find((x) => x.id === id) : undefined;

/** Cómo se muestra un movimiento en una lista: icono, textos y dirección del dinero. */
export function describeTx(db: Database, tx: Transaction): TxView {
  const account = find(db.accounts, tx.accountId);
  const card = find(db.cards, tx.cardId);
  const category = find(db.categories, tx.categoryId);
  const envelope = find(db.envelopes, tx.envelopeId);
  const debt = find(db.debts, tx.debtId);
  const paidWith = card?.name ?? account?.name ?? '';
  const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' · ');

  switch (tx.type) {
    case 'gasto':
      return {
        icon: category?.icon ?? 'pricetag',
        color: category?.color ?? '#64748B',
        title: tx.note || tx.merchant || category?.name || 'Gasto',
        subtitle: join(category?.name ?? 'Sin categoría', paidWith, envelope && `de ${envelope.name}`),
        flow: 'out',
      };
    case 'ingreso':
      return {
        icon: category?.icon ?? 'cash',
        color: category?.color ?? '#22C55E',
        title: tx.note || category?.name || 'Ingreso',
        subtitle: join(category?.name, account?.name),
        flow: 'in',
      };
    case 'pago_tarjeta':
      return {
        icon: 'card',
        color: card?.color ?? '#6366F1',
        title: tx.note || `Pago ${card?.name ?? 'tarjeta'}`,
        subtitle: join('Pago de tarjeta', account?.name),
        flow: 'out',
      };
    case 'transferencia':
      return {
        icon: 'swap-horizontal',
        color: '#0EA5E9',
        title: tx.note || 'Transferencia',
        subtitle: `${account?.name ?? '?'} → ${find(db.accounts, tx.toAccountId)?.name ?? '?'}`,
        flow: 'neutral',
      };
    case 'aporte':
      return {
        icon: envelope?.icon ?? 'wallet',
        color: envelope?.color ?? '#22C55E',
        title: tx.note || `Apartado a ${envelope?.name ?? 'apartado'}`,
        subtitle: 'Dinero reservado',
        flow: 'neutral',
      };
    case 'retiro':
      return {
        icon: envelope?.icon ?? 'wallet',
        color: envelope?.color ?? '#22C55E',
        title: tx.note || `Sacado de ${envelope?.name ?? 'apartado'}`,
        subtitle: 'Vuelve a estar libre',
        flow: 'neutral',
      };
    case 'abono_deuda': {
      const owes = debt?.direction !== 'me_deben';
      return {
        icon: owes ? 'trending-down' : 'trending-up',
        color: owes ? '#F43F5E' : '#22C55E',
        title: tx.note || (owes ? `Abono a ${debt?.name ?? 'deuda'}` : `Me pagó ${debt?.name ?? ''}`.trim()),
        subtitle: join(owes ? 'Abono a deuda' : 'Cobro', account?.name),
        flow: owes ? 'out' : 'in',
      };
    }
    case 'prestamo': {
      const received = debt?.direction !== 'me_deben';
      return {
        icon: 'people',
        color: '#A855F7',
        title: tx.note || (received ? `Préstamo de ${debt?.name ?? ''}` : `Presté a ${debt?.name ?? ''}`).trim(),
        subtitle: join(txTypeLabel('prestamo'), account?.name),
        flow: received ? 'in' : 'out',
      };
    }
  }
}

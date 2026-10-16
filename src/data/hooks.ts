import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AppState as NativeAppState } from 'react-native';

import { overview, type Overview } from '@/core/balances';
import { todayISO } from '@/core/dates';
import { formatMoney, type MoneyFormat } from '@/core/money';
import type { Cents, Database, ISODate } from '@/core/types';

import { useStore } from './store';

/** true cuando ya se leyeron los datos guardados en el teléfono. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useStore.persist.onFinishHydration(onChange),
    () => useStore.persist.hasHydrated(),
    () => false,
  );
}

/** La fecha de hoy; se actualiza al volver a la app y al pasar la medianoche. */
export function useToday(): ISODate {
  const [today, setToday] = useState(todayISO);
  useEffect(() => {
    const refresh = () => setToday(todayISO());
    const subscription = NativeAppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const timer = setInterval(refresh, 60_000);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, []);
  return today;
}

/** Toda la base de datos (y las acciones). Se vuelve a pintar cuando algo cambia. */
export const useDb = () => useStore();

export function useOverview(today: ISODate): Overview {
  const db = useDb();
  return useMemo(() => overview(db, today), [db, today]);
}

/** Formateador de dinero con la moneda configurada. */
export function useMoney(): (cents: Cents, opts?: Omit<MoneyFormat, 'symbol'>) => string {
  const symbol = useStore((s) => s.settings.currency);
  return (cents, opts) => formatMoney(cents, { ...opts, symbol });
}

export const getDb = (): Database => useStore.getState();

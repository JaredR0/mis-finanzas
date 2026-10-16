import { requestPin } from './pinRequest';
import { vault } from './webVault';

/** Versión web: el bloqueo usa el PIN de la app (no hay Face ID para páginas web). */
export type LockSupport = 'disponible' | 'sin_codigo';

export async function lockSupport(): Promise<LockSupport> {
  return vault.exists() ? 'disponible' : 'sin_codigo';
}

export async function authenticate(reason: string): Promise<boolean> {
  if (!vault.exists()) return false;
  const pin = await requestPin('verificar', {
    reason,
    cancellable: true,
    check: async (candidate) => (await vault.unwrap(candidate)) !== null,
  });
  return pin !== null;
}

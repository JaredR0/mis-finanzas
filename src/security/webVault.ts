import { createPinVault, type VaultStore, webDerive } from './pinVault';
import { requestPin } from './pinRequest';

/**
 * La bóveda del PIN de la versión web, guardada en el almacenamiento del
 * navegador (solo en este teléfono, solo para esta dirección).
 */

const localStore: VaultStore = {
  read: (name) => globalThis.localStorage?.getItem(name) ?? null,
  write: (name, value) => globalThis.localStorage?.setItem(name, value),
  remove: (name) => globalThis.localStorage?.removeItem(name),
};

const randomBytes = (count: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(count));

export const vault = createPinVault(localStore, webDerive, randomBytes);

/** Pide el PIN actual y luego uno nuevo; la llave de los datos no cambia. */
export async function changePin(): Promise<boolean> {
  let key: Uint8Array | null = null;
  const current = await requestPin('verificar', {
    title: 'PIN actual',
    reason: 'Para cambiarlo, primero escribe tu PIN de ahora.',
    cancellable: true,
    check: async (pin) => (key = await vault.unwrap(pin)) !== null,
  });
  if (!current || !key) return false;
  const next = await requestPin('crear', {
    title: 'PIN nuevo',
    cancellable: true,
  });
  if (!next) return false;
  await vault.wrap(next, key);
  return true;
}

/** PIN olvidado: borra la bóveda y todos los datos de la app en este navegador. */
export function eraseEverything(): void {
  const storage = globalThis.localStorage;
  if (storage) {
    const names: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const name = storage.key(i);
      if (name && name.startsWith('mis-finanzas')) names.push(name);
    }
    names.forEach((name) => storage.removeItem(name));
  }
  vault.destroy();
  globalThis.location?.reload();
}

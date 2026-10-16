import { requestPin } from "./pinRequest";
import type { KeyStore } from "./secureStorage";
import { vault } from "./webVault";

/**
 * Versión web: no hay llavero del teléfono, así que la llave de los datos se
 * guarda envuelta con tu PIN (security/pinVault). Para abrir los datos hay que
 * escribir el PIN; la primera vez se crea.
 */
export const randomBytes = (count: number): Uint8Array =>
  crypto.getRandomValues(new Uint8Array(count));

export const keyStore: KeyStore = {
  available: async () => Boolean(globalThis.crypto?.subtle),
  load: async () => {
    if (!vault.exists()) return null;
    let key: Uint8Array | null = null;
    await requestPin("abrir", {
      check: async (pin) => (key = await vault.unwrap(pin)) !== null,
    });
    if (!key) throw new Error("no se ingresó el PIN");
    return key;
  },
  save: async (key) => {
    const pin = await requestPin("crear");
    if (!pin) throw new Error("no se creó el PIN");
    await vault.wrap(pin, key);
  },
};

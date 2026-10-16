import {
  fromBase64,
  isSealed,
  KEY_BYTES,
  NONCE_BYTES,
  open,
  seal,
  toBase64,
} from "./seal";

/**
 * Bóveda de la versión web: la llave que cifra los datos se guarda envuelta
 * (cifrada) con otra llave que sale del PIN. Sin el PIN, lo guardado en el
 * navegador es ilegible.
 *
 *   PIN ──PBKDF2-SHA256 (600 000 vueltas, sal aleatoria)──▶ llave del PIN
 *   llave de datos (32 bytes al azar) ──XChaCha20-Poly1305 con la llave del PIN──▶ "envuelta"
 *
 * Solo se guarda: la sal, el número de vueltas y la llave envuelta. Nunca el PIN.
 * Este archivo es lógica pura: recibe dónde guardar y cómo derivar, para poder probarlo.
 */

export const PIN_LENGTH = 6;
export const PBKDF2_ITERATIONS = 600_000;
const SALT_BYTES = 16;
const VAULT_VERSION = 1;

/** Intentos fallidos permitidos antes de hacer esperar, y espera base (se duplica). */
export const FREE_ATTEMPTS = 5;
export const BASE_WAIT_MS = 30_000;

export interface VaultRecord {
  v: number;
  salt: string;
  iter: number;
  wrapped: string;
}

export interface Attempts {
  failed: number;
  /** Momento (ms) hasta el que no se acepta otro intento. */
  waitUntil: number;
}

export interface VaultStore {
  read(name: string): string | null;
  write(name: string, value: string): void;
  remove(name: string): void;
}

export type Derive = (
  pin: string,
  salt: Uint8Array,
  iterations: number,
) => Promise<Uint8Array>;

export const VAULT_KEY = "mis-finanzas/boveda";
export const ATTEMPTS_KEY = "mis-finanzas/intentos";

export const isValidPin = (pin: string): boolean =>
  new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);

/** PIN demasiado fácil de adivinar (todos iguales o seguidos). */
export function isWeakPin(pin: string): boolean {
  if (/^(\d)\1+$/.test(pin)) return true;
  const digits = pin.split("").map(Number);
  const steps = digits.slice(1).map((d, i) => d - digits[i]);
  return steps.every((s) => s === 1) || steps.every((s) => s === -1);
}

/** PBKDF2 con la criptografía del propio navegador. */
export const webDerive: Derive = async (pin, salt, iterations) => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle)
    throw new Error(
      "Este navegador no permite cifrar (abre la app desde su enlace https).",
    );
  const material = await subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations },
    material,
    KEY_BYTES * 8,
  );
  return new Uint8Array(bits);
};

export function createPinVault(
  store: VaultStore,
  derive: Derive,
  randomBytes: (n: number) => Uint8Array,
  now: () => number = Date.now,
) {
  const readRecord = (): VaultRecord | null => {
    const raw = store.read(VAULT_KEY);
    if (!raw) return null;
    try {
      const rec = JSON.parse(raw) as VaultRecord;
      if (
        rec &&
        typeof rec.salt === "string" &&
        typeof rec.wrapped === "string" &&
        isSealed(rec.wrapped) &&
        Number.isFinite(rec.iter)
      )
        return rec;
    } catch {
      // registro dañado: se trata como inexistente para lectura, pero no se sobrescribe sin querer
    }
    return null;
  };

  const attempts = (): Attempts => {
    try {
      const a = JSON.parse(store.read(ATTEMPTS_KEY) ?? "") as Attempts;
      if (Number.isFinite(a.failed) && Number.isFinite(a.waitUntil)) return a;
    } catch {
      // sin registro
    }
    return { failed: 0, waitUntil: 0 };
  };

  /** Milisegundos que faltan para poder intentar otra vez (0 = ya se puede). */
  const waitLeft = (): number => Math.max(0, attempts().waitUntil - now());

  const fail = () => {
    const a = attempts();
    const failed = a.failed + 1;
    const extra =
      failed >= FREE_ATTEMPTS
        ? BASE_WAIT_MS * 2 ** Math.min(failed - FREE_ATTEMPTS, 6)
        : 0;
    store.write(
      ATTEMPTS_KEY,
      JSON.stringify({ failed, waitUntil: extra ? now() + extra : 0 }),
    );
  };

  async function wrap(pin: string, key: Uint8Array): Promise<void> {
    if (!isValidPin(pin))
      throw new Error(`El PIN debe tener ${PIN_LENGTH} números.`);
    if (key.length !== KEY_BYTES) throw new Error("Llave de tamaño inválido");
    const salt = randomBytes(SALT_BYTES);
    const pinKey = await derive(pin, salt, PBKDF2_ITERATIONS);
    const record: VaultRecord = {
      v: VAULT_VERSION,
      salt: toBase64(salt),
      iter: PBKDF2_ITERATIONS,
      wrapped: seal(toBase64(key), pinKey, randomBytes(NONCE_BYTES)),
    };
    store.write(VAULT_KEY, JSON.stringify(record));
    store.remove(ATTEMPTS_KEY);
  }

  return {
    exists: (): boolean => store.read(VAULT_KEY) !== null,
    waitLeft,
    failedAttempts: (): number => attempts().failed,

    /** Guarda la llave de datos protegida con el PIN (al crear el PIN o al cambiarlo). */
    wrap,

    /** La llave de datos si el PIN es correcto; null si no (y cuenta el intento). */
    async unwrap(pin: string): Promise<Uint8Array | null> {
      if (waitLeft() > 0) return null;
      const record = readRecord();
      if (!record || !isValidPin(pin)) {
        fail();
        return null;
      }
      try {
        const pinKey = await derive(pin, fromBase64(record.salt), record.iter);
        const key = fromBase64(open(record.wrapped, pinKey));
        if (key.length !== KEY_BYTES) throw new Error("llave inválida");
        store.remove(ATTEMPTS_KEY);
        return key;
      } catch {
        fail();
        return null;
      }
    },

    /** Borra la bóveda (PIN olvidado): los datos cifrados quedan ilegibles para siempre. */
    destroy(): void {
      store.remove(VAULT_KEY);
      store.remove(ATTEMPTS_KEY);
    },
  };
}

export type PinVault = ReturnType<typeof createPinVault>;

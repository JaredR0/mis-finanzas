import { isSealed, KEY_BYTES, NONCE_BYTES, open, seal } from './seal';

/**
 * Guardado cifrado, independiente de la plataforma.
 *
 * Recibe por parámetro dónde se guarda (`backend`), dónde vive la llave
 * (`keys`) y de dónde salen los números aleatorios, así se puede probar entero
 * sin teléfono y cambiar cualquiera de las tres piezas sin tocar las demás.
 *
 * Reglas:
 *  - Los datos se guardan siempre cifrados cuando hay llavero disponible.
 *  - Si los datos existen pero no se pueden abrir, NUNCA se sobrescriben:
 *    la app muestra el error y deja reintentar.
 *  - Datos antiguos sin cifrar se cifran en cuanto se leen.
 */

export interface Backend {
  getItem(name: string): Promise<string | null>;
  setItem(name: string, value: string): Promise<void>;
  removeItem(name: string): Promise<void>;
}

export interface KeyStore {
  /** false = este dispositivo no tiene llavero seguro (p. ej. la versión web). */
  available(): Promise<boolean>;
  /** La llave guardada, o null si todavía no existe. Lanza error si el llavero no responde. */
  load(): Promise<Uint8Array | null>;
  save(key: Uint8Array): Promise<void>;
}

export type StorageMode = 'cifrado' | 'sin_cifrar' | 'desconocido';

export interface StorageHealth {
  mode: StorageMode;
  /** Mensaje si los datos no se pudieron abrir. Mientras exista, no se escribe nada. */
  error: string | null;
  /** true si se encontraron datos cifrados con una llave que ya no existe y se apartaron. */
  setAside: boolean;
}

interface Options {
  backend: Backend;
  keys: KeyStore;
  randomBytes: (count: number) => Uint8Array;
  /** Milisegundos que se espera para juntar varios cambios en una sola escritura. */
  debounceMs?: number;
  onHealth?: (health: StorageHealth) => void;
}

export const UNREADABLE_SUFFIX = ':ilegible';
const SELF_TEST = 'prueba ✓ ñ 123';

export function createSecureStorage({ backend, keys, randomBytes, debounceMs = 150, onHealth }: Options) {
  let key: Uint8Array | null = null;
  let health: StorageHealth = {
    mode: 'desconocido',
    error: null,
    setAside: false,
  };
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let writing: Promise<void> = Promise.resolve();

  const report = (patch: Partial<StorageHealth>) => {
    health = { ...health, ...patch };
    onHealth?.(health);
  };

  const works = (candidate: Uint8Array): boolean => {
    try {
      return open(seal(SELF_TEST, candidate, randomBytes(NONCE_BYTES)), candidate) === SELF_TEST;
    } catch {
      return false;
    }
  };

  type Readiness = 'lista' | 'sin_llavero' | 'llave_perdida' | 'cifrado_falla';

  /** Deja lista la llave, o dice por qué no se puede cifrar en este dispositivo. */
  async function prepare(hasSealedData: boolean): Promise<Readiness> {
    if (key) return 'lista';
    if (!(await keys.available())) return 'sin_llavero';
    let candidate = await keys.load();
    if (!candidate) {
      if (hasSealedData) return 'llave_perdida';
      candidate = randomBytes(KEY_BYTES);
      if (candidate.length !== KEY_BYTES || !works(candidate)) return 'cifrado_falla';
      await keys.save(candidate);
    } else if (candidate.length !== KEY_BYTES || !works(candidate)) {
      return 'cifrado_falla';
    }
    key = candidate;
    return 'lista';
  }

  async function getItem(name: string): Promise<string | null> {
    try {
      const raw = await backend.getItem(name);
      const sealed = raw !== null && isSealed(raw);
      const readiness = await prepare(sealed);
      const canEncrypt = readiness === 'lista';

      if (raw === null) {
        report({ mode: canEncrypt ? 'cifrado' : 'sin_cifrar', error: null });
        return null;
      }
      if (!sealed) {
        // Datos de una versión anterior (o de un dispositivo sin llavero): se cifran ya.
        if (key) await backend.setItem(name, seal(raw, key, randomBytes(NONCE_BYTES)));
        report({ mode: canEncrypt ? 'cifrado' : 'sin_cifrar', error: null });
        return raw;
      }
      if (readiness === 'llave_perdida') {
        // Datos cifrados cuya llave ya no existe (p. ej. restaurados en otro teléfono): no se
        // pueden abrir. Se apartan sin borrarlos y la app empieza de cero; el respaldo los recupera.
        await backend.setItem(name + UNREADABLE_SUFFIX, raw);
        await backend.removeItem(name);
        const fresh = await prepare(false);
        report({
          mode: fresh === 'lista' ? 'cifrado' : 'sin_cifrar',
          error: null,
          setAside: true,
        });
        return null;
      }
      if (!key) {
        throw new Error(
          readiness === 'sin_llavero' ? 'los datos están cifrados y este dispositivo no tiene llavero seguro' : 'el cifrado no funciona en este dispositivo',
        );
      }
      const plain = open(raw, key);
      report({ mode: 'cifrado', error: null });
      return plain;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : 'error desconocido';
      report({ error: `No se pudieron abrir tus datos (${detail}).` });
      throw cause;
    }
  }

  function write(name: string, value: string): Promise<void> {
    writing = writing.catch(() => {}).then(() => backend.setItem(name, key ? seal(value, key, randomBytes(NONCE_BYTES)) : value));
    return writing;
  }

  /** Escribe de inmediato lo que esté en espera (se llama al salir de la app). */
  function flush(): Promise<void> {
    if (timer) clearTimeout(timer);
    timer = null;
    if (health.error || health.mode === 'desconocido') {
      pending.clear();
      return writing;
    }
    const batch = [...pending.entries()];
    pending.clear();
    for (const [name, value] of batch) void write(name, value);
    return writing;
  }

  function setItem(name: string, value: string): void {
    // Nunca se escribe encima de datos que no se pudieron leer.
    if (health.error || health.mode === 'desconocido') return;
    pending.set(name, value);
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void flush(), debounceMs);
  }

  async function removeItem(name: string): Promise<void> {
    pending.delete(name);
    await writing.catch(() => {});
    await backend.removeItem(name);
  }

  /**
   * Lee un dato secundario (no la base principal) sin tocar el estado del guardado:
   * devuelve null si no existe o no se puede abrir, y nunca crea una llave.
   */
  async function peek(name: string): Promise<string | null> {
    try {
      const raw = await backend.getItem(name);
      if (raw === null || !isSealed(raw)) return raw;
      let candidate = key;
      if (!candidate) {
        if (!(await keys.available())) return null;
        candidate = await keys.load();
      }
      if (!candidate || candidate.length !== KEY_BYTES) return null;
      return open(raw, candidate);
    } catch {
      return null;
    }
  }

  return { getItem, setItem, removeItem, flush, peek, health: () => health };
}

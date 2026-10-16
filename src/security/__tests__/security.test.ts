/// <reference types="node" />
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { blockedAttempts, installNetworkGuard, NetworkBlockedError } from '../networkGuard';
import { fromBase64, isSealed, open, seal, toBase64, utf8Decode, utf8Encode } from '../seal';
import { type Backend, createSecureStorage, type KeyStore, UNREADABLE_SUFFIX } from '../secureStorage';

const key = (fill: number) => new Uint8Array(32).fill(fill);
const nonce = (fill: number) => new Uint8Array(24).fill(fill);

describe('cifrado', () => {
  const text = JSON.stringify({ nota: 'Café ñandú — Q1,234.50 €', emoji: '💸🇬🇹', vacio: '' });

  it('lo cifrado no se parece al original y vuelve idéntico con la llave', () => {
    const sealed = seal(text, key(7), nonce(1));
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain('Café');
    expect(sealed).not.toContain('1,234');
    expect(open(sealed, key(7))).toBe(text);
  });

  it('con otra llave no abre', () => {
    expect(() => open(seal(text, key(7), nonce(1)), key(8))).toThrow();
  });

  it('detecta cualquier alteración del contenido', () => {
    const sealed = seal(text, key(7), nonce(1));
    const bytes = fromBase64(sealed.slice(4));
    for (const position of [0, 30, bytes.length - 1]) {
      const tampered = bytes.slice();
      tampered[position] ^= 1;
      expect(() => open('mf1:' + toBase64(tampered), key(7))).toThrow();
    }
    expect(() => open('mf1:' + toBase64(bytes.slice(0, 20)), key(7))).toThrow();
    expect(() => open(text, key(7))).toThrow();
  });

  it('el mismo texto con otro nonce da otro resultado', () => {
    expect(seal(text, key(7), nonce(1))).not.toBe(seal(text, key(7), nonce(2)));
  });

  it('rechaza llaves y nonces de tamaño incorrecto', () => {
    expect(() => seal(text, new Uint8Array(16), nonce(1))).toThrow();
    expect(() => seal(text, key(1), new Uint8Array(12))).toThrow();
  });

  it('convierte texto y base64 sin perder nada, también en tamaños grandes', () => {
    const big = 'Movimiento ñ 💸 '.repeat(20000);
    expect(utf8Decode(utf8Encode(big))).toBe(big);
    expect(Array.from(utf8Encode('ñ€💸'))).toEqual(Array.from(new TextEncoder().encode('ñ€💸')));
    for (const length of [0, 1, 2, 3, 4, 5, 1000, 30001]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 37 + 11) % 256);
      const encoded = toBase64(bytes);
      expect(encoded).toBe(Buffer.from(bytes).toString('base64'));
      expect(Array.from(fromBase64(encoded))).toEqual(Array.from(bytes));
    }
    expect(open(seal(big, key(3), nonce(9)), key(3))).toBe(big);
  });
});

describe('guardado cifrado', () => {
  const memory = () => {
    const data = new Map<string, string>();
    const backend: Backend = {
      getItem: async (name) => data.get(name) ?? null,
      setItem: async (name, value) => void data.set(name, value),
      removeItem: async (name) => void data.delete(name),
    };
    return { data, backend };
  };
  const keychain = (initial: Uint8Array | null = null, available = true) => {
    const state = { key: initial, fail: false };
    const keys: KeyStore = {
      available: async () => available,
      load: async () => {
        if (state.fail) throw new Error('llavero bloqueado');
        return state.key;
      },
      save: async (k) => void (state.key = k),
    };
    return { state, keys };
  };
  let counter = 0;
  const randomBytes = (n: number) => new Uint8Array(n).map((_, i) => (i * 13 + ++counter) % 256);
  const make = (backend: Backend, keys: KeyStore) => createSecureStorage({ backend, keys, randomBytes, debounceMs: 0 });

  it('lectura secundaria (widget): descifra, y si falla devuelve null sin crear llave ni marcar error', async () => {
    const { data, backend } = memory();
    const { state, keys } = keychain();
    expect(await make(backend, keys).peek('widget')).toBeNull();
    expect(state.key).toBeNull(); // leer no crea la llave

    const storage = make(backend, keys);
    await storage.getItem('db');
    storage.setItem('widget', '{"free":80000}');
    await storage.flush();
    expect(data.get('widget')).not.toContain('80000');
    expect(await make(backend, keys).peek('widget')).toBe('{"free":80000}');

    data.set('widget', data.get('widget')!.slice(0, -4) + 'AAAA');
    expect(await storage.peek('widget')).toBeNull();
    state.fail = true;
    expect(await make(backend, keys).peek('widget')).toBeNull();
    expect(storage.health()).toMatchObject({ mode: 'cifrado', error: null });
  });

  it('guarda cifrado y lee lo mismo; crea la llave la primera vez', async () => {
    const { data, backend } = memory();
    const { state, keys } = keychain();
    const storage = make(backend, keys);
    expect(await storage.getItem('db')).toBeNull();
    expect(state.key).toHaveLength(32);
    storage.setItem('db', '{"saldo":500000}');
    await storage.flush();
    expect(isSealed(data.get('db')!)).toBe(true);
    expect(data.get('db')).not.toContain('saldo');
    expect(await make(backend, keys).getItem('db')).toBe('{"saldo":500000}');
    expect(storage.health()).toMatchObject({ mode: 'cifrado', error: null });
  });

  it('cifra de inmediato los datos antiguos sin cifrar', async () => {
    const { data, backend } = memory();
    data.set('db', '{"viejo":true}');
    const storage = make(backend, keychain().keys);
    expect(await storage.getItem('db')).toBe('{"viejo":true}');
    expect(isSealed(data.get('db')!)).toBe(true);
  });

  it('junta cambios seguidos y guarda solo el último', async () => {
    const { data, backend } = memory();
    const spy = vi.spyOn(backend, 'setItem');
    const { keys } = keychain();
    const storage = createSecureStorage({ backend, keys, randomBytes, debounceMs: 50 });
    await storage.getItem('db');
    storage.setItem('db', 'uno');
    storage.setItem('db', 'dos');
    storage.setItem('db', 'tres');
    await storage.flush();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await make(backend, keys).getItem('db')).toBe('tres');
    expect(data.size).toBe(1);
  });

  it('si el llavero falla, avisa y no sobrescribe los datos', async () => {
    const { data, backend } = memory();
    const { state, keys } = keychain();
    const first = make(backend, keys);
    await first.getItem('db');
    first.setItem('db', 'importante');
    await first.flush();
    const saved = data.get('db');

    state.fail = true;
    const storage = make(backend, keys);
    await expect(storage.getItem('db')).rejects.toThrow('llavero bloqueado');
    expect(storage.health().error).toContain('No se pudieron abrir');
    storage.setItem('db', 'vacío por error');
    await storage.flush();
    expect(data.get('db')).toBe(saved);

    state.fail = false; // reintento
    expect(await storage.getItem('db')).toBe('importante');
    expect(storage.health().error).toBeNull();
  });

  it('si el contenido fue alterado, avisa y no lo sobrescribe', async () => {
    const { data, backend } = memory();
    const { keys } = keychain(key(5));
    data.set('db', seal('datos', key(5), nonce(1)).slice(0, -6) + 'AAAAA=');
    const storage = make(backend, keys);
    const before = data.get('db');
    await expect(storage.getItem('db')).rejects.toThrow();
    storage.setItem('db', 'x');
    await storage.flush();
    expect(data.get('db')).toBe(before);
  });

  it('si la llave ya no existe, aparta los datos sin borrarlos y empieza de cero', async () => {
    const { data, backend } = memory();
    const sealed = seal('datos de otro teléfono', key(9), nonce(1));
    data.set('db', sealed);
    const { keys } = keychain(null);
    const storage = make(backend, keys);
    expect(await storage.getItem('db')).toBeNull();
    expect(data.get('db' + UNREADABLE_SUFFIX)).toBe(sealed);
    expect(storage.health()).toMatchObject({ setAside: true, error: null, mode: 'cifrado' });
    storage.setItem('db', 'nuevo');
    await storage.flush();
    expect(open(data.get('db')!, (await keys.load())!)).toBe('nuevo');
  });

  it('sin llavero (web) funciona sin cifrar y lo declara', async () => {
    const { data, backend } = memory();
    const storage = make(backend, keychain(null, false).keys);
    expect(await storage.getItem('db')).toBeNull();
    storage.setItem('db', 'plano');
    await storage.flush();
    expect(data.get('db')).toBe('plano');
    expect(storage.health().mode).toBe('sin_cifrar');
  });

  it('no escribe nada antes de haber leído', async () => {
    const { data, backend } = memory();
    const storage = make(backend, keychain().keys);
    storage.setItem('db', 'prematuro');
    await storage.flush();
    expect(data.size).toBe(0);
  });
});

describe('guardia de red', () => {
  it('bloquea fetch, XMLHttpRequest, WebSocket y sendBeacon, y cuenta los intentos', async () => {
    const target: Record<string, any> = {
      fetch: () => Promise.resolve('respuesta'),
      XMLHttpRequest: class {},
      WebSocket: class {},
      navigator: { sendBeacon: () => true },
    };
    const before = blockedAttempts();
    installNetworkGuard(target);
    await expect(target.fetch('https://ejemplo.com')).rejects.toBeInstanceOf(NetworkBlockedError);
    expect(() => new target.XMLHttpRequest()).toThrow(NetworkBlockedError);
    expect(() => new target.WebSocket('wss://ejemplo.com')).toThrow(NetworkBlockedError);
    expect(() => new target.EventSource('https://ejemplo.com')).toThrow(NetworkBlockedError);
    expect(target.navigator.sendBeacon('https://ejemplo.com', 'datos')).toBe(false);
    expect(blockedAttempts() - before).toBe(5);
  });

  it('no se puede deshacer reasignando fetch', () => {
    const target: Record<string, any> = { fetch: () => 'abierto' };
    installNetworkGuard(target);
    const blocked = target.fetch;
    try {
      target.fetch = () => 'abierto otra vez';
    } catch {
      // en modo estricto la asignación lanza; en ambos casos no debe cambiar
    }
    expect(target.fetch).toBe(blocked);
  });
});

describe('reglas del código', () => {
  const SRC = join(__dirname, '..', '..');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name: string) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === '__tests__' ? [] : files(path);
      return /\.tsx?$/.test(name) ? [path] : [];
    });
  const sources = files(SRC).map((path) => ({ path: path.slice(SRC.length + 1), code: readFileSync(path, 'utf8') }));
  const offenders = (pattern: RegExp, allowed: string[] = []) =>
    sources.filter((f) => !allowed.includes(f.path) && pattern.test(f.code)).map((f) => f.path);

  it('ningún archivo de la app usa la red', () => {
    expect(offenders(/\bfetch\s*\(|XMLHttpRequest|new WebSocket|EventSource|sendBeacon|axios/, ['security/networkGuard.ts'])).toEqual([]);
  });

  it('ningún archivo contiene direcciones web', () => {
    // La única excepción es el identificador de formato que exige el estándar de Excel.
    expect(offenders(/https?:\/\//, ['services/xlsxWriter.ts'])).toEqual([]);
    expect(readFileSync(join(SRC, 'services/xlsxWriter.ts'), 'utf8').match(/https?:\/\/[^'"`\s]+/g)).toEqual(['http://schemas.openxmlformats.org']);
  });

  it('nadie abre enlaces externos ni carga contenido remoto', () => {
    expect(offenders(/Linking\.openURL|openBrowserAsync|WebView|uri:\s*['"`]http/)).toEqual([]);
  });

  it('nadie escribe datos en la consola', () => {
    expect(offenders(/console\.(log|info|debug|warn|error)/)).toEqual([]);
  });

  it('solo la capa de datos toca el almacenamiento', () => {
    expect(offenders(/async-storage/, ['data/backend.ts'])).toEqual([]);
    expect(offenders(/expo-secure-store/, ['security/keyStore.ts'])).toEqual([]);
  });
});

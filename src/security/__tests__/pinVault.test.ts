/// <reference types="node" />
import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { ATTEMPTS_KEY, BASE_WAIT_MS, createPinVault, FREE_ATTEMPTS, isValidPin, isWeakPin, PBKDF2_ITERATIONS, VAULT_KEY, webDerive, type Derive } from '../pinVault';

beforeAll(() => {
  if (!globalThis.crypto?.subtle) Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
});

const memory = () => {
  const data = new Map<string, string>();
  return {
    data,
    read: (n: string) => data.get(n) ?? null,
    write: (n: string, v: string) => void data.set(n, v),
    remove: (n: string) => void data.delete(n),
  };
};
// Mismo algoritmo con menos vueltas para que la prueba sea rápida.
const fastDerive: Derive = (pin, salt) => webDerive(pin, salt, 1000);
const random = (n: number) => webcrypto.getRandomValues(new Uint8Array(n));
const dataKey = () => new Uint8Array(32).map((_, i) => i * 7 + 1);

describe('bóveda del PIN (versión web)', () => {
  it('guarda la llave envuelta y solo la devuelve con el PIN correcto', async () => {
    const store = memory();
    const vault = createPinVault(store, fastDerive, random);
    expect(vault.exists()).toBe(false);
    await vault.wrap('482915', dataKey());
    expect(vault.exists()).toBe(true);
    const saved = store.data.get(VAULT_KEY)!;
    expect(saved).not.toContain('482915');
    expect(JSON.parse(saved).iter).toBe(PBKDF2_ITERATIONS);
    expect(await vault.unwrap('482915')).toEqual(dataKey());
    expect(await vault.unwrap('482916')).toBeNull();
  });

  it('cambiar el PIN conserva la misma llave de datos', async () => {
    const vault = createPinVault(memory(), fastDerive, random);
    await vault.wrap('482915', dataKey());
    const key = (await vault.unwrap('482915'))!;
    await vault.wrap('730261', key);
    expect(await vault.unwrap('482915')).toBeNull();
    expect(await vault.unwrap('730261')).toEqual(dataKey());
  });

  it('después de varios intentos fallidos hace esperar, cada vez más', async () => {
    let clock = 1_000_000;
    const store = memory();
    const vault = createPinVault(store, fastDerive, random, () => clock);
    await vault.wrap('482915', dataKey());
    for (let i = 0; i < FREE_ATTEMPTS - 1; i++) await vault.unwrap('000001');
    expect(vault.waitLeft()).toBe(0);
    await vault.unwrap('000001');
    expect(vault.waitLeft()).toBe(BASE_WAIT_MS);
    // Mientras espera, ni el PIN correcto entra.
    expect(await vault.unwrap('482915')).toBeNull();
    clock += BASE_WAIT_MS;
    await vault.unwrap('000001');
    expect(vault.waitLeft()).toBe(BASE_WAIT_MS * 2);
    clock += BASE_WAIT_MS * 2;
    expect(await vault.unwrap('482915')).toEqual(dataKey());
    expect(store.data.has(ATTEMPTS_KEY)).toBe(false);
  });

  it('detecta una bóveda alterada', async () => {
    const store = memory();
    const vault = createPinVault(store, fastDerive, random);
    await vault.wrap('482915', dataKey());
    const rec = JSON.parse(store.data.get(VAULT_KEY)!);
    rec.wrapped = rec.wrapped.slice(0, -6) + 'AAAAAA';
    store.data.set(VAULT_KEY, JSON.stringify(rec));
    expect(await vault.unwrap('482915')).toBeNull();
  });

  it('borrar la bóveda (PIN olvidado) la elimina', async () => {
    const store = memory();
    const vault = createPinVault(store, fastDerive, random);
    await vault.wrap('482915', dataKey());
    vault.destroy();
    expect(vault.exists()).toBe(false);
    expect(store.data.size).toBe(0);
  });

  it('valida el formato y rechaza PIN fáciles', async () => {
    expect(isValidPin('123456')).toBe(true);
    expect(isValidPin('12345')).toBe(false);
    expect(isValidPin('12a456')).toBe(false);
    expect(isWeakPin('111111')).toBe(true);
    expect(isWeakPin('123456')).toBe(true);
    expect(isWeakPin('987654')).toBe(true);
    expect(isWeakPin('482915')).toBe(false);
    await expect(createPinVault(memory(), fastDerive, random).wrap('12', dataKey())).rejects.toThrow();
  });
});

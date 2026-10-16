import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";

/**
 * Cifrado de los datos guardados.
 *
 * XChaCha20-Poly1305 (cifrado autenticado): sin la llave el contenido es
 * ilegible, y si alguien altera un solo byte, abrirlo falla en vez de
 * devolver datos manipulados.
 *
 * Formato: "mf1:" + base64( nonce de 24 bytes | texto cifrado + etiqueta ).
 * Este archivo es lógica pura: no sabe dónde vive la llave ni dónde se guarda.
 */

export const KEY_BYTES = 32;
export const NONCE_BYTES = 24;
const PREFIX = "mf1:";

export const isSealed = (value: string): boolean => value.startsWith(PREFIX);

export function seal(
  plain: string,
  key: Uint8Array,
  nonce: Uint8Array,
): string {
  if (key.length !== KEY_BYTES) throw new Error("Llave de tamaño inválido");
  if (nonce.length !== NONCE_BYTES) throw new Error("Nonce de tamaño inválido");
  const cipherText = xchacha20poly1305(key, nonce).encrypt(utf8Encode(plain));
  const packed = new Uint8Array(NONCE_BYTES + cipherText.length);
  packed.set(nonce, 0);
  packed.set(cipherText, NONCE_BYTES);
  return PREFIX + toBase64(packed);
}

/** Lanza un error si la llave no corresponde o si el contenido fue alterado. */
export function open(sealed: string, key: Uint8Array): string {
  if (!isSealed(sealed)) throw new Error("El contenido no está cifrado");
  if (key.length !== KEY_BYTES) throw new Error("Llave de tamaño inválido");
  const packed = fromBase64(sealed.slice(PREFIX.length));
  if (packed.length <= NONCE_BYTES)
    throw new Error("Contenido cifrado incompleto");
  const plain = xchacha20poly1305(key, packed.subarray(0, NONCE_BYTES)).decrypt(
    packed.subarray(NONCE_BYTES),
  );
  return utf8Decode(plain);
}

// ───────── Texto ⇄ bytes (propio, para no depender de APIs que cambian entre motores) ─────────

export function utf8Encode(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 3);
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const low = text.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) {
      out[n++] = code;
    } else if (code < 0x800) {
      out[n++] = 0xc0 | (code >> 6);
      out[n++] = 0x80 | (code & 0x3f);
    } else if (code < 0x10000) {
      out[n++] = 0xe0 | (code >> 12);
      out[n++] = 0x80 | ((code >> 6) & 0x3f);
      out[n++] = 0x80 | (code & 0x3f);
    } else {
      out[n++] = 0xf0 | (code >> 18);
      out[n++] = 0x80 | ((code >> 12) & 0x3f);
      out[n++] = 0x80 | ((code >> 6) & 0x3f);
      out[n++] = 0x80 | (code & 0x3f);
    }
  }
  return out.slice(0, n);
}

export function utf8Decode(bytes: Uint8Array): string {
  const parts: string[] = [];
  let units: number[] = [];
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i++];
    let code: number;
    if (b < 0x80) code = b;
    else if (b < 0xe0) code = ((b & 0x1f) << 6) | (bytes[i++] & 0x3f);
    else if (b < 0xf0)
      code =
        ((b & 0x0f) << 12) | ((bytes[i++] & 0x3f) << 6) | (bytes[i++] & 0x3f);
    else
      code =
        ((b & 0x07) << 18) |
        ((bytes[i++] & 0x3f) << 12) |
        ((bytes[i++] & 0x3f) << 6) |
        (bytes[i++] & 0x3f);
    if (code >= 0x10000) {
      code -= 0x10000;
      units.push(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
    } else {
      units.push(code);
    }
    if (units.length >= 8192) {
      parts.push(String.fromCharCode.apply(null, units));
      units = [];
    }
  }
  if (units.length) parts.push(String.fromCharCode.apply(null, units));
  return parts.join("");
}

// ───────── Base64 ─────────

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const LOOKUP = new Uint8Array(128).fill(255);
for (let i = 0; i < ALPHABET.length; i++) LOOKUP[ALPHABET.charCodeAt(i)] = i;

export function toBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    chunk += ALPHABET[a >> 2] + ALPHABET[((a & 3) << 4) | (b >> 4)];
    chunk += i + 1 < bytes.length ? ALPHABET[((b & 15) << 2) | (c >> 6)] : "=";
    chunk += i + 2 < bytes.length ? ALPHABET[c & 63] : "=";
    if (chunk.length >= 8192) {
      parts.push(chunk);
      chunk = "";
    }
  }
  parts.push(chunk);
  return parts.join("");
}

export function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, "");
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let n = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) =>
      i + k < clean.length ? LOOKUP[clean.charCodeAt(i + k) & 127] : 0,
    );
    if (v.includes(255)) throw new Error("Base64 inválido");
    if (n < out.length) out[n++] = (v[0] << 2) | (v[1] >> 4);
    if (n < out.length) out[n++] = ((v[1] & 15) << 4) | (v[2] >> 2);
    if (n < out.length) out[n++] = ((v[2] & 3) << 6) | v[3];
  }
  return out;
}

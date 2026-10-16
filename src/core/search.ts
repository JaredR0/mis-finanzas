import { formatLong, isValidISO, iso, monthName, parts } from './dates';
import { parseAmount } from './money';
import type { Database, ISODate, Transaction } from './types';

/**
 * Buscador de movimientos: una sola caja que entiende texto, montos y fechas.
 *
 *   "campero"        → descripción, comercio, categoría, cuenta, tarjeta, apartado o deuda
 *   "85" · "85.50"   → montos (85 encuentra Q85.00 y Q85.50; 85.50 solo ese)
 *   "06/10" · "6/10/2026" · "2026-10-06" → ese día
 *   "octubre" · "oct 2026" · "viernes"   → ese mes o ese día de la semana
 *
 * Con varias palabras, el movimiento debe coincidir con todas.
 */

const fold = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const MONTHS = Array.from({ length: 12 }, (_, i) => fold(monthName(i + 1)));

interface DateQuery {
  day?: number;
  month?: number;
  year?: number;
}

/** Interpreta una palabra como fecha ("6/10", "06-10-2026", "2026-10-06"); null si no lo es. */
function parseDateWord(word: string): DateQuery | null {
  if (isValidISO(word)) {
    const { y, m, d } = parts(word);
    return { day: d, month: m, year: y };
  }
  const match = word.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  const year = match[3] ? (match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3])) : undefined;
  return { day, month, year };
}

type Matcher = (tx: Transaction, haystack: string) => boolean;

function matcherFor(word: string): Matcher {
  const date = parseDateWord(word);
  if (date) {
    return (tx) => {
      const { y, m, d } = parts(tx.date);
      return d === date.day && m === date.month && (date.year === undefined || y === date.year);
    };
  }

  const monthIndex = word.length >= 3 ? MONTHS.findIndex((name) => name.startsWith(word)) : -1;
  if (/^\d{4}$/.test(word) && Number(word) >= 2000 && Number(word) <= 2100) {
    // Un año… o un monto de cuatro cifras: se aceptan los dos.
    const cents = Number(word) * 100;
    return (tx, haystack) => tx.date.startsWith(word) || Math.floor(tx.amount / 100) * 100 === cents || haystack.includes(word);
  }

  if (/^[Qq$]?\d[\d.,]*$/.test(word)) {
    const cents = parseAmount(word);
    const exact = /[.,]\d{1,2}$/.test(word);
    return (tx, haystack) => {
      if (cents !== null && (exact ? tx.amount === cents : Math.floor(tx.amount / 100) * 100 === cents)) return true;
      return haystack.includes(word.replace(/^[q$]/i, ''));
    };
  }

  return (tx, haystack) => {
    if (haystack.includes(word)) return true;
    if (monthIndex >= 0 && parts(tx.date).m === monthIndex + 1) return true;
    return false;
  };
}

/** Todo el texto por el que se puede encontrar un movimiento. */
function haystackOf(db: Database, tx: Transaction): string {
  const name = <T extends { id: string; name: string }>(list: T[], id?: string) => list.find((x) => x.id === id)?.name ?? '';
  return fold(
    [
      tx.note,
      tx.merchant,
      name(db.categories, tx.categoryId),
      name(db.accounts, tx.accountId),
      name(db.accounts, tx.toAccountId),
      name(db.cards, tx.cardId),
      name(db.envelopes, tx.envelopeId),
      name(db.debts, tx.debtId),
      formatLong(tx.date), // "martes 6 de octubre": permite buscar por día de la semana
    ]
      .filter(Boolean)
      .join(' '),
  );
}

/** Movimientos que coinciden con la búsqueda, del más reciente al más antiguo. Vacío si no se escribió nada. */
export function searchTransactions(db: Database, query: string): Transaction[] {
  const words = fold(query).split(/\s+/).filter(Boolean).slice(0, 8);
  if (words.length === 0) return [];
  const matchers = words.map(matcherFor);
  return db.transactions
    .filter((tx) => {
      const haystack = haystackOf(db, tx);
      return matchers.every((match) => match(tx, haystack));
    })
    .sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}

/** Para pruebas y ayudas: la fecha que representa una palabra con día, mes y año. */
export function dateFromWord(word: string): ISODate | null {
  const d = parseDateWord(word);
  return d && d.year !== undefined && d.day !== undefined && d.month !== undefined ? iso(d.year, d.month, d.day) : null;
}

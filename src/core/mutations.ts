import { normalizeMerchant, type TxDraft } from './txDraft';
import { DEFAULT_ACCENT, defaultSettings, emptyDatabase } from './defaults';
import { normalizeHomeSections, normalizeTabs } from './layout';
import { isValidISO } from './dates';
import type { CollectionKey, CreditCard, Database, Envelope, ExtraIncome, FixedExpense, ID, InstallmentPlan, ISODate, PlannedExpense, Transaction } from './types';

/**
 * Cambios sobre la base de datos como funciones puras: reciben una base y
 * devuelven otra nueva. Aquí viven las reglas de integridad (qué pasa con los
 * movimientos cuando se borra una tarjeta, una cuenta, etc.).
 */

export function upsert<K extends CollectionKey>(db: Database, key: K, item: Database[K][number]): Database {
  const list = db[key] as { id: ID }[];
  const exists = list.some((x) => x.id === item.id);
  const next = exists ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];
  return { ...db, [key]: next };
}

/** Cuántos movimientos se borrarían junto con ese elemento. */
export function linkedTransactions(db: Database, key: CollectionKey, id: ID): number {
  return db.transactions.filter((tx) => txDependsOn(tx, key, id)).length;
}

function txDependsOn(tx: Transaction, key: CollectionKey, id: ID): boolean {
  switch (key) {
    case 'accounts':
      return tx.accountId === id || tx.toAccountId === id;
    case 'cards':
      return tx.cardId === id;
    case 'envelopes':
      return tx.envelopeId === id && (tx.type === 'aporte' || tx.type === 'retiro');
    case 'debts':
      return tx.debtId === id;
    default:
      return false;
  }
}

export function removeEntity(db: Database, key: CollectionKey, id: ID): Database {
  if (key === 'debtGroups') {
    const fallback = db.debtGroups.find((g) => g.id !== id);
    if (!fallback && db.debts.some((d) => d.groupId === id)) return db; // no se deja deudas sin grupo
    return {
      ...db,
      debtGroups: db.debtGroups.filter((g) => g.id !== id),
      debts: db.debts.map((d) => (d.groupId === id && fallback ? { ...d, groupId: fallback.id } : d)),
    };
  }

  const next: Database = { ...db, [key]: (db[key] as { id: ID }[]).filter((x) => x.id !== id) };
  next.transactions = db.transactions
    .filter((tx) => !txDependsOn(tx, key, id))
    .map((tx) => {
      if (key === 'categories' && tx.categoryId === id) return { ...tx, categoryId: undefined };
      if (key === 'envelopes' && tx.envelopeId === id) return { ...tx, envelopeId: undefined };
      if (key === 'fixedExpenses' && tx.fixedId === id) return { ...tx, fixedId: undefined };
      if (key === 'extraIncomes' && tx.extraId === id) return { ...tx, extraId: undefined, extraPeriod: undefined };
      if (key === 'plannedExpenses' && tx.plannedId === id) return { ...tx, plannedId: undefined, plannedPeriod: undefined };
      return tx;
    });

  if (key === 'accounts' || key === 'cards' || key === 'categories') {
    next.fixedExpenses = next.fixedExpenses.map((f) => ({
      ...f,
      accountId: key === 'accounts' && f.accountId === id ? undefined : f.accountId,
      cardId: key === 'cards' && f.cardId === id ? undefined : f.cardId,
      categoryId: key === 'categories' && f.categoryId === id ? undefined : f.categoryId,
    }));
    next.plannedExpenses = next.plannedExpenses.map((p) => ({
      ...p,
      accountId: key === 'accounts' && p.accountId === id ? undefined : p.accountId,
      cardId: key === 'cards' && p.cardId === id ? undefined : p.cardId,
      categoryId: key === 'categories' && p.categoryId === id ? undefined : p.categoryId,
    }));
  }
  // Una cuota activa y su gasto fijo van juntos: al borrar uno, el otro deja de cobrarse.
  if (key === 'installments') {
    const plan = db.installments.find((p) => p.id === id);
    if (plan?.fixedId) {
      next.fixedExpenses = next.fixedExpenses.filter((f) => f.id !== plan.fixedId);
      next.transactions = next.transactions.map((tx) => (tx.fixedId === plan.fixedId ? { ...tx, fixedId: undefined } : tx));
    }
  }
  if (key === 'fixedExpenses') {
    next.installments = db.installments.map((p) => (p.fixedId === id ? { ...p, status: 'idea' as const, fixedId: undefined } : p));
  }
  if (key === 'accounts') {
    next.extraIncomes = db.extraIncomes.map((x) => (x.accountId === id ? { ...x, accountId: undefined } : x));
  }
  if (key === 'accounts' && db.settings.payAccountId === id) {
    next.settings = { ...db.settings, payAccountId: next.accounts[0]?.id };
  }
  if (key === 'categories') {
    const rules = Object.fromEntries(Object.entries(db.settings.merchantRules).filter(([, c]) => c !== id));
    next.settings = { ...db.settings, merchantRules: rules };
  }
  return next;
}

export function addTransaction(db: Database, draft: TxDraft, id: ID, now: number): Database {
  return { ...db, transactions: [...db.transactions, { ...draft, id, createdAt: now }] };
}

export function updateTransaction(db: Database, id: ID, patch: Partial<Transaction>): Database {
  const before = db.transactions.find((tx) => tx.id === id);
  if (!before) return db;
  const after = { ...before, ...patch, id };
  let settings = db.settings;
  // Aprende: si el usuario corrige la categoría de un comercio, se recuerda para la próxima vez.
  if (after.merchant && after.categoryId && after.categoryId !== before.categoryId) {
    settings = {
      ...settings,
      merchantRules: { ...settings.merchantRules, [normalizeMerchant(after.merchant)]: after.categoryId },
    };
  }
  return { ...db, settings, transactions: db.transactions.map((tx) => (tx.id === id ? after : tx)) };
}

export const removeTransaction = (db: Database, id: ID): Database => ({
  ...db,
  transactions: db.transactions.filter((tx) => tx.id !== id),
});

const validPlan = (plan: unknown): boolean => {
  if (plan === undefined) return true;
  if (!plan || typeof plan !== 'object') return false;
  const p = plan as Partial<NonNullable<Envelope['plan']>>;
  return (
    typeof p.startDate === 'string' && isValidISO(p.startDate) &&
    typeof p.targetDate === 'string' && isValidISO(p.targetDate) &&
    Number.isFinite(p.amount) && (p.amount ?? 0) > 0 && Number.isFinite(p.baseBalance) &&
    (p.since === undefined || Number.isFinite(p.since)) &&
    !!p.step && ['dia', 'semana', 'mes'].includes(p.step.unit) && Number.isInteger(p.step.every) && p.step.every >= 1
  );
};

/**
 * Revisa un respaldo importado (o datos de una versión anterior) y lo completa
 * con valores por defecto. Devuelve null si no es un respaldo de la app.
 */
export function sanitizeDatabase(value: unknown, today: ISODate, now: number): Database | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Record<keyof Database, unknown>>;
  if (!Array.isArray(raw.transactions) || !Array.isArray(raw.accounts)) return null;

  const base = emptyDatabase(today, now);
  const list = <T>(v: unknown, fallback: T[]): T[] =>
    Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object' && typeof (x as { id?: unknown }).id === 'string') as T[]) : fallback;

  const settings = { ...defaultSettings(today), ...(typeof raw.settings === 'object' && raw.settings ? raw.settings : {}) };
  if (!Array.isArray(settings.payDays)) settings.payDays = base.settings.payDays;
  if (!Array.isArray(settings.skippedPaydays)) settings.skippedPaydays = [];
  if (!settings.merchantRules || typeof settings.merchantRules !== 'object') settings.merchantRules = {};
  if (!isValidISO(settings.startedOn)) settings.startedOn = today;
  if (!Number.isFinite(settings.usdRate) || settings.usdRate <= 0) settings.usdRate = base.settings.usdRate;
  settings.lockEnabled = settings.lockEnabled === true;
  settings.dailyReminder = settings.dailyReminder === true;
  settings.shieldScreen = settings.shieldScreen !== false;
  // La captura automática de mensajes se quitó: se borran sus restos de datos antiguos.
  delete (settings as Record<string, unknown>).captureKey;
  delete (settings as Record<string, unknown>).captureEnabled;
  if (!['sistema', 'claro', 'oscuro'].includes(settings.theme)) settings.theme = 'sistema';
  if (typeof settings.accent !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(settings.accent)) settings.accent = DEFAULT_ACCENT;
  settings.tabs = normalizeTabs(settings.tabs);
  settings.homeSections = normalizeHomeSections(settings.homeSections);
  if (!Number.isFinite(settings.monthEndGoal) || settings.monthEndGoal < 0) settings.monthEndGoal = 0;
  settings.widgetEnabled = settings.widgetEnabled === true;
  const debtPlan = settings.debtPlan;
  if (!debtPlan || !Number.isFinite(debtPlan.monthly) || !['bola_de_nieve', 'avalancha'].includes(debtPlan.strategy)) settings.debtPlan = undefined;
  const weekly = settings.payWeekly;
  if (!weekly || typeof weekly.anchor !== 'string' || !isValidISO(weekly.anchor) || !Number.isInteger(weekly.every) || weekly.every < 1) settings.payWeekly = undefined;
  if (!Number.isFinite(settings.incomeEstimate) || (settings.incomeEstimate ?? 0) < 0) settings.incomeEstimate = undefined;
  if (typeof settings.payAskAfter !== 'string' || !isValidISO(settings.payAskAfter)) settings.payAskAfter = undefined;
  if (typeof settings.pendingFirstPay !== 'string' || !isValidISO(settings.pendingFirstPay)) settings.pendingFirstPay = undefined;

  const transactions = list<Transaction>(raw.transactions, []).filter(
    (tx) => Number.isFinite(tx.amount) && tx.amount >= 0 && typeof tx.date === 'string' && isValidISO(tx.date),
  );

  return {
    accounts: list(raw.accounts, []),
    // De las tarjetas no se guarda ningún número: se descarta si viniera en datos antiguos.
    cards: list<CreditCard & { last4?: string }>(raw.cards, []).map(({ last4: _dropped, ...card }) => card),
    categories: list(raw.categories, base.categories),
    envelopes: list<Envelope>(raw.envelopes, base.envelopes).map((e) => (validPlan(e.plan) ? e : { ...e, plan: undefined })),
    debtGroups: list(raw.debtGroups, base.debtGroups),
    debts: list(raw.debts, []),
    // Semanal o cada dos semanas necesita una fecha de referencia válida; si no, se trata como mensual.
    fixedExpenses: list<FixedExpense>(raw.fixedExpenses, []).map((f) =>
      (f.every === 'semana' || f.every === 'dos_semanas') && typeof f.anchor === 'string' && isValidISO(f.anchor)
        ? f
        : { ...f, every: undefined, anchor: undefined },
    ),
    extraIncomes: list<ExtraIncome>(raw.extraIncomes, []).filter(
      (x) => Number.isFinite(x.amount) && x.amount > 0 && typeof x.date === 'string' && isValidISO(x.date) && ['unica', 'mensual', 'anual'].includes(x.frequency),
    ),
    plannedExpenses: list<PlannedExpense>(raw.plannedExpenses, []).filter(
      (p) => Number.isFinite(p.amount) && p.amount > 0 && typeof p.date === 'string' && isValidISO(p.date) && ['unica', 'anual'].includes(p.frequency),
    ),
    installments: list<InstallmentPlan>(raw.installments, []).filter(
      (p) => Number.isFinite(p.cashPrice) && Number.isFinite(p.monthly) && Number.isInteger(p.months) && p.months > 0 && (p.paidBefore === undefined || Number.isFinite(p.paidBefore)),
    ),
    transactions,
    settings,
  };
}

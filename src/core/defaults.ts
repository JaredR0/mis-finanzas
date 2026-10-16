import { newId } from './id';
import { DEFAULT_HOME_SECTIONS, DEFAULT_TABS } from './layout';
import { QUINCENAL } from './payCycle';
import type { Category, Database, DebtGroup, Envelope, ISODate, Settings } from './types';

/** Datos iniciales. El usuario puede cambiar o borrar todo desde la app. */

export const DEFAULT_ACCENT = '#4F46E5';

export const PALETTE = [
  '#22C55E', '#0EA5E9', '#6366F1', '#A855F7', '#EC4899',
  '#F43F5E', '#F97316', '#EAB308', '#14B8A6', '#64748B',
];

type CategorySeed = Pick<Category, 'key' | 'name' | 'kind' | 'icon' | 'color'>;

const CATEGORY_SEEDS: CategorySeed[] = [
  { key: 'comida', name: 'Comida', kind: 'corriente', icon: 'restaurant', color: '#F97316' },
  { key: 'super', name: 'Supermercado', kind: 'corriente', icon: 'cart', color: '#22C55E' },
  { key: 'transporte', name: 'Transporte', kind: 'corriente', icon: 'car', color: '#0EA5E9' },
  { key: 'salud', name: 'Salud', kind: 'corriente', icon: 'medkit', color: '#F43F5E' },
  { key: 'diversion', name: 'Diversión', kind: 'corriente', icon: 'game-controller', color: '#A855F7' },
  { key: 'ropa', name: 'Ropa', kind: 'corriente', icon: 'shirt', color: '#EC4899' },
  { key: 'educacion', name: 'Educación', kind: 'corriente', icon: 'school', color: '#6366F1' },
  { key: 'otros', name: 'Otros', kind: 'corriente', icon: 'pricetag', color: '#64748B' },
  { key: 'vivienda', name: 'Vivienda', kind: 'fijo', icon: 'home', color: '#14B8A6' },
  { key: 'servicios', name: 'Servicios', kind: 'fijo', icon: 'flash', color: '#EAB308' },
  { key: 'telefono', name: 'Teléfono e internet', kind: 'fijo', icon: 'wifi', color: '#0EA5E9' },
  { key: 'suscripciones', name: 'Suscripciones', kind: 'fijo', icon: 'repeat', color: '#A855F7' },
  { key: 'salario', name: 'Salario', kind: 'ingreso', icon: 'cash', color: '#22C55E' },
  { key: 'otros_ingresos', name: 'Otros ingresos', kind: 'ingreso', icon: 'add-circle', color: '#14B8A6' },
];

export const defaultCategories = (): Category[] =>
  CATEGORY_SEEDS.map((seed) => ({ ...seed, id: newId(), monthlyBudget: 0 }));

export const defaultEnvelopes = (now: number): Envelope[] => [
  { id: newId(), name: 'Ahorro', kind: 'ahorro', icon: 'wallet', color: '#22C55E', target: 0, createdAt: now },
  { id: newId(), name: 'Doctores', kind: 'guardadito', icon: 'medkit', color: '#F43F5E', target: 0, createdAt: now + 1 },
  { id: newId(), name: 'Emergencias', kind: 'guardadito', icon: 'shield-checkmark', color: '#0EA5E9', target: 0, createdAt: now + 2 },
];

export const defaultDebtGroups = (): DebtGroup[] => [
  { id: newId(), name: 'Crédito', icon: 'business' },
  { id: newId(), name: 'Personas', icon: 'people' },
];

export const defaultSettings = (today: ISODate): Settings => ({
  currency: 'Q',
  payDays: QUINCENAL,
  payAmount: 0,
  skippedPaydays: [],
  usdRate: 7.75,
  onboarded: false,
  startedOn: today,
  remindersOn: false,
  merchantRules: {},
  lockEnabled: false,
  shieldScreen: true,
  theme: 'sistema',
  accent: DEFAULT_ACCENT,
  tabs: [...DEFAULT_TABS],
  homeSections: [...DEFAULT_HOME_SECTIONS],
  monthEndGoal: 0,
  widgetEnabled: false,
});

export const emptyDatabase = (today: ISODate, now: number): Database => ({
  accounts: [],
  cards: [],
  categories: defaultCategories(),
  envelopes: defaultEnvelopes(now),
  debtGroups: defaultDebtGroups(),
  debts: [],
  fixedExpenses: [],
  installments: [],
  extraIncomes: [],
  plannedExpenses: [],
  transactions: [],
  settings: defaultSettings(today),
});

/** Iconos que se pueden elegir para categorías y apartados (nombres de Ionicons). */
export const ICON_CHOICES = [
  'wallet', 'cash', 'card', 'cart', 'restaurant', 'cafe', 'car', 'bus', 'airplane', 'home',
  'flash', 'water', 'wifi', 'phone-portrait', 'medkit', 'fitness', 'paw', 'school', 'book', 'briefcase',
  'game-controller', 'film', 'musical-notes', 'shirt', 'gift', 'heart', 'people', 'business',
  'shield-checkmark', 'construct', 'repeat', 'pricetag', 'star', 'umbrella', 'bicycle', 'laptop',
] as const;

/**
 * Qué se puede acomodar a gusto del usuario: las pestañas de la barra inferior
 * y las secciones de la pantalla de Inicio. Para agregar una opción nueva,
 * se añade aquí y la pantalla de Apariencia la ofrece sola.
 */

export interface TabOption {
  /** Nombre de la ruta dentro de `app/(tabs)/`. */
  key: string;
  label: string;
  /** Iconos (sin seleccionar, seleccionada). */
  icons: [string, string];
  /** Siempre presente: Inicio, y Más (por donde se llega a los ajustes). */
  required?: boolean;
}

export const TAB_OPTIONS: TabOption[] = [
  { key: 'index', label: 'Inicio', icons: ['home-outline', 'home'], required: true },
  { key: 'gastos', label: 'Gastos', icons: ['stats-chart-outline', 'stats-chart'] },
  { key: 'tarjetas', label: 'Tarjetas', icons: ['card-outline', 'card'] },
  { key: 'apartados', label: 'Apartados', icons: ['wallet-outline', 'wallet'] },
  { key: 'deudas', label: 'Deudas', icons: ['trending-down-outline', 'trending-down'] },
  { key: 'fijos', label: 'Fijos', icons: ['repeat-outline', 'repeat'] },
  { key: 'reportes', label: 'Reportes', icons: ['bar-chart-outline', 'bar-chart'] },
  { key: 'compromisos', label: 'Compromisos', icons: ['layers-outline', 'layers'] },
  { key: 'calendario', label: 'Calendario', icons: ['calendar-outline', 'calendar'] },
  { key: 'plan', label: 'Plan', icons: ['trending-up-outline', 'trending-up'] },
  { key: 'cuotas', label: 'Cuotas', icons: ['calculator-outline', 'calculator'] },
  { key: 'mas', label: 'Más', icons: ['grid-outline', 'grid'], required: true },
];

/** Máximo de pestañas en la barra (además del botón +). */
export const MAX_TABS = 5;
export const DEFAULT_TABS = ['index', 'gastos', 'tarjetas', 'apartados', 'mas'];

export interface HomeSectionOption {
  key: string;
  label: string;
  description: string;
}

export const HOME_SECTIONS: HomeSectionOption[] = [
  { key: 'meta', label: 'Meta de fin de mes', description: 'Cuánto puedes gastar todavía' },
  { key: 'calculo', label: 'Cómo se calcula', description: 'El desglose de lo libre para gastar' },
  { key: 'proximos', label: 'Próximos pagos', description: 'Tarjetas, gastos fijos, planeados y deudas por vencer' },
  { key: 'tarjetas', label: 'Mis tarjetas', description: 'Cuánto debes en cada tarjeta' },
  { key: 'apartados', label: 'Mis apartados', description: 'Ahorro y guardaditos' },
  { key: 'movimientos', label: 'Últimos movimientos', description: 'Los 5 más recientes' },
];

export const DEFAULT_HOME_SECTIONS = ['meta', 'calculo', 'proximos', 'movimientos'];

const unique = (values: unknown, valid: string[]): string[] => {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const value of values) {
    if (typeof value === 'string' && valid.includes(value) && !out.includes(value)) out.push(value);
  }
  return out;
};

/** Deja una lista de pestañas válida: sin repetidas, con las obligatorias y sin pasarse del máximo. */
export function normalizeTabs(tabs: unknown): string[] {
  const valid = TAB_OPTIONS.map((t) => t.key);
  const required = TAB_OPTIONS.filter((t) => t.required).map((t) => t.key);
  let list = unique(tabs, valid);
  if (list.length === 0) return [...DEFAULT_TABS];
  // Primero se recortan las opcionales, para que siempre quepan las obligatorias.
  const optionalRoom = MAX_TABS - required.length;
  let optionalSeen = 0;
  list = list.filter((key) => required.includes(key) || ++optionalSeen <= optionalRoom);
  if (!list.includes('index')) list.unshift('index');
  if (!list.includes('mas')) list.push('mas');
  return list;
}

export function normalizeHomeSections(sections: unknown): string[] {
  if (!Array.isArray(sections)) return [...DEFAULT_HOME_SECTIONS];
  return unique(sections, HOME_SECTIONS.map((s) => s.key));
}

/** Mueve un elemento una posición hacia arriba (-1) o hacia abajo (+1). */
export function move<T>(list: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Activa o desactiva una pestaña respetando las obligatorias y el máximo. Devuelve null si no se puede. */
export function toggleTab(tabs: string[], key: string): string[] | null {
  const option = TAB_OPTIONS.find((t) => t.key === key);
  if (!option || option.required) return null;
  if (tabs.includes(key)) return tabs.filter((t) => t !== key);
  if (tabs.length >= MAX_TABS) return null;
  // Las nuevas entran justo antes de "Más", que por costumbre va al final.
  const at = tabs.indexOf('mas');
  const next = [...tabs];
  next.splice(at >= 0 && at === tabs.length - 1 ? at : tabs.length, 0, key);
  return next;
}

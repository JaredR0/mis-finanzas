/**
 * Modelo de datos de la app.
 *
 * Reglas:
 *  - Todo monto es un entero en CENTAVOS (nunca decimales) para evitar errores de redondeo.
 *  - Toda fecha de calendario es un texto 'AAAA-MM-DD' en hora local (ISODate).
 *  - Los saldos NO se guardan: siempre se calculan a partir de los movimientos.
 */

export type ID = string;
export type ISODate = string;
export type Cents = number;

export interface Account {
  id: ID;
  name: string;
  kind: 'banco' | 'efectivo';
  /** Saldo que tenía la cuenta al empezar a usar la app. */
  initialBalance: Cents;
  color: string;
  createdAt: number;
}

export interface CreditCard {
  id: ID;
  name: string;
  bank: string;
  /** Día del mes en que corta (1–31; se ajusta a meses cortos). */
  cutoffDay: number;
  /** Día del mes límite de pago (1–31). */
  paymentDay: number;
  /** Límite de crédito; 0 = sin definir. */
  limit: Cents;
  /** Saldo del último estado de cuenta que aún estaba sin pagar al registrar la tarjeta. */
  openingStatement: Cents;
  /** Consumos hechos después del último corte al registrar la tarjeta. */
  openingCycle: Cents;
  /** Fecha en que se registró la tarjeta (ubica `openingCycle` en su ciclo). */
  openedOn: ISODate;
  color: string;
  createdAt: number;
}

export type CategoryKind = 'fijo' | 'corriente' | 'ingreso';

export interface Category {
  id: ID;
  /** Clave estable de las categorías predeterminadas (para sugerencias automáticas). */
  key?: string;
  name: string;
  kind: CategoryKind;
  icon: string;
  color: string;
  /** Presupuesto mensual; 0 = sin presupuesto. */
  monthlyBudget: Cents;
}

/** Apartado de dinero: ahorro o "guardadito" (doctores, emergencias, etc.). */
export interface Envelope {
  id: ID;
  name: string;
  kind: 'ahorro' | 'guardadito';
  icon: string;
  color: string;
  /** Meta; 0 = sin meta. */
  target: Cents;
  createdAt: number;
  /** Plan para llegar a la meta en una fecha, con aportes periódicos. */
  plan?: SavingsPlan;
}

/** Cada cuánto se aporta a una meta de ahorro. */
export interface SavingsStep {
  unit: 'dia' | 'semana' | 'mes';
  /** Cada cuántos días, semanas o meses (1 = cada uno). */
  every: number;
}

export interface SavingsPlan {
  /** Fecha del primer aporte de este tramo del plan. */
  startDate: ISODate;
  /** Fecha en que se quiere tener la meta completa. */
  targetDate: ISODate;
  step: SavingsStep;
  /** Cuánto se aporta cada vez. */
  amount: Cents;
  /** Saldo que ya tenía el apartado al empezar (o al reajustar) el plan. */
  baseBalance: Cents;
  /** Momento en que se creó o reajustó el plan: lo que se saque después cuenta como "fuera del plan". */
  since?: number;
}

/** Ingreso fuera del sueldo base: bono, aguinaldo, trabajos aparte, etc. */
export interface ExtraIncome {
  id: ID;
  name: string;
  amount: Cents;
  /** 'unica' = una sola vez; 'mensual' = cada mes; 'anual' = cada año en el mismo mes. */
  frequency: 'unica' | 'mensual' | 'anual';
  /** Fecha en que se espera (la primera, si se repite). */
  date: ISODate;
  accountId?: ID;
  active: boolean;
  createdAt: number;
}

/** Gasto que ya se sabe que viene en una fecha: matrícula, seguro, un viaje, un regalo. */
export interface PlannedExpense {
  id: ID;
  name: string;
  amount: Cents;
  /** 'unica' = una sola vez; 'anual' = cada año en el mismo mes. (Lo de cada mes es un gasto fijo.) */
  frequency: 'unica' | 'anual';
  /** Fecha en que se espera (la primera, si se repite). */
  date: ISODate;
  categoryId?: ID;
  /** Se pagará con una cuenta o con una tarjeta (una de las dos). */
  accountId?: ID;
  cardId?: ID;
  active: boolean;
  createdAt: number;
}

/** Grupo de deudas creado por el usuario (Crédito, Personas, ...). */
export interface DebtGroup {
  id: ID;
  name: string;
  icon: string;
}

export interface Debt {
  id: ID;
  name: string;
  groupId: ID;
  /** 'debo' = yo debo; 'me_deben' = me deben a mí. */
  direction: 'debo' | 'me_deben';
  /** Monto original de la deuda. */
  amount: Cents;
  date: ISODate;
  dueDate?: ISODate;
  /** Interés anual en porcentaje (24 = 24 % al año). Lo usa el plan para salir de deudas. */
  rate?: number;
  /** Pago mínimo mensual que exige la deuda. */
  minPayment?: Cents;
  note: string;
  createdAt: number;
}

export interface FixedExpense {
  id: ID;
  name: string;
  amount: Cents;
  /** Día del mes en que se paga. */
  day: number;
  categoryId?: ID;
  /** Se paga con una cuenta o con una tarjeta (una de las dos). */
  accountId?: ID;
  cardId?: ID;
  active: boolean;
  /** true = se cobra solo (débito automático): la app registra el pago el día que toca. */
  auto?: boolean;
  /** Primer y último mes ('AAAA-MM') en que se cobra. Sin valor = sin límite. Lo usan las cuotas. */
  startMonth?: string;
  endMonth?: string;
}

/** Compra a cuotas: una idea que se está evaluando o un plan que ya se tomó. */
export interface InstallmentPlan {
  id: ID;
  name: string;
  /** Precio si se pagara de contado. */
  cashPrice: Cents;
  /** Número de cuotas (meses). */
  months: number;
  /** Monto de cada cuota. */
  monthly: Cents;
  /** 'idea' = evaluándola; 'activa' = ya se tomó y cuenta como compromiso mensual. */
  status: 'idea' | 'activa';
  /** Gasto fijo que cobra la cuota cada mes (solo si está activa). */
  fixedId?: ID;
  /** Cuotas que ya se habían pagado antes de anotarla en la app (compras que ya venían en curso). */
  paidBefore?: number;
  createdAt: number;
}

export type TxType =
  | 'gasto' // compra o pago; con cuenta o con tarjeta
  | 'ingreso' // dinero que entra a una cuenta
  | 'pago_tarjeta' // pago de la tarjeta desde una cuenta
  | 'transferencia' // entre cuentas propias
  | 'aporte' // reservar dinero en un apartado
  | 'retiro' // liberar dinero de un apartado
  | 'abono_deuda' // abono a una deuda (o cobro, si me deben)
  | 'prestamo'; // dinero que entró/salió de la cuenta al crearse una deuda

export type TxSource = 'manual' | 'sms' | 'atajo' | 'fijo';

export interface Transaction {
  id: ID;
  type: TxType;
  /** Siempre positivo; el tipo define si suma o resta. */
  amount: Cents;
  date: ISODate;
  createdAt: number;
  note: string;
  accountId?: ID;
  toAccountId?: ID;
  cardId?: ID;
  categoryId?: ID;
  envelopeId?: ID;
  debtId?: ID;
  /** Gasto fijo que originó este movimiento. */
  fixedId?: ID;
  /** Día de pago al que corresponde este ingreso (evita registrar dos veces la quincena). */
  payDate?: ISODate;
  /** Ingreso extra que originó este movimiento y el mes ('AAAA-MM') al que corresponde. */
  extraId?: ID;
  extraPeriod?: string;
  /** Gasto planeado que originó este movimiento y el mes ('AAAA-MM') al que corresponde. */
  plannedId?: ID;
  plannedPeriod?: string;
  source: TxSource;
  /** Capturado automáticamente y pendiente de que el usuario lo confirme. */
  needsReview?: boolean;
  merchant?: string;
  /** Texto original del SMS (recortado). Solo se conserva mientras el movimiento está por revisar. */
  raw?: string;
}

export interface Settings {
  currency: string;
  /** Días del mes en que se cobra. 31 significa "último día del mes". */
  payDays: number[];
  /** Pago semanal o cada dos semanas (si existe, manda sobre `payDays`). */
  payWeekly?: { anchor: ISODate; every: number };
  /** Ingreso variable: cuánto se calcula ganar al mes mientras no haya historial. */
  incomeEstimate?: Cents;
  /** Preferencias del plan para salir de deudas. */
  debtPlan?: { monthly: Cents; strategy: 'bola_de_nieve' | 'avalancha'; useExtras: boolean };
  /** No volver a preguntar por el pago pendiente antes de esta fecha ("todavía no"). */
  payAskAfter?: ISODate;
  /** Monto de cada pago. */
  payAmount: Cents;
  payAccountId?: ID;
  /** Días de pago que el usuario descartó ("no me pagaron" / "ya lo registré"). */
  skippedPaydays: ISODate[];
  /** Pago que aún no había llegado al configurar la app: Inicio lo pregunta hasta que se registre o se descarte. */
  pendingFirstPay?: ISODate;
  /** Tipo de cambio para compras en dólares. */
  usdRate: number;
  onboarded: boolean;
  startedOn: ISODate;
  remindersOn: boolean;
  /** Comercio (normalizado) → categoría, aprendido de las correcciones del usuario. */
  merchantRules: Record<string, ID>;
  /** Pedir Face ID / huella / código al abrir la app. */
  lockEnabled: boolean;
  /** Ocultar el contenido en el selector de apps (y bloquear capturas de pantalla en Android). */
  shieldScreen: boolean;
  /** Tema: seguir al teléfono, siempre claro o siempre oscuro. */
  theme: 'sistema' | 'claro' | 'oscuro';
  /** Color principal de la app (hexadecimal). */
  accent: string;
  /** Pestañas de la barra inferior, en orden. */
  tabs: string[];
  /** Secciones visibles en Inicio, en orden. */
  homeSections: string[];
  /** Con cuánto dinero se quiere llegar a fin de mes. 0 = sin meta. */
  monthEndGoal: Cents;
  /** Mostrar "puedes gastar hoy" en el widget de la pantalla de inicio del teléfono. */
  widgetEnabled: boolean;
}

export interface Database {
  accounts: Account[];
  cards: CreditCard[];
  categories: Category[];
  envelopes: Envelope[];
  debtGroups: DebtGroup[];
  debts: Debt[];
  fixedExpenses: FixedExpense[];
  installments: InstallmentPlan[];
  extraIncomes: ExtraIncome[];
  plannedExpenses: PlannedExpense[];
  transactions: Transaction[];
  settings: Settings;
}

export type CollectionKey =
  | 'accounts'
  | 'cards'
  | 'categories'
  | 'envelopes'
  | 'debtGroups'
  | 'debts'
  | 'fixedExpenses'
  | 'installments'
  | 'extraIncomes'
  | 'plannedExpenses';

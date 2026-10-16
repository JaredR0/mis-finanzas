import { accountBalances, debtRemaining, envelopeBalances, fixedActiveIn, fixedPayment, pendingPayday } from './balances';
import { cardStatus } from './creditCard';
import { daysInMonth, diffDays, monthEnd, monthKey, monthShort, parts, shiftMonthKey } from './dates';
import { extraIncomeIn, extraPendingIn } from './extraIncome';
import { monthlyPayCount, payFrequency, paydaysIn } from './payCycle';
import { plannedIn, plannedPendingIn } from './planned';
import type { Cents, Database, ID, ISODate } from './types';

/**
 * Proyección: cuánto dinero habrá a fin de mes y en los meses siguientes.
 *
 * Se apoya en lo que el usuario ya registró, dando más peso a lo reciente:
 * si este mes gasta menos, la proyección mejora sola.
 *
 * "Dinero neto" = lo que hay en cuentas − lo que se debe en tarjetas.
 * Es el dinero que de verdad es tuyo hoy (lo apartado sigue siendo tuyo).
 */

/** Pesos de los últimos meses completos (el más reciente primero) y del mes en curso. */
const WEIGHTS = [3, 2, 1];
const CURRENT_MONTH_WEIGHT = 2;
/** Días de datos que hacen falta para confiar en el ritmo del mes en curso. */
const MIN_DAYS_FOR_PACE = 7;
const MIN_DAYS_TO_BLEND = 10;

export const netNow = (db: Database, today: ISODate): Cents => {
  const inAccounts = Object.values(accountBalances(db)).reduce((a, b) => a + b, 0);
  const cardDebt = db.cards.reduce((total, card) => total + cardStatus(card, db.transactions, today).debt, 0);
  return inAccounts - cardDebt;
};

/** Gasto del día a día de un mes: todo gasto que no viene de un gasto fijo, una cuota o un gasto planeado. */
function variableSpend(db: Database, key: string): Cents {
  let total = 0;
  for (const tx of db.transactions) {
    if (tx.type === 'gasto' && !tx.fixedId && !tx.plannedId && monthKey(tx.date) === key) total += tx.amount;
  }
  return total;
}

function incomeOf(db: Database, key: string): Cents {
  let total = 0;
  for (const tx of db.transactions) if (tx.type === 'ingreso' && monthKey(tx.date) === key) total += tx.amount;
  return total;
}

/** Suma de gastos fijos y cuotas que se cobran en un mes. `exclude` deja fuera uno (para evaluar una cuota). */
export function fixedIn(db: Database, key: string, exclude?: ID): Cents {
  return db.fixedExpenses.reduce((total, f) => total + (f.id !== exclude && fixedActiveIn(f, key) ? f.amount : 0), 0);
}

export interface Baseline {
  /** Ingreso mensual esperado. */
  income: Cents;
  /** Gasto mensual esperado del día a día (sin fijos ni cuotas). */
  variable: Cents;
  /** Promedio de los meses anteriores, sin contar el actual; null si no hay meses completos. */
  previousAverage: Cents | null;
  /** A cuánto apunta el gasto del día a día de este mes si sigue al mismo ritmo; null si hay pocos días. */
  currentPace: Cents | null;
  /** Meses completos usados. */
  monthsUsed: number;
  /** true si aún no hay datos suficientes para estimar el gasto. */
  noData: boolean;
}

/** Meses anteriores que se pueden usar completos (del más reciente al más antiguo). */
function completeMonths(db: Database, today: ISODate): string[] {
  const current = monthKey(today);
  const start = db.settings.startedOn;
  const startKey = monthKey(start);
  const startedEarly = parts(start).d <= 3; // empezó a inicios de mes: ese mes cuenta completo
  const out: string[] = [];
  for (let back = 1; back <= WEIGHTS.length; back++) {
    const key = shiftMonthKey(current, -back);
    if (key < startKey || (key === startKey && !startedEarly)) break;
    // Un mes sin ningún movimiento es un mes en que no se usó la app, no un mes sin gastos.
    if (db.transactions.some((tx) => monthKey(tx.date) === key)) out.push(key);
  }
  return out;
}

export function baseline(db: Database, today: ISODate): Baseline {
  const current = monthKey(today);
  const { y, m, d } = parts(today);
  const months = completeMonths(db, today);

  // Ritmo del mes en curso, contando solo los días con la app en uso.
  const firstDay = monthKey(db.settings.startedOn) === current ? parts(db.settings.startedOn).d : 1;
  const daysElapsed = Math.max(1, d - firstDay + 1);
  const spentSoFar = variableSpend(db, current);
  const currentPace = daysElapsed >= MIN_DAYS_FOR_PACE ? Math.round((spentSoFar / daysElapsed) * daysInMonth(y, m)) : null;

  let weightSum = 0;
  let weighted = 0;
  months.forEach((key, i) => {
    weighted += variableSpend(db, key) * WEIGHTS[i];
    weightSum += WEIGHTS[i];
  });
  const previousAverage = weightSum > 0 ? Math.round(weighted / weightSum) : null;

  let variable = 0;
  let noData = false;
  if (previousAverage !== null) {
    variable =
      currentPace !== null && daysElapsed >= MIN_DAYS_TO_BLEND
        ? Math.round((weighted + currentPace * CURRENT_MONTH_WEIGHT) / (weightSum + CURRENT_MONTH_WEIGHT))
        : previousAverage;
  } else if (currentPace !== null) {
    variable = currentPace;
  } else {
    noData = true;
  }

  const { payAmount, incomeEstimate } = db.settings;
  // Sueldo fijo: pago × pagos al mes. Ingreso variable: promedio de lo recibido o, sin historial, lo estimado.
  let income = payAmount > 0 ? Math.round(payAmount * Math.max(1, monthlyPayCount(db.settings))) : 0;
  if (income === 0 && months.length === 0) income = Math.max(0, incomeEstimate ?? 0);
  if (income === 0 && months.length > 0) {
    let sum = 0;
    let w = 0;
    months.forEach((key, i) => {
      sum += incomeOf(db, key) * WEIGHTS[i];
      w += WEIGHTS[i];
    });
    income = Math.round(sum / w);
  }

  return { income, variable, previousAverage, currentPace, monthsUsed: months.length, noData };
}

export type GoalStatus = 'sin_meta' | 'bien' | 'cuidado' | 'alto';

export interface MonthEnd {
  key: string;
  net: Cents;
  /** Pagos que faltan por recibir este mes (sueldo + ingresos extra esperados). */
  incomeLeft: Cents;
  /** De `incomeLeft`, cuánto son ingresos extra aún sin confirmar. */
  extraLeft: Cents;
  /** Gastos fijos y cuotas del mes sin pagar. */
  fixedLeft: Cents;
  /** Deudas que vencen este mes. */
  debtsLeft: Cents;
  /** Gastos planeados de este mes sin pagar. */
  plannedLeft: Cents;
  /** Con cuánto se llega a fin de mes si no se gasta nada más (dinero neto: incluye lo apartado). */
  ifNoMoreSpending: Cents;
  /** Dinero en apartados (ahorro y guardaditos): es tuyo, pero no es para gastar. */
  inEnvelopes: Cents;
  /** Lo que quedaría libre a fin de mes si no se gasta nada más: neto − apartados. */
  freeIfNoMoreSpending: Cents;
  /** Lo que quedaría libre a fin de mes gastando al ritmo habitual. */
  freeProjected: Cents;
  /** Con cuánto se llega si se sigue gastando al ritmo habitual. */
  projected: Cents;
  /** Gasto del día a día esperado de aquí a fin de mes. */
  expectedSpending: Cents;
  /** Días que quedan del mes, contando hoy. */
  daysLeft: number;
  goal: Cents;
  /** Lo que aún se puede gastar sin que lo libre baje de la meta (negativo = ya se pasó). */
  canSpend: Cents;
  canSpendPerDay: Cents;
  status: GoalStatus;
}

export function monthEndOutlook(db: Database, today: ISODate): MonthEnd {
  const key = monthKey(today);
  const end = monthEnd(key);
  const { y, m } = parts(today);
  const days = daysInMonth(y, m);
  const base = baseline(db, today);
  const net = netNow(db, today);

  const { payAmount } = db.settings;
  const extraLeft = extraPendingIn(db, key);
  let salaryLeft: Cents;
  if (payAmount > 0 && payFrequency(db.settings) !== 'variable') {
    // Días de pago que todavía faltan este mes, más el que esté pendiente de registrar.
    const comingPaydays = paydaysIn(db.settings, key).filter((date) => date > today).length;
    salaryLeft = payAmount * (comingPaydays + (pendingPayday(db, today) ? 1 : 0));
  } else {
    // Ingreso variable: lo que se calcula ganar al mes menos lo que ya entró (sin contar ingresos extra).
    let received = 0;
    for (const tx of db.transactions) if (tx.type === 'ingreso' && !tx.extraId && monthKey(tx.date) === key) received += tx.amount;
    salaryLeft = Math.max(0, base.income - received);
  }
  const incomeLeft = salaryLeft + extraLeft;

  let fixedLeft = 0;
  for (const fixed of db.fixedExpenses) {
    if (fixedActiveIn(fixed, key) && !fixedPayment(fixed, key, db.transactions)) fixedLeft += fixed.amount;
  }
  let debtsLeft = 0;
  for (const debt of db.debts) {
    if (debt.direction === 'debo' && debt.dueDate && debt.dueDate <= end) debtsLeft += debtRemaining(debt, db.transactions);
  }

  const plannedLeft = plannedPendingIn(db, key);

  const ifNoMoreSpending = net + incomeLeft - fixedLeft - debtsLeft - plannedLeft;
  const daysLeft = diffDays(today, end) + 1;
  const expectedSpending = Math.round((base.variable / days) * (daysLeft - 1));
  const projected = ifNoMoreSpending - expectedSpending;
  // La meta se mide sobre dinero libre: lo que está en apartados es tuyo, pero no es para
  // gastar, igual que en Inicio. (Las tarjetas ya están restadas en el dinero neto.)
  const inEnvelopes = Object.values(envelopeBalances(db)).reduce((a, b) => a + Math.max(0, b), 0);
  const freeIfNoMoreSpending = ifNoMoreSpending - inEnvelopes;
  const freeProjected = freeIfNoMoreSpending - expectedSpending;
  const goal = db.settings.monthEndGoal;
  const canSpend = freeIfNoMoreSpending - goal;
  const status: GoalStatus = goal <= 0 ? 'sin_meta' : canSpend <= 0 ? 'alto' : freeProjected < goal ? 'cuidado' : 'bien';

  return {
    key, net, incomeLeft, extraLeft, fixedLeft, debtsLeft, plannedLeft, ifNoMoreSpending, inEnvelopes, freeIfNoMoreSpending, freeProjected, projected, expectedSpending,
    daysLeft, goal, canSpend, canSpendPerDay: canSpend > 0 ? Math.floor(canSpend / daysLeft) : 0, status,
  };
}

export interface ForecastMonth {
  key: string;
  label: string;
  /** Sueldo base + ingresos extra esperados ese mes. */
  income: Cents;
  /** De `income`, cuánto son ingresos extra. */
  extra: Cents;
  fixed: Cents;
  /** Gastos planeados que caen ese mes. */
  planned: Cents;
  variable: Cents;
  /** Lo que sobraría ese mes (ingreso − fijos − planeados − gasto del día a día). */
  saving: Cents;
  /** Dinero neto acumulado al cerrar ese mes. */
  balance: Cents;
}

/** Los próximos `count` meses, partiendo del cierre proyectado del mes actual. */
export function forecast(db: Database, today: ISODate, count = 6): ForecastMonth[] {
  const base = baseline(db, today);
  let balance = monthEndOutlook(db, today).projected;
  const out: ForecastMonth[] = [];
  for (let i = 1; i <= count; i++) {
    const key = shiftMonthKey(monthKey(today), i);
    const fixed = fixedIn(db, key);
    const extra = extraIncomeIn(db, key);
    const income = base.income + extra;
    const planned = plannedIn(db, key);
    const saving = income - fixed - planned - base.variable;
    balance += saving;
    out.push({ key, label: monthShort(Number(key.slice(5))), income, extra, fixed, planned, variable: base.variable, saving, balance });
  }
  return out;
}

/** Lo que sobra en un mes típico: sirve para saber qué cuota cabe. `exclude` = gasto fijo a ignorar. */
export function monthlyMargin(db: Database, today: ISODate, exclude?: ID): Cents {
  const base = baseline(db, today);
  const next = shiftMonthKey(monthKey(today), 1);
  // Solo cuentan los ingresos extra de todos los meses: un bono de una vez no paga una cuota mensual.
  const steadyExtra = db.extraIncomes.reduce(
    (total, x) => total + (x.active && x.frequency === 'mensual' && monthKey(x.date) <= next ? x.amount : 0),
    0,
  );
  return base.income + steadyExtra - fixedIn(db, next, exclude) - base.variable;
}

import { fixedActiveIn, fixedPayment } from './balances';
import { monthKey, shiftMonthKey } from './dates';
import { baseline, monthlyMargin } from './forecast';
import type { Cents, Database, FixedExpense, InstallmentPlan, ISODate } from './types';

/**
 * Compras a cuotas: cuánto se termina pagando de verdad y si cabe en el mes.
 */

export interface PlanCost {
  /** Todo lo que se paga al final (cuota × meses). */
  total: Cents;
  /** Lo que cuesta de más frente al precio de contado. */
  extra: Cents;
  /** `extra` como fracción del precio de contado (0.25 = 25 % más). */
  extraRatio: number;
  /** Interés anual equivalente (0.42 = 42 % al año); 0 si no hay recargo. */
  annualRate: number;
}

export function planCost(plan: Pick<InstallmentPlan, 'cashPrice' | 'months' | 'monthly'>): PlanCost {
  const total = plan.monthly * plan.months;
  const extra = total - plan.cashPrice;
  const extraRatio = plan.cashPrice > 0 ? extra / plan.cashPrice : 0;
  return { total, extra, extraRatio, annualRate: annualRate(plan.cashPrice, plan.monthly, plan.months) };
}

/** Tasa anual efectiva de pagar `monthly` durante `months` por algo que vale `price` hoy. */
export function annualRate(price: Cents, monthly: Cents, months: number): number {
  if (price <= 0 || monthly <= 0 || months <= 0 || monthly * months <= price) return 0;
  // Valor hoy de todas las cuotas con una tasa mensual r; se busca la r que lo iguala al precio.
  const presentValue = (r: number) => (monthly * (1 - Math.pow(1 + r, -months))) / r;
  let low = 1e-9;
  let high = 1;
  if (presentValue(high) > price) return Math.pow(1 + high, 12) - 1; // más de 100 % mensual
  for (let i = 0; i < 80; i++) {
    const mid = (low + high) / 2;
    if (presentValue(mid) > price) low = mid;
    else high = mid;
  }
  return Math.pow(1 + (low + high) / 2, 12) - 1;
}

export type Verdict = 'si' | 'ajustado' | 'no' | 'sin_datos';

export type Reason =
  | 'no_alcanza' // la cuota es mayor que lo que sobra al mes
  | 'queda_poco' // después de la cuota queda muy poco margen
  | 'muchas_cuotas' // las cuotas juntas se llevan demasiado del ingreso
  | 'recargo_alto' // se termina pagando mucho más que de contado
  | 'plazo_largo' // compromiso de más de dos años
  | 'mejor_ahorrar' // ahorrando se junta el precio de contado en poco tiempo
  | 'sin_recargo'; // cuesta lo mismo que de contado

export interface PlanEvaluation extends PlanCost {
  verdict: Verdict;
  reasons: Reason[];
  /** Lo que sobra hoy en un mes típico, sin esta cuota. */
  marginBefore: Cents;
  /** Lo que sobraría con esta cuota. */
  marginAfter: Cents;
  /** Ingreso mensual esperado. */
  income: Cents;
  /** Suma de todas las cuotas activas más esta, por mes. */
  allInstallments: Cents;
  /** Meses que tomaría juntar el precio de contado ahorrando lo que sobra; null si no sobra nada. */
  monthsToSaveCash: number | null;
  /** Último mes en que se pagaría ('AAAA-MM'). */
  lastMonth: string;
}

/** Límites que usa el veredicto. */
export const INSTALLMENT_RULES = {
  /** Margen mínimo que debe quedar después de la cuota, como parte del ingreso. */
  minMarginShare: 0.1,
  /** Parte máxima del ingreso que deberían llevarse todas las cuotas juntas. */
  maxInstallmentShare: 0.3,
  /** Recargo sobre el precio de contado a partir del cual se advierte. */
  highExtra: 0.25,
  /** Plazo a partir del cual se advierte. */
  longMonths: 24,
};

export function evaluatePlan(db: Database, plan: InstallmentPlan, today: ISODate): PlanEvaluation {
  const cost = planCost(plan);
  const base = baseline(db, today);
  // Si la cuota ya está activa, su gasto fijo no se cuenta dos veces.
  const marginBefore = monthlyMargin(db, today, plan.status === 'activa' ? plan.fixedId : undefined);
  const marginAfter = marginBefore - plan.monthly;
  const others = db.installments
    .filter((p) => p.status === 'activa' && p.id !== plan.id)
    .reduce((sum, p) => sum + p.monthly, 0);
  const allInstallments = others + plan.monthly;
  const monthsToSaveCash = marginBefore > 0 ? Math.ceil(plan.cashPrice / marginBefore) : null;
  // Una cuota activa termina cuando termina su gasto fijo; una idea, si empezara el próximo mes.
  const activeEnd = plan.status === 'activa' ? db.fixedExpenses.find((f) => f.id === plan.fixedId)?.endMonth : undefined;
  const lastMonth = activeEnd ?? shiftMonthKey(monthKey(today), Math.max(1, plan.months - paidBefore(plan)));

  const reasons: Reason[] = [];
  let verdict: Verdict;
  if (base.income <= 0 || base.noData) {
    verdict = 'sin_datos';
  } else if (marginAfter < 0) {
    verdict = 'no';
    reasons.push('no_alcanza');
  } else {
    verdict = 'si';
    if (marginAfter < base.income * INSTALLMENT_RULES.minMarginShare) {
      verdict = 'ajustado';
      reasons.push('queda_poco');
    }
    if (allInstallments > base.income * INSTALLMENT_RULES.maxInstallmentShare) {
      verdict = 'ajustado';
      reasons.push('muchas_cuotas');
    }
  }
  if (cost.extraRatio >= INSTALLMENT_RULES.highExtra) {
    reasons.push('recargo_alto');
    if (verdict === 'si') verdict = 'ajustado';
  }
  if (plan.months > INSTALLMENT_RULES.longMonths) reasons.push('plazo_largo');
  if (cost.extra > 0 && monthsToSaveCash !== null && monthsToSaveCash <= Math.max(3, Math.ceil(plan.months / 3))) {
    reasons.push('mejor_ahorrar');
  }
  if (cost.extra <= 0) reasons.push('sin_recargo');

  return { ...cost, verdict, reasons, marginBefore, marginAfter, income: base.income, allInstallments, monthsToSaveCash, lastMonth };
}

/** Cuotas que ya venían pagadas antes de anotar la compra en la app (entre 0 y el total menos una). */
export function paidBefore(plan: Pick<InstallmentPlan, 'paidBefore' | 'months'>): number {
  const n = Math.floor(Number(plan.paidBefore) || 0);
  return Math.min(Math.max(0, plan.months - 1), Math.max(0, n));
}

/** Cuotas ya pagadas: las que venían de antes más las registradas en la app (movimientos de su gasto fijo). */
export function paidInstallments(db: Database, plan: InstallmentPlan): number {
  const before = paidBefore(plan);
  if (!plan.fixedId) return before;
  return Math.min(plan.months, before + db.transactions.filter((tx) => tx.fixedId === plan.fixedId).length);
}

export interface InstallmentProgress {
  /** Cuotas pagadas y cuotas que faltan. */
  paid: number;
  left: number;
  /** Lo ya pagado y lo que falta por pagar, en dinero. */
  paidAmount: Cents;
  remaining: Cents;
  /** Gasto fijo que cobra la cuota, si la compra está activa. */
  fixed: FixedExpense | undefined;
  /** La cuota de este mes toca y aún no se paga. */
  dueThisMonth: boolean;
  /** La cuota de este mes ya se pagó. */
  paidThisMonth: boolean;
  /** Primer mes de cobro, si todavía no empieza. */
  startsIn: string | null;
  /** Último mes de cobro. */
  endMonth: string | null;
}

/** Cómo va una compra a cuotas: cuántas lleva, cuánto falta y si toca pagar este mes. */
export function installmentProgress(db: Database, plan: InstallmentPlan, today: ISODate): InstallmentProgress {
  const paid = paidInstallments(db, plan);
  const left = Math.max(0, plan.months - paid);
  const fixed = plan.status === 'activa' ? db.fixedExpenses.find((f) => f.id === plan.fixedId) : undefined;
  const key = monthKey(today);
  const charged = !!fixed && left > 0 && fixedActiveIn(fixed, key);
  const paidThisMonth = !!fixed && !!fixedPayment(fixed, key, db.transactions);
  return {
    paid,
    left,
    paidAmount: paid * plan.monthly,
    remaining: left * plan.monthly,
    fixed,
    dueThisMonth: charged && !paidThisMonth,
    paidThisMonth,
    startsIn: fixed?.startMonth && fixed.startMonth > key ? fixed.startMonth : null,
    endMonth: fixed?.endMonth ?? null,
  };
}

/** Total que falta pagar entre todas las compras a cuotas activas. */
export function installmentsRemaining(db: Database): Cents {
  return db.installments.reduce((sum, p) => sum + (p.status === 'activa' ? Math.max(0, p.months - paidInstallments(db, p)) * p.monthly : 0), 0);
}

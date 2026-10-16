import { monthLabel } from '@/core/dates';
import type { PlanEvaluation, Reason, Verdict } from '@/core/installments';

export const VERDICT_LABEL: Record<Verdict, string> = {
  si: 'Te alcanza',
  ajustado: 'Piénsalo bien',
  no: 'Mejor no',
  sin_datos: 'Faltan datos',
};

export const VERDICT_TONE: Record<Verdict, 'positive' | 'warning' | 'negative' | 'neutral'> = {
  si: 'positive',
  ajustado: 'warning',
  no: 'negative',
  sin_datos: 'neutral',
};

export function verdictHeadline(e: PlanEvaluation, money: (cents: number) => string): string {
  switch (e.verdict) {
    case 'si':
      return `Te alcanza: después de la cuota te sobrarían ${money(e.marginAfter)} al mes.`;
    case 'ajustado':
      return e.marginAfter >= 0
        ? `Cabe, pero con cuidado: te sobrarían ${money(e.marginAfter)} al mes.`
        : 'Cabe, pero con cuidado.';
    case 'no':
      return `No te alcanza: te faltarían ${money(-e.marginAfter)} cada mes.`;
    case 'sin_datos':
      return 'Todavía no sé si te alcanza: configura tu pago en Ajustes y registra tus gastos unos días.';
  }
}

/** Explicación en palabras de cada motivo. */
export function reasonText(reason: Reason, e: PlanEvaluation, months: number, money: (cents: number) => string): string {
  const percent = (ratio: number) => `${Math.round(ratio * 100)} %`;
  switch (reason) {
    case 'no_alcanza':
      return `Hoy te sobran ${money(Math.max(0, e.marginBefore))} al mes y la cuota pide más que eso.`;
    case 'queda_poco':
      return `Te quedaría menos del 10 % de tu ingreso libre: cualquier imprevisto te descuadra.`;
    case 'muchas_cuotas':
      return `Con tus otras cuotas pagarías ${money(e.allInstallments)} al mes: ${percent(e.allInstallments / e.income)} de tu ingreso (lo sano es no pasar de 30 %).`;
    case 'recargo_alto':
      return `Terminas pagando ${money(e.extra)} de más: ${percent(e.extraRatio)} sobre el precio de contado.`;
    case 'plazo_largo':
      return `Es un compromiso de ${months} meses: terminas de pagar en ${monthLabel(e.lastMonth).toLowerCase()}.`;
    case 'mejor_ahorrar':
      return e.monthsToSaveCash === 1
        ? 'Con lo que te sobra, en un mes lo compras de contado y te ahorras el recargo.'
        : `Ahorrando lo que te sobra, en ${e.monthsToSaveCash} meses lo compras de contado y te ahorras el recargo.`;
    case 'sin_recargo':
      return 'No tiene recargo: pagas lo mismo que de contado.';
  }
}

import { requestWidgetUpdate, type WidgetTaskHandlerProps } from 'react-native-android-widget';

import { todayISO } from '@/core/dates';
import { parseWidgetSnapshot, WIDGET_NAME, type WidgetSnapshot, widgetView } from '@/core/widget';
import { sideStore } from '@/data/storage';

import { androidView } from './androidView';
import { widgetAvailable } from './available';

export { widgetAvailable };

/** Dónde quedan (cifrados) los números del widget. */
const KEY = 'mis-finanzas/widget';

export async function syncWidget(snapshot: WidgetSnapshot | null): Promise<void> {
  if (!widgetAvailable) return;
  try {
    if (snapshot) sideStore.setItem(KEY, JSON.stringify(snapshot));
    else await sideStore.removeItem(KEY);
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      renderWidget: () => androidView(widgetView(snapshot, todayISO())),
      widgetNotFound: () => {},
    });
  } catch {
    // El widget es un extra: si falla, la app sigue funcionando igual.
  }
}

/**
 * Android llama a esto, con la app cerrada, cada vez que toca repintar el
 * widget (al agregarlo, al cambiarle el tamaño y cada 30 minutos). Así el
 * monto del día cambia solo aunque no abras la app.
 */
export async function widgetTaskHandler({ widgetAction, renderWidget }: WidgetTaskHandlerProps): Promise<void> {
  if (widgetAction === 'WIDGET_DELETED') return;
  const snapshot = parseWidgetSnapshot(await sideStore.getItem(KEY));
  renderWidget(androidView(widgetView(snapshot, todayISO())));
}

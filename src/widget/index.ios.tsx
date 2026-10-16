import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundStyle, lineLimit, minimumScaleFactor, privacySensitive } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type Widget } from 'expo-widgets';

import { todayISO } from '@/core/dates';
import { WIDGET_NAME, widgetDays, type WidgetSnapshot, type WidgetView, widgetView } from '@/core/widget';

import { widgetAvailable } from './available';

export { widgetAvailable };

/**
 * Dibujo del widget en iPhone (SwiftUI). Esta función se ejecuta dentro del
 * widget, no dentro de la app: solo puede usar lo que recibe en `props` y los
 * componentes de @expo/ui. El monto se oculta cuando el iPhone está bloqueado.
 */
const layout = (props: WidgetView) => {
  'widget';
  const color = props.tone === 'low' ? '#DC2626' : props.tone === 'ok' ? '#16A34A' : '#6B7280';
  return (
    <HStack>
      <VStack alignment="leading" spacing={4}>
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' }), lineLimit(1)]}>{props.title}</Text>
        <Text modifiers={[font({ size: 30, weight: 'bold', design: 'rounded' }), foregroundStyle(color), lineLimit(1), minimumScaleFactor(0.5), privacySensitive()]}>
          {props.amount}
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 12 }), foregroundStyle({ type: 'hierarchical', style: 'secondary' }), lineLimit(2), minimumScaleFactor(0.8), privacySensitive()]}>
          {props.detail}
        </Text>
      </VStack>
      <Spacer />
    </HStack>
  );
};

let widget: Widget<WidgetView> | null = null;

const localMidnight = (date: string): Date => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export async function syncWidget(snapshot: WidgetSnapshot | null): Promise<void> {
  if (!widgetAvailable) return;
  try {
    widget ??= createWidget<WidgetView>(WIDGET_NAME, layout);
    if (!snapshot) {
      // Widget apagado: se borran los montos que tenía guardados.
      widget.updateSnapshot(widgetView(null, todayISO()));
      return;
    }
    // Una entrada por día hasta el día de pago: el iPhone cambia el monto solo a medianoche.
    const today = todayISO();
    const entries = widgetDays(snapshot, today).map((date) => ({
      date: date === today ? new Date() : localMidnight(date),
      props: widgetView(snapshot, date),
    }));
    entries.push({ date: localMidnight(snapshot.payday), props: widgetView(snapshot, snapshot.payday) });
    widget.updateTimeline(entries);
  } catch {
    // El widget es un extra: si falla, la app sigue funcionando igual.
  }
}

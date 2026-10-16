'use no memo';

import { FlexWidget, TextWidget } from 'react-native-android-widget';

import type { WidgetView } from '@/core/widget';

const THEMES = {
  light: { bg: '#FFFFFF', muted: '#6B7280', ok: '#15803D', low: '#DC2626' },
  dark: { bg: '#1C1C1E', muted: '#A1A1AA', ok: '#4ADE80', low: '#F87171' },
} as const;

function draw(view: WidgetView, theme: (typeof THEMES)[keyof typeof THEMES]) {
  const color = view.tone === 'low' ? theme.low : view.tone === 'ok' ? theme.ok : theme.muted;
  return (
    <FlexWidget
      clickAction="OPEN_APP"
      accessibilityLabel={`${view.title}: ${view.amount}. ${view.detail}`}
      style={{ height: 'match_parent', width: 'match_parent', backgroundColor: theme.bg, borderRadius: 22, padding: 14, flexDirection: 'column', justifyContent: 'space-between' }}>
      <FlexWidget style={{ flexDirection: 'column' }}>
        <TextWidget text={view.title} maxLines={1} truncate="END" style={{ fontSize: 13, fontWeight: '600', color: theme.muted }} />
        <TextWidget text={view.amount} maxLines={1} style={{ fontSize: 28, fontWeight: 'bold', color, adjustsFontSizeToFit: true }} />
      </FlexWidget>
      <TextWidget text={view.detail} maxLines={2} truncate="END" style={{ fontSize: 12, color: theme.muted }} />
    </FlexWidget>
  );
}

/** Dibujo del widget en Android, en claro y oscuro. */
export const androidView = (view: WidgetView) => ({ light: draw(view, THEMES.light), dark: draw(view, THEMES.dark) });

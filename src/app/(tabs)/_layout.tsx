import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { TAB_OPTIONS } from '@/core/layout';
import { useStore } from '@/data/store';
import { TabBar } from '@/features/shared/TabBar';

/**
 * Todas las secciones principales son pestañas; cuáles aparecen en la barra y
 * en qué orden lo decide el usuario en Más → Apariencia. Las que no están en
 * la barra se abren desde "Más" y muestran el botón Atrás.
 */
export default function TabsLayout() {
  const onboarded = useStore((s) => s.settings.onboarded);
  if (!onboarded) return <Redirect href="/bienvenida" />;
  return (
    <Tabs backBehavior="history" screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      {TAB_OPTIONS.map((tab) => (
        <Tabs.Screen key={tab.key} name={tab.key} options={{ title: tab.label }} />
      ))}
    </Tabs>
  );
}

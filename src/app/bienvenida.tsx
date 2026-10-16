import { Redirect } from 'expo-router';
import { useState } from 'react';

import { useStore } from '@/data/store';
import OnboardingScreen from '@/features/onboarding/OnboardingScreen';

export default function Bienvenida() {
  // Si la app ya estaba configurada al abrir esta pantalla, se va directo al inicio.
  const [alreadyOnboarded] = useState(() => useStore.getState().settings.onboarded);
  if (alreadyOnboarded) return <Redirect href="/" />;
  return <OnboardingScreen />;
}

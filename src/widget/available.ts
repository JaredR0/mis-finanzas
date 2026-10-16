import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * true si esta instalación de la app incluye el widget.
 * El widget es código nativo aparte: solo existe si la app se compiló con
 * `"enabled": true` en widget.config.json (ver README).
 */
export const widgetAvailable: boolean =
  (Platform.OS === 'ios' || Platform.OS === 'android') && Constants.expoConfig?.extra?.widget === true;

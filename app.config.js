/**
 * Configuración de la app. Lo normal está en app.json; aquí solo se decide si
 * se incluye el widget "Puedes gastar hoy".
 *
 * El widget es código nativo aparte (una extensión en iPhone, un receptor en
 * Android). Para incluirlo: pon "enabled": true en widget.config.json y vuelve
 * a generar los proyectos nativos con `npx expo prebuild --clean`.
 */
const widget = require('./widget.config.json');

const NAME = 'GastoDiario';
const TITLE = 'Puedes gastar hoy';
const DESCRIPTION = 'Cuánto puedes gastar hoy para llegar a tu próximo pago.';

module.exports = ({ config }) => {
  const enabled = widget.enabled === true;
  const extra = { ...config.extra, widget: enabled };
  if (!enabled) return { ...config, extra };

  const bundleId = config.ios.bundleIdentifier;
  const widgetPlugins = [
    [
      'expo-widgets',
      {
        bundleIdentifier: `${bundleId}.widget`,
        groupIdentifier: `group.${bundleId}`,
        enablePushNotifications: false,
        widgets: [
          {
            name: NAME,
            displayName: TITLE,
            description: DESCRIPTION,
            supportedFamilies: ['systemSmall', 'systemMedium'],
            contentMarginsDisabled: false,
          },
        ],
      },
    ],
    [
      'react-native-android-widget',
      {
        widgets: [
          {
            name: NAME,
            label: TITLE,
            description: DESCRIPTION,
            minWidth: '140dp',
            minHeight: '70dp',
            targetCellWidth: 2,
            targetCellHeight: 1,
            resizeMode: 'horizontal|vertical',
            // Android repinta el widget cada 30 minutos (el mínimo que permite).
            updatePeriodMillis: 1800000,
          },
        ],
      },
    ],
  ];

  // Las reglas de seguridad (sin internet, sin push) se registran antes que los
  // módulos del widget: lo que se registra primero se aplica al final, encima
  // de lo que ellos agregan.
  const isRule = (plugin) => typeof plugin === 'string' && plugin.startsWith('./plugins/');
  const plugins = [...config.plugins.filter(isRule), ...widgetPlugins, ...config.plugins.filter((p) => !isRule(p))];
  return { ...config, extra, plugins };
};

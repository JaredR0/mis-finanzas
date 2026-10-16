/**
 * Regla de seguridad para iPhone: la app no se registra para notificaciones
 * remotas (push). Los recordatorios son locales: los programa el propio
 * teléfono y no pasan por ningún servidor.
 *
 * Quita el permiso `aps-environment` que el módulo de notificaciones (y el del
 * widget) agregan por defecto. De paso, permite instalar la app con un Apple ID gratuito,
 * que no admite ese permiso.
 */
const { withEntitlementsPlist, withInfoPlist } = require('expo/config-plugins');

module.exports = function withNoRemotePush(config) {
  config = withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
  return withInfoPlist(config, (cfg) => {
    // El módulo del widget también trae "Live Activities" (avisos en vivo que pueden
    // actualizarse por internet). La app no las usa: quedan apagadas.
    if ('NSSupportsLiveActivities' in cfg.modResults) cfg.modResults.NSSupportsLiveActivities = false;
    if ('NSSupportsLiveActivitiesFrequentUpdates' in cfg.modResults) cfg.modResults.NSSupportsLiveActivitiesFrequentUpdates = false;
    const modes = cfg.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      const kept = modes.filter((mode) => mode !== 'remote-notification' && mode !== 'fetch');
      if (kept.length) cfg.modResults.UIBackgroundModes = kept;
      else delete cfg.modResults.UIBackgroundModes;
    }
    return cfg;
  });
};

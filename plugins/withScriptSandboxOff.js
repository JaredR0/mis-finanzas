/**
 * Xcode recientes ejecutan los scripts de compilación dentro de un "sandbox".
 * El script que empaqueta el código de la app (main.jsbundle) necesita escribir
 * en la carpeta de compilación y el sandbox se lo impide (error EPERM).
 * Esto solo afecta a la compilación en la Mac; no cambia nada dentro de la app.
 */
const { withXcodeProject } = require('expo/config-plugins');

module.exports = function withScriptSandboxOff(config) {
  return withXcodeProject(config, (cfg) => {
    const configs = cfg.modResults.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configs)) {
      const entry = configs[key];
      if (entry && typeof entry === 'object' && entry.buildSettings) {
        entry.buildSettings.ENABLE_USER_SCRIPT_SANDBOXING = 'NO';
      }
    }
    return cfg;
  });
};

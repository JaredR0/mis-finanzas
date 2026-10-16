/**
 * Arreglo de compilación en Android: dos módulos traen versiones distintas de
 * la misma librería de Android (WorkManager 2.8.1 y su complemento "ktx"
 * 2.7.1), y juntas chocan con "Duplicate class androidx.work...".
 * Se obliga a que ambas partes usen la misma versión.
 */
const { withAppBuildGradle } = require('expo/config-plugins');

const MARK = '// mis-finanzas: WorkManager alineado';
const BLOCK = `
${MARK}
configurations.all {
    resolutionStrategy {
        force 'androidx.work:work-runtime:2.8.1', 'androidx.work:work-runtime-ktx:2.8.1'
    }
}
`;

module.exports = function withAlignedWorkManager(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARK)) cfg.modResults.contents += BLOCK;
    return cfg;
  });
};

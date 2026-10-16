/**
 * Regla de seguridad para Android: la versión instalable (release) no tiene
 * permiso de internet. Sin ese permiso, el sistema operativo impide que la app
 * —o cualquier librería dentro de ella— abra una conexión.
 *
 * Solo se aplica a "release": la versión de desarrollo (debug) necesita la red
 * local para cargar el código desde la computadora.
 */
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const REMOVED = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.CHANGE_NETWORK_STATE',
  'android.permission.CHANGE_WIFI_STATE',
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_CONNECT',
  'android.permission.BLUETOOTH_SCAN',
  'android.permission.NEARBY_WIFI_DEVICES',
  'android.permission.NFC',
  'android.permission.SYSTEM_ALERT_WINDOW',
];

const manifest = () =>
  [
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">',
    '  <!-- Generado por plugins/withOfflineRelease.js: la versión release no se conecta a nada. -->',
    ...REMOVED.map((name) => `  <uses-permission android:name="${name}" tools:node="remove" />`),
    '  <application android:usesCleartextTraffic="false" tools:replace="android:usesCleartextTraffic" />',
    '</manifest>',
    '',
  ].join('\n');

module.exports = function withOfflineRelease(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'release');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'AndroidManifest.xml'), manifest());
      return cfg;
    },
  ]);
};

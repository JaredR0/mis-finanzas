# Seguridad de Mis Finanzas

Qué protege la app, cómo lo hace y qué no puede garantizar. Dentro de la app, el estado de estas protecciones se ve en **Más → Seguridad**.

Hay dos formas de usarla: la **app nativa** (instalada con Xcode o Android Studio) y la **versión web** (abierta desde https://jaredr0.github.io/mis-finanzas/ y agregada a la pantalla de inicio). Las reglas son las mismas; lo que cambia en la versión web está en la sección [Versión web](#versión-web).

## Las reglas

1. **Tus datos no salen del teléfono.** La app nativa no se conecta a internet. La versión web solo descarga la app misma (código e íconos) desde GitHub; lo que anotas nunca se envía.
2. **No recopila datos.** Sin cuentas, sin analíticas, sin anuncios, sin identificadores.
3. **Solo guarda lo necesario.** De las tarjetas no se guarda ningún número, ni completo ni parcial: solo el nombre que el usuario les pone y sus fechas. Tampoco códigos de seguridad ni claves del banco.
4. **Todo lo guardado va cifrado**, con una llave que no sale del teléfono.
5. **Nada sale de la app sin que el usuario lo pida** (Excel y respaldo, desde un botón).
6. **Lo que entra desde fuera se trata como no confiable** (archivos de respaldo). La app no lee mensajes ni acepta enlaces que registren movimientos: todo se anota a mano. (La captura automática de SMS se quitó en la versión 1.1.0.)
7. **Permisos mínimos.** La app nativa solo pide notificaciones y Face ID, y ambos son opcionales. La versión web no pide ningún permiso.

Las reglas 1, 2, 5 y parte de la 7 las vigilan pruebas automáticas: si alguien agrega código que use la red, abra enlaces externos, escriba en la consola o toque el almacenamiento fuera de su capa, `npm test` falla (`src/security/__tests__/security.test.ts`, sección "reglas del código").

## Cómo se cumple cada una

### Sin internet

| Capa | Dónde | Qué hace |
| --- | --- | --- |
| No hay código de red | Todo `src/` | La app no usa `fetch`, sockets ni servicios externos. Una prueba lo comprueba archivo por archivo. |
| Puertas de red cerradas | `src/security/networkGuard.ts` | En la versión instalada, `fetch`, `XMLHttpRequest`, `WebSocket` y `EventSource` se reemplazan por versiones que siempre fallan y no se pueden volver a abrir. Si una librería intentara conectarse, no puede; el intento se cuenta y se muestra en la pantalla de Seguridad. |
| Sin permiso de internet (Android) | `plugins/withOfflineRelease.js` | La versión release no tiene el permiso `INTERNET` ni los de Wi-Fi, Bluetooth o NFC. El sistema operativo impide cualquier conexión. |
| Sin notificaciones remotas (iPhone) | `plugins/withNoRemotePush.js` | Se quita el permiso de push. Los recordatorios los programa el propio teléfono. |
| Sin servicios de terceros | `package.json` | No hay SDK de analíticas, anuncios, reportes de errores ni actualizaciones remotas. Las dependencias que no se usaban se quitaron. |

**Límite en iPhone:** iOS no ofrece un permiso para prohibirle internet a una app. Las capas de arriba cubren todo el código JavaScript; el código nativo de los módulos de Expo que usa la app no hace conexiones, pero iOS no lo impide a nivel de sistema como sí lo hace Android. Para cerrarlo también desde el sistema: **Ajustes → Datos celulares → Mis Finanzas → desactivar** (iOS no permite hacer lo mismo con Wi-Fi fuera de China).

**En desarrollo** (`npx expo start`, versión debug) la red local sigue abierta, porque la herramienta carga el código desde la computadora. Las protecciones de red aplican a la versión instalada (release).

### Datos cifrados

- Algoritmo: XChaCha20-Poly1305 (cifrado autenticado), de la librería auditada `@noble/ciphers`. Si alguien altera un byte del archivo, abrirlo falla en lugar de devolver datos manipulados.
- La llave (256 bits, generada con el generador aleatorio del sistema) vive en el **Keychain** de iOS / **Keystore** de Android, con la opción "solo con el teléfono desbloqueado, solo en este dispositivo": no se copia a iCloud ni pasa a otro teléfono.
- Los datos cifrados quedan excluidos de las copias de iCloud (`RCTAsyncStorageExcludeFromBackup`) y de las copias automáticas de Android (`allowBackup: false`).
- Si los datos no se pueden abrir (por ejemplo, el llavero no responde), la app **no escribe nada encima**: muestra un aviso y deja reintentar.
- Si se restauran datos en otro teléfono, la llave no viaja, así que no se pueden abrir. La app los aparta sin borrarlos y empieza de cero; la información se recupera con el archivo de respaldo.

Archivos: `src/security/seal.ts` (cifrado), `src/security/secureStorage.ts` (reglas de guardado), `src/security/keyStore.ts` (llavero), `src/data/storage.ts` (conexión con la app).

### Bloqueo y pantalla

- **Bloqueo** (opcional, se activa en Más → Seguridad): pide Face ID, huella o el código del teléfono al abrir y al volver después de un minuto fuera. La app nunca ve la biometría: el sistema solo responde sí o no. Para activar o desactivar el bloqueo también hay que identificarse.
- **Ocultar al salir** (activado por defecto): en iPhone la app aparece difuminada en el selector de aplicaciones; en Android aparece en blanco y no se pueden tomar capturas de pantalla.

En Android 14 o más reciente, el módulo que bloquea las capturas necesita el permiso "detectar capturas de pantalla" (el sistema lo da sin preguntar y solo avisa a la app que se intentó una captura). Quitarlo hacía que la app se cerrara al abrir, así que se conserva.

Archivos: `src/security/AppLock.tsx`, `lock.ts`, `screenShield.ts`.

### Lo que entra desde fuera

- **Sin captura automática:** desde la 1.1.0 la app no tiene enlaces `misfinanzas://captura` ni lector de mensajes. Nada de fuera puede crear movimientos. Los datos de versiones anteriores pierden la clave de captura al abrirse.
- **Respaldos:** un archivo de respaldo se valida antes de usarse y no puede cambiar el bloqueo ni el escudo del teléfono.
- **Excel:** todo texto se escribe como texto literal; un comercio llamado `=FORMULA()` no se ejecuta al abrir el archivo.

### Lo que sale

Solo dos cosas, y solo con un toque del usuario: **Exportar datos a Excel** y **Crear respaldo**. Ambas usan la hoja de compartir del sistema (el usuario elige el destino) y la copia temporal se borra del teléfono al terminar.

**Importante:** esos dos archivos salen **sin cifrar**. Quien los abra puede leer todo. Hay que guardarlos en un lugar privado.

### Widget (opcional)

El widget "Puedes gastar hoy" viene **apagado** y además solo existe si la app se compiló con él (README → Widget). Al encenderlo en Ajustes → Widget:

- **Qué recibe:** cuatro datos y nada más: el símbolo de moneda, cuánto queda libre, la fecha del próximo pago y el día en que se calculó. No recibe cuentas, tarjetas, movimientos, deudas ni nombres. Una prueba automática lo comprueba (`src/core/__tests__/widget.test.ts`).
- **Dónde quedan esos datos:** el widget corre fuera de la app y no puede leer la base cifrada. En iPhone se guardan en un espacio compartido entre la app y su widget (App Group), protegido por el cifrado normal del iPhone pero **no** por la llave de la app. En Android se guardan cifrados con la misma llave de la app.
- **Quién lo ve:** cualquiera que vea la pantalla de inicio del teléfono desbloqueado, sin pasar por Face ID ni por el bloqueo de la app. En iPhone el monto se marca como dato privado para que el sistema lo oculte con el teléfono bloqueado; el widget no se ofrece para la pantalla de bloqueo.
- **Al apagarlo:** la app reemplaza esos datos por un texto vacío y el widget deja de mostrar montos.
- **Sin red:** el widget no tiene código de red, y el módulo que lo dibuja en iPhone trae funciones de avisos remotos que quedan desactivadas (`plugins/withNoRemotePush.js` quita el permiso de push y apaga las Live Activities). La barrera de `networkGuard.ts` vive dentro de la app; el widget de iPhone es un proceso aparte donde esa barrera no corre.

Archivos: `src/core/widget.ts` (qué números salen), `src/widget/` (dibujo en cada sistema), `app.config.js` y `widget.config.json` (si se incluye o no).

## Versión web

La versión web es la misma app (mismo código y mismas reglas), servida por GitHub Pages. Diferencias:

| Tema | App nativa | Versión web |
| --- | --- | --- |
| Internet | No se conecta nunca | Descarga la app desde GitHub al abrirla con internet. Tus datos nunca se envían |
| Llave de cifrado | Llavero del teléfono (Keychain / Keystore) | Envuelta con tu PIN; el PIN no se guarda en ningún lado |
| Bloqueo | Face ID / huella / código (opcional) | PIN de 6 números, siempre: al abrir y al volver después de un minuto |
| Dónde viven los datos | Almacenamiento privado de la app | Almacenamiento del navegador para esa dirección, en ese teléfono |
| Recordatorios y widget | Sí | No |

**Cómo se protege:**

- **PIN y cifrado** (`src/security/pinVault.ts`, `keyStore.web.ts`): la llave de los datos (256 bits al azar) se guarda cifrada con una llave que sale del PIN mediante PBKDF2-SHA256 con 600 000 vueltas y sal aleatoria. Los datos usan el mismo cifrado que la app nativa (XChaCha20-Poly1305). Sin el PIN lo guardado es ilegible.
- **Intentos:** después de 5 PIN equivocados hay que esperar 30 s, y la espera se duplica en cada fallo siguiente. PIN como `111111` o `123456` no se aceptan.
- **PIN olvidado:** no hay forma de recuperarlo. "Olvidé mi PIN" borra todo lo de la app en ese navegador; se recupera con un respaldo.
- **Puertas de red cerradas:** la misma barrera de la app nativa (`networkGuard.ts`) bloquea `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` y `sendBeacon` dentro de la app.
- **Solo archivos de la misma dirección (CSP):** la página declara una regla del navegador que solo deja cargar código, estilos, imágenes y conexiones de `jaredr0.github.io`. Aunque algo intentara mandar datos a otro sitio, el navegador lo bloquea. No hay analíticas, fuentes externas ni librerías de otros servidores.
- **Service worker** (`public/sw.js`): guarda una copia de los archivos de la app para que abra sin internet. No ve tus datos (viven en otro lugar del navegador) y solo responde pedidos de la propia app.
- **Sin rastro en buscadores:** la página pide no ser indexada y no envía la dirección de origen a otros sitios.

**Límites de la versión web:**

- **Quien controla el repositorio controla la app.** Si alguien entrara a la cuenta de GitHub, podría publicar una versión que lea los datos al escribir el PIN. Protege la cuenta con verificación en dos pasos y no des permisos de escritura a nadie más.
- **Mismo dominio para todas tus páginas.** Todas las páginas de `jaredr0.github.io` comparten el almacenamiento del navegador. Los datos de esta app van cifrados con el PIN, pero no publiques en esa cuenta páginas de terceros o código que no conozcas.
- **El PIN de 6 números es más débil que el llavero del teléfono.** Alguien que copie los datos del navegador (con el teléfono desbloqueado y herramientas de desarrollo) podría probar todos los PIN con una computadora potente en poco tiempo (minutos u horas). Protege el teléfono con su código.
- **Los datos se pueden borrar:** si se borran los datos de Safari o se quita la app de la pantalla de inicio, se pierden. Haz respaldos.
- **Probado en Chromium**, no en un iPhone real: crear y escribir el PIN, cifrado, recarga, abrir sin internet, rutas internas, cambiar PIN, re-bloqueo, "Olvidé mi PIN", respaldo y Excel. En Safari de iPhone falta confirmarlo.

## Lo que esta app no puede garantizar

- **Un teléfono comprometido.** Con jailbreak, malware o alguien que conoce el código del teléfono, ninguna app protege sus datos.
- **El archivo de Excel y el respaldo**, una vez fuera de la app.
- **Teclados de terceros**, que pueden ver lo que se escribe. Conviene usar el teclado de Apple.
- **El widget, si lo enciendes:** el monto queda a la vista en la pantalla de inicio.
- **Lo que no se probó en un teléfono real.** El cifrado, el PIN de la versión web y las reglas de guardado tienen pruebas automáticas. La conexión con el llavero, Face ID y el escudo de pantalla usan los módulos oficiales de Expo, pero solo se pueden confirmar en el dispositivo. El widget es la parte menos probada: su lógica tiene pruebas, pero el código nativo no se ha compilado ni ejecutado en un teléfono. Si el cifrado no funcionara en un teléfono, la app no falla ni pierde datos: guarda sin cifrar y lo muestra en Más → Seguridad como "Datos sin cifrar".

## Al instalarla en el iPhone, revisa

1. **Más → Seguridad** muestra "Sin conexión a internet" y "Datos cifrados" en verde.
2. Activa el **bloqueo** ahí mismo.
3. En Ajustes del iPhone → Datos celulares, desactiva Mis Finanzas.

En la versión web: **Más → Seguridad** debe mostrar "Tus datos no salen del teléfono" y "Datos cifrados con tu PIN".

## Si algún día se publica en el App Store

- La app usa cifrado propio para datos locales: habrá que responder la pregunta de cumplimiento de exportación de Apple.
- Si se incluye el widget, su extensión necesita su propio manifiesto de privacidad (usa UserDefaults para leer los datos compartidos).
- La etiqueta de privacidad es "No se recopilan datos" (ya declarado en el manifiesto de privacidad, `app.json` → `ios.privacyManifests`).

## Dependencias

`npm audit` reporta avisos en herramientas de compilación de Expo (se usan en la computadora al construir la app, no van dentro de ella). La librería de Excel que tenía avisos de seguridad se reemplazó por un escritor propio (`src/services/xlsxWriter.ts`).

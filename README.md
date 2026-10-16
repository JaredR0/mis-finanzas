# Mis Finanzas

**Versión 1.1.0** · historial en [CHANGELOG.md](CHANGELOG.md)

App para iPhone y Android (React Native + Expo), que también se usa como app web instalable desde un enlace para administrar tu dinero: cuánto puedes gastar hasta tu próximo pago, meta de fin de mes, proyección de ahorro, evaluador de compras a cuotas, tarjetas de crédito con su corte y fecha de pago, apartados y metas de ahorro con fecha, calendario con ingresos y gastos a futuro, ingresos extra, deudas, gastos fijos, presupuesto con avisos, buscador, reportes, exportación a Excel (un libro por mes) y un widget opcional con lo que puedes gastar hoy.

Todo se registra a mano con el botón + (la captura automática de mensajes se quitó en la 1.1.0).

Los datos se guardan solo en el teléfono, cifrados, y nunca se envían a ningún lado. Las reglas y sus límites están en [SEGURIDAD.md](SEGURIDAD.md).

## Usarla en iPhone sin instalar nada (versión web)

**Enlace:** https://jaredr0.github.io/mis-finanzas/

1. Abre el enlace en **Safari** (en iPhone tiene que ser Safari).
2. Toca **Compartir** (el cuadro con la flecha) → **Agregar a inicio** → **Agregar**.
3. Abre **Mis Finanzas** desde el ícono nuevo. La primera vez pide **crear un PIN de 6 números**: con él se cifran tus datos.

Así no hace falta Mac, cable, modo desarrollador ni renovar cada 7 días. Para compartirla con alguien, basta con mandarle el enlace: cada persona tiene sus propios datos en su propio teléfono, nadie ve los de nadie.

- **Sin internet:** después de abrirla una vez, funciona sin conexión. Con internet, al abrirla toma sola la versión más nueva.
- **Datos:** viven en el teléfono, cifrados con el PIN. Si borras los datos de Safari o quitas el ícono de inicio, se pierden: haz un **respaldo** de vez en cuando (Ajustes → Respaldo).
- **PIN olvidado:** no se puede recuperar; "Olvidé mi PIN" borra todo para empezar de nuevo (y luego puedes restaurar un respaldo).
- **Lo que no tiene la versión web:** Face ID (usa el PIN), recordatorios y widget.

### Publicar una versión nueva en GitHub Pages

```bash
npm run web:build                      # crea dist-web/
npx gh-pages -d dist-web --dotfiles    # sube dist-web/ a la rama gh-pages
```

En el repositorio: **Settings → Pages → Source: Deploy from a branch → `gh-pages` / `(root)`**. La dirección base (`/mis-finanzas`) está en `app.json` → `experiments.baseUrl`; si el repositorio se llama distinto, cámbiala ahí.

## Instalarla como app nativa en tu iPhone

Necesitas una Mac con Xcode y Node 20 o más reciente.

```bash
npm install
npx expo run:ios --device --configuration Release
```

Conecta el iPhone por cable y elígelo en la lista. `--configuration Release` instala la versión real, con las protecciones de red activas y sin depender de la computadora. Sin esa opción se instala la versión de desarrollo, que necesita la computadora encendida y deja la red local abierta.

La primera vez, Xcode pide tu Apple ID para firmar la app (en `ios/` → Signing & Capabilities → Team). Con un Apple ID gratuito la app deja de abrir a los 7 días y hay que volver a correr el comando; con la cuenta de desarrollador de pago dura un año.

Android: `npx expo run:android --variant release` con el teléfono conectado y la depuración USB activada.

Para probar rápido en la computadora: `npm run web`.

## Widget "Puedes gastar hoy" (opcional)

Muestra en la pantalla de inicio del teléfono cuánto puedes gastar hoy; el monto cambia solo cada día. Es código nativo aparte y **no se ha compilado ni probado en un teléfono**, así que viene fuera de la instalación normal: primero instala la app sin él y confirma que funciona.

Para incluirlo:

1. En `widget.config.json` cambia `"enabled": false` por `"enabled": true`.
2. Vuelve a generar los proyectos nativos: `npx expo prebuild --clean`.
3. Instala de nuevo (`npx expo run:ios --device --configuration Release` o `npx expo run:android --variant release`).
4. En la app: **Ajustes → Widget → Encendido**. Luego agrega el widget desde la pantalla de inicio del teléfono.

En iPhone el widget es un segundo "target" en Xcode (`ExpoWidgetsTarget`) y usa un App Group (`group.com.jared.misfinanzas`): Xcode puede pedirte elegir tu equipo de firma también para ese target. Si la compilación falla por el widget, regresa `"enabled"` a `false`, repite el paso 2 y la app queda como antes.

En Android el sistema repinta el widget cada 30 minutos como mínimo, así que el cambio de día puede tardar ese tiempo en verse.

Lo que el widget recibe y dónde queda guardado está en [SEGURIDAD.md](SEGURIDAD.md).

## Comandos

| Comando | Qué hace |
| --- | --- |
| `npm run check` | Tipos + linter + pruebas, todo junto |
| `npm test` | Pruebas de la lógica financiera, de las reglas de seguridad y del tema (173) |
| `npm run web:build` | Versión web para GitHub Pages en `dist-web/` |
| `npm run typecheck` | Revisión de tipos |
| `npm run lint` | Linter |
| `npm run web` | Abre la app en el navegador |

## Cómo está organizada

Cada capa solo conoce a la de abajo. Para cambiar algo, casi siempre tocas una sola carpeta.

```
src/
  core/        Lógica pura, sin pantallas ni librerías. Aquí están las reglas y las pruebas.
    types.ts          Modelo de datos (montos en centavos, fechas 'AAAA-MM-DD')
    payCycle.ts       Días de pago (quincena, mensual, otros)
    creditCard.ts     Cortes, fechas límite y cuánto pagar de cada tarjeta
    balances.ts       Saldos, próximos pagos y "libre para gastar"
    reports.ts        Resumen por mes y por año
    forecast.ts       Meta de fin de mes y proyección de los próximos meses
    installments.ts   Compras a cuotas: costo real y veredicto
    extraIncome.ts    Ingresos fuera del sueldo base (bonos, aguinaldo, trabajos aparte)
    planned.ts        Gastos planeados para una fecha (matrícula, seguro, un viaje)
    calendar.ts       Calendario: qué entra y sale cada día, y cómo cerraría cada mes
    savingsGoal.ts    Metas de ahorro con fecha: aportes, atraso, mantener o aplazar
    budget.ts         Avisos de presupuesto por categoría
    search.ts         Buscador por texto, monto o fecha
    widget.ts         Qué números recibe el widget y qué texto muestra cada día
    debtPlan.ts       Plan para salir de deudas (bola de nieve y avalancha)
    autoFixed.ts      Gastos fijos que se registran solos
    txDraft.ts        Forma de un movimiento antes de guardarlo
    banks.ts          Bancos que se ofrecen al crear una tarjeta
    layout.ts         Pestañas y secciones de Inicio que el usuario puede acomodar
    mutations.ts      Guardar/borrar con sus reglas de integridad; valida respaldos
    exportData.ts     Contenido de las hojas de Excel
  security/    Reglas de seguridad, cada una en su archivo
    networkGuard.ts   Cierra las puertas de red
    seal.ts           Cifrado de los datos
    secureStorage.ts  Guardado cifrado (nunca sobrescribe datos que no pudo abrir)
    keyStore.ts       Llave en el llavero del teléfono (keyStore.web.ts: llave envuelta con el PIN)
    pinVault.ts       Versión web: guarda la llave cifrada con el PIN (PBKDF2 + XChaCha20)
    PinPrompt.tsx     Versión web: pantalla para crear y escribir el PIN
    AppLock.tsx       Bloqueo con Face ID / código (PIN en web) y escudo de pantalla
  data/        Estado de la app y guardado
    backend.ts        Dónde se guardan físicamente los datos (hoy: almacenamiento local)
    storage.ts        Une cifrado + llavero + backend
    store.ts          Estado global y acciones; versión del formato y migraciones
  services/    Lo que habla con el sistema: archivos, Excel, respaldo, recordatorios
  widget/      Dibujo del widget: index.ios.tsx (iPhone), index.android.tsx (Android)
plugins/       Reglas nativas: sin internet en Android, sin push en iPhone
public/        Versión web: manifiesto, íconos y service worker (abre sin internet)
scripts/       build-web.mjs: arma la versión web para GitHub Pages
app.config.js  Agrega el widget a la compilación si widget.config.json lo pide
index.js       Punto de entrada (registra el widget de Android y arranca la app)
  ui/          Sistema de diseño: colores, botones, campos, gráficas (theme.ts manda;
               palette.ts deriva los tonos del color que elige el usuario)
  features/    Una carpeta por módulo: dashboard, transactions, cards, envelopes,
               debts, fixed, income, planned, calendar, forecast, installments, reports,
               settings, accounts, categories, onboarding
  app/         Rutas (Expo Router). Cada archivo solo apunta a una pantalla de features/
```

### Cambios comunes

| Quiero… | Toco… |
| --- | --- |
| Cambiar colores o tamaños | `src/ui/theme.ts` |
| Agregar una pestaña o una sección de Inicio que se pueda elegir | `src/core/layout.ts` |
| Agregar colores a elegir | `PALETTE` en `src/core/defaults.ts` |
| Agregar otro banco a la lista de tarjetas | `src/core/banks.ts` |
| Cambiar la fórmula de "libre para gastar" | `overview()` en `src/core/balances.ts` |
| Cambiar cómo se estima el gasto esperado (pesos por mes) | `WEIGHTS` en `src/core/forecast.ts` |
| Cambiar cuándo una cuota es "Te alcanza", "Piénsalo bien" o "Mejor no" | `INSTALLMENT_RULES` en `src/core/installments.ts` |
| Cambiar la regla de fecha límite de las tarjetas | `dueDateFor()` en `src/core/creditCard.ts` |
| Agregar una hoja o columna al Excel | `src/core/exportData.ts` |
| Cambiar desde qué porcentaje avisa el presupuesto (hoy 80 %) | `NEAR_BUDGET` en `src/core/budget.ts` |
| Cambiar qué entiende el buscador | `src/core/search.ts` |
| Cambiar qué aparece en el calendario | `calendarMonth()` en `src/core/calendar.ts` |
| Cambiar las reglas de la meta de ahorro (atraso, mantener, aplazar) | `src/core/savingsGoal.ts` |
| Cambiar el texto o los colores del widget | `widgetView()` en `src/core/widget.ts`; el dibujo en `src/widget/` |
| Guardar en otra base (SQLite, etc.) | `src/data/backend.ts` (el cifrado se aplica solo) |
| Cambiar el largo del PIN o los intentos permitidos (web) | `src/security/pinVault.ts` |
| Cambiar cada cuánto se vuelve a bloquear | `RELOCK_AFTER_MS` en `src/security/AppLock.tsx` |
| Agregar un campo a los datos | `src/core/types.ts`, subir `SCHEMA_VERSION` y migrar en `src/data/store.ts` |
| Agregar una pantalla | Carpeta nueva en `src/features/` + un archivo en `src/app/` |

## Cómo se calcula

- **Al empezar**: la app pregunta cuánto tienes, cuánto ganas y cada cuánto (por día, quincenal, mensual u otros días) y si ya te cayó tu pago más reciente. Si dices que no, Inicio lo sigue preguntando y lo suma con un toque cuando llegue.
- **Cada cuánto te pagan**: por día, cada semana, cada dos semanas, quincenal, mensual, otros días del mes o ingreso variable. Con ingreso variable no hay días de pago: lo libre se reparte hasta fin de mes y el ingreso mensual se toma de lo que calculas ganar y, con historial, del promedio de lo que de verdad entra.
- **Gastos fijos que se cobran solos**: si un gasto fijo o una cuota está marcada como "se cobra solo", la app registra el pago el día que toca (solo del mes en curso).
- **Plan para salir de deudas** (Deudas → Plan para salir de deudas): con un monto mensual, paga el mínimo de todas y lo demás a una sola (la más pequeña o la de más interés); cuando esa termina, su pago pasa a la siguiente. Usa interés mensual simple sobre el saldo. No incluye tarjetas ni compras a cuotas.
- **Reporte comparativo**: gastos del mes contra el mes anterior por categoría; en el mes en curso solo se cuenta hasta el día de hoy en ambos meses.
- **Deshacer**: después de borrar algo aparece "Deshacer" durante 7 segundos; devuelve los datos tal como estaban.
- **Libre para gastar** = dinero en cuentas − apartados − pagos de tarjeta, gastos fijos y deudas que vencen antes de tu próximo día de pago.
- **Tarjetas**: lo comprado hasta el día de corte (inclusive) entra en ese estado de cuenta. La fecha límite es la primera vez que cae tu día de pago al menos 10 días después del corte. Los pagos se descuentan primero del estado de cuenta más antiguo.
- **Meta de fin de mes** (Plan): dinero neto hoy (cuentas − deuda de tarjetas) + pagos que faltan − gastos fijos, cuotas, deudas y planeados del mes = con cuánto llegas si no gastas más. A eso se le quita lo que tienes en apartados: lo que queda es tu dinero **libre** a fin de mes. Lo que pase de tu meta es lo que aún puedes gastar. La pantalla Plan muestra cada renglón de esa cuenta.
- **Proyección**: cada mes te sobra ingreso − fijos y cuotas − gasto del día a día esperado. Ese gasto es el promedio de tus últimos 3 meses, con más peso a los recientes y, desde el día 10, al mes en curso: si gastas menos, la proyección sube sola.
- **Compras a cuotas que ya estás pagando**: se anotan con precio, número de cuotas, cuota mensual, con qué se pagan (tarjeta o cuenta) y cuántas llevas pagadas. Aparecen en Deudas y en Cuotas con cuántas llevas, cuánto has pagado, cuánto falta y hasta qué mes; la cuota de cada mes se marca con un botón. No se suman a "Debo" porque cada cuota ya se descuenta como gasto fijo.
- **Cuotas**: total = cuota × meses; lo que pagas de más se compara con el precio de contado y se traduce a interés anual. "Mejor no" si la cuota no cabe en lo que te sobra; "Piénsalo bien" si te deja menos del 10 % del ingreso libre, si todas tus cuotas pasan del 30 % del ingreso o si el recargo es de 25 % o más.
- **Apartados**: el dinero no sale de la cuenta, solo deja de contarse como libre. Un gasto puede salir de un apartado.
- **Meta de ahorro con fecha**: eliges la meta, la fecha y cada cuánto aportas (cada día, cada tantos días, cada semana, cada mes); la app calcula el aporte. Un aporte que toca hoy no cuenta como atraso hasta mañana. Si sacas dinero de ese ahorro o dejas de aportar y con el aporte actual ya no llegas, pregunta: **mantener** la fecha (sube el aporte) o **aplazar** (mismo aporte, fecha más lejana).
- **Ingresos extra**: lo que no es tu sueldo base. Se anotan con fecha esperada (una vez, cada mes o cada año), cuentan en la meta de fin de mes y en la proyección, y se registran como ingreso cuando confirmas que llegaron.
- **Gastos planeados**: lo que ya sabes que viene en una fecha (una vez o cada año). Si cae antes de tu próximo pago y sale de una cuenta, se aparta de lo libre igual que un gasto fijo; baja la proyección del mes en que cae; y se marca "Ya lo pagué" para volverlo un gasto real. No cuenta como gasto del día a día.
- **Calendario y balance a futuro**: cada día muestra días de pago, ingresos extra, gastos fijos y cuotas, gastos planeados, pagos de tarjeta, deudas con fecha y aportes de ahorro. Para un mes futuro: sueldo + extras − fijos − planeados − tu gasto habitual del día a día = lo que te sobraría, sumado al saldo con que cerrarías el mes anterior. Si un mes trae más de lo normal (bono, aguinaldo), lo señala como buen momento para abonar deudas o ahorrar. El Plan muestra esa misma proyección a 12 meses.
- **Presupuesto**: cada categoría puede tener un tope mensual. Al llegar al 80 % avisa en Inicio y al guardar el gasto; al pasarte, lo marca en rojo.
- **Widget**: lo libre se reparte entre los días que faltan para tu pago. Si no abres la app, el monto de cada día se recalcula solo con el último dato; el día de pago pide abrir la app.
- **Reportes**: un gasto cuenta en el mes en que se hizo la compra, aunque la tarjeta se pague después.

## Personalización

En **Más → Apariencia** se elige el tema (automático, claro u oscuro), el color principal, qué pestañas van en la barra y en qué orden (hasta 5 entre Gastos, Tarjetas, Apartados, Deudas, Fijos, Reportes, Plan y Cuotas; Inicio y Más siempre están), y qué secciones se ven en Inicio. Las secciones que se quitan de la barra se abren desde Más.

## Calendario

**Más → Calendario** (o como pestaña, desde Apariencia). Cada día es funcional: en hoy y en días pasados puedes **registrar un gasto o un ingreso** con esa fecha y ver los movimientos de ese día; cada cosa anotada tiene su botón (ya me pagaron, ya lo recibí, marcar como pagado, pagar tarjeta, abonar, apartar). Toca un día y elige **Gasto este día** o **Ingreso este día** para anotar lo que viene: el bono de julio, el aguinaldo de diciembre, la matrícula, un viaje. Los ingresos se guardan como ingresos extra y los gastos como gastos planeados; "Lo que viene" los lista en orden y al tocarlos salta a su mes.

## Excel

**Más → Exportar datos a Excel** genera un solo archivo con: el resumen del año, **un libro por cada mes** (cada gasto e ingreso con su fecha y su día de la semana, total y balance del mes), gastos por categoría, todos los movimientos juntos y el estado actual de cuentas, tarjetas, apartados, deudas, cuotas, ingresos extra y gastos planeados. Se puede exportar todo o un solo año.

Dentro de la app, lo mismo se consulta con el buscador de **Gastos**: por texto (comercio, nota, categoría, tarjeta), por monto (`85` o `85.50`) o por fecha (`06/10`, `octubre`, `viernes`).

## Respaldo

Los datos viven solo en el teléfono y su llave de cifrado no pasa a otro dispositivo: si se borra la app (o, en la versión web, los datos de Safari) o se cambia de teléfono, la única forma de recuperarlos es el respaldo. Un respaldo de la app nativa se puede restaurar en la versión web y al revés. En **Ajustes → Respaldo** se crea y se restaura un archivo `.json`. Ese archivo no va cifrado: guárdalo en un lugar privado.

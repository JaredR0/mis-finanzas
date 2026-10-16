# Historial de versiones

## 1.2.0 — 16 de octubre de 2026

- **Gastos fijos semanales y cada 14 días** (p. ej. gasolina cada lunes): se eligen en el gasto fijo (Mensual / Semanal / Cada 14 días). Cuentan cada vez que tocan en lo libre para gastar, Próximos pagos, Plan y Calendario; "Marcar como pagado" marca el cobro que toca y "Se cobra solo" registra cada semana.
- **Aviso diario en la app instalada:** cada mañana a las 8:00, cuánto puedes gastar hoy y qué vence.
- **Recordatorios en el calendario del teléfono** (Ajustes → Recordatorios → Agregar al calendario): pagos de los próximos 6 meses con aviso un día antes y el mismo día, y en la versión web un aviso diario para abrir la app. Sin montos por defecto.

## 1.1.0 — 15 de octubre de 2026

- **Versión web para iPhone sin Mac:** la app se abre desde https://jaredr0.github.io/mis-finanzas/ y se agrega a la pantalla de inicio con Safari (Compartir → Agregar a inicio). No caduca, no necesita cable ni modo desarrollador, y se comparte mandando el enlace.
- **PIN en la versión web:** la primera vez se crea un PIN de 6 números que cifra los datos en el teléfono. Se pide al abrir y al volver después de un minuto. Se puede cambiar en Más → Seguridad; "Olvidé mi PIN" borra todo para empezar de nuevo.
- **Funciona sin internet** después de abrirla una vez, y toma sola la versión nueva cuando hay conexión.
- **Respaldo y Excel en la web** se entregan con el menú Compartir del iPhone (Guardar en Archivos, AirDrop…).
- **Se quitó la captura automática de mensajes** (SMS, Atajos, enlaces de captura y su clave). Todo se registra a mano con el botón +. También se quitó el tipo de cambio del dólar, que solo usaba la captura.

## 1.0.5 — 7 de octubre de 2026

- **Arreglo en la meta de fin de mes:** "Aún puedes gastar" contaba como gastable el dinero que tienes en apartados, así que podía dar un número mayor que lo libre de Inicio. Ahora la meta se mide sobre dinero libre.
- La pantalla Plan muestra la cuenta completa: apartados, lo libre a fin de mes, tu meta y lo que aún puedes gastar.

## 1.0.4 — 7 de octubre de 2026

- **Calendario funcional:** en hoy y en días pasados se registran gastos e ingresos con la fecha de ese día, y se ven y editan los movimientos del día.
- Cada cosa del calendario tiene su acción: ya me pagaron, ya lo recibí, marcar como pagado, ya lo pagué, pagar tarjeta, abonar a la deuda y apartar para la meta.

## 1.0.3 — 7 de octubre de 2026

- **Compromisos:** una sola sección con pestañas (Fijos, Cuotas, Deudas, Planeados, Ingresos extra). El menú Más quedó más corto.
- **Plan para salir de deudas:** orden de pago, cuánto abonar este mes a cada una, cuándo quedas libre y cuánto pagas de intereses. Las deudas aceptan interés anual y pago mínimo.
- **Pago semanal, cada dos semanas e ingreso variable.**
- **Gastos fijos y cuotas que se cobran solos.**
- **Reporte comparativo** contra el mes anterior, por categoría.
- **Deshacer** después de borrar.
- **Aviso de pago:** "Todavía no" vuelve a preguntar al día siguiente; "Ya lo tenía contado" lo cierra.
- **Cuotas:** dos entradas separadas, "Agregar una que ya pago" y "¿Me conviene?".

## 1.0.2 — 7 de octubre de 2026

- **Bienvenida:** primero cuánto tienes en la cuenta, luego cuánto ganas y cada cuánto (por día, quincenal, mensual u otros días), y después si ya te pagaron. Con eso muestra cuánto tienes disponible para gastar y cuánto por día.
- Si todavía no te cae el pago, Inicio lo pregunta hasta que llegue y lo suma con un toque.
- Pago diario también en Ajustes → Tu pago.

## 1.0.1 — 7 de octubre de 2026

Primera versión instalada en un teléfono real (Android).

- **Deudas → Compras a cuotas:** cada compra muestra la cuota mensual, con qué se paga, cuántas cuotas llevas, cuánto has pagado, cuánto falta y hasta qué mes. Botón para pagar la cuota del mes.
- Se pueden anotar compras que ya venías pagando (indicando cuántas cuotas llevas).
- El Excel incluye cuotas que faltan y monto por pagar.
- Arreglo: en Android la compilación fallaba por dos versiones de una misma librería (WorkManager).
- Arreglo: en Android 14 o más reciente la app se cerraba al abrir por un permiso que se había quitado de más.

## 1.0.0 — 7 de octubre de 2026

Primera versión completa. Probada con 161 pruebas automáticas y 129 comprobaciones de uso en el navegador; **falta la prueba en un teléfono real** (iPhone y Android).

**Día a día**
- Inicio con lo libre para gastar hasta tu próximo pago y cuánto por día.
- Registro manual de gastos, ingresos, transferencias, pagos de tarjeta, aportes y abonos.
- Buscador por texto, monto o fecha.
- Captura automática opcional (apagada por defecto): pegar mensajes del banco, Atajos en iPhone, app de automatización en Android.

**Tarjetas, deudas y compromisos**
- Tarjetas de crédito con día de corte y de pago, sin guardar números de tarjeta.
- Deudas por grupos (crédito, personas) y lo que te deben.
- Gastos fijos y cuotas; evaluador de compras a cuotas.

**Ahorro y planeación**
- Apartados y guardaditos; metas de ahorro con fecha, con "mantener o aplazar" cuando te atrasas o sacas dinero.
- Ingresos extra (bono, aguinaldo, trabajos aparte) y gastos planeados con fecha.
- Calendario con lo que entra y sale cada día y balance a futuro mes por mes.
- Meta de fin de mes, proyección a 12 meses y avisos de presupuesto por categoría.

**Reportes**
- Reportes por mes y por año.
- Exportación a Excel con un libro por cada mes.

**Seguridad**
- Sin conexión a internet, sin recopilar datos, datos cifrados en el teléfono.
- Bloqueo con Face ID / huella / código y pantalla oculta al salir de la app.
- Respaldo y restauración desde un archivo.

**Personalización**
- Modo claro, oscuro o automático; color principal; pestañas y secciones de Inicio a gusto.
- Widget opcional "Puedes gastar hoy" (se agrega al compilar; ver README).

**Pendiente de confirmar en un teléfono**
- Instalación y firma con tu Apple ID.
- Llavero, Face ID, recordatorios y escudo de pantalla.
- Widget en iPhone y Android (código nativo sin compilar todavía).

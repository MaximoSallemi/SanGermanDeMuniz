# San Germán de Muñiz

Aplicación local de reservas, almanaque, consumiciones y caja. React + TypeScript + Vite, Fastify y SQLite. Los datos permanecen en esta computadora. No requiere servicios externos ni conexión a Internet después de instalar las dependencias.

## Inicio en Windows

Requisito: Node.js **22.16 o superior**. Las dependencias ya están instaladas en esta carpeta.

Hacé doble clic en **Iniciar.cmd**. El iniciador compila la aplicación, levanta el servidor y abre el navegador cuando está listo. Mantené su ventana abierta mientras trabajás. La dirección habitual es <http://127.0.0.1:4310>.

También podés iniciarla desde una terminal:

```powershell
npm ci
npm run build
npm start
```

Para desarrollo con recarga automática:

```powershell
npm run dev
```

Interfaz de desarrollo: <http://127.0.0.1:5173>. API y aplicación compilada: <http://127.0.0.1:4310>. Ambos servidores escuchan exclusivamente en `127.0.0.1`. `PORT` permite cambiar el puerto de la API; reiniciá ambos procesos si lo modificás.

## Uso

1. **Reservas:** creá la reserva con huésped, personas, tarifa total y una o varias asignaciones de habitación y fechas. La misma reserva aparece inmediatamente en el almanaque. Para un cambio de habitación, agregá un tramo con sus propias fechas.
2. **Almanaque:** días en un eje horizontal continuo, habitaciones fijas a la izquierda y encabezado fijo. Elegí un mes, volvé a Hoy o desplazate horizontalmente. Seleccioná una celda libre para reservar, o una estadía para abrir su cuenta y consumiciones.
3. **Consumiciones:** agregalas desde la cuenta de una estadía. Guardan habitación, fecha, producto, cantidad y precio unitario. Las sugerencias recuerdan el último precio registrado; cada consumo conserva su precio histórico. No se precargaron tarifas comerciales.
4. **Caja:** abrila con el efectivo inicial antes de registrar cobros o movimientos. Los cobros se cargan desde la reserva y aparecen automáticamente en caja. Los gastos, retiros y otros ingresos se cargan como movimientos manuales. Cerrá con el efectivo contado para registrar la diferencia.
5. **Datos y respaldos:** creá y descargá copias, restaurá un estado anterior o revisá los registros preparados desde Excel. También hay exportaciones CSV de reservas, consumiciones y movimientos.

Las búsquedas, filtros, vista de cuentas e historial funcionan sobre SQLite, no sobre los Excel.

## Colores del almanaque

Se conservaron los valores RGB de la leyenda:

| Color    | Código    | Significado                                  |
| -------- | --------- | -------------------------------------------- |
| Rojo     | `#FF0000` | Saldo / falta abonar                         |
| Verde    | `#00FF00` | Abonó todo                                   |
| Amarillo | `#FFFF00` | A confirmar                                  |
| Fucsia   | `#FF00FF` | Fondeo                                       |
| Celeste  | `#00FFFF` | Fer y flia                                   |
| Azul     | `#0000FF` | Booking                                      |
| Durazno  | `#FCE5CD` | Datos                                        |
| Naranja  | `#FF9900` | Cena 14, etiqueta que aparece en la planilla |

El modo automático da prioridad a **A confirmar**, después a **Booking**, y luego al saldo global (alojamiento + consumiciones − cobros vigentes). Una etiqueta especial seleccionada explícitamente prevalece sobre el modo automático. La cuenta muestra por separado estado de la reserva, canal, pagos y deuda.

## Reglas de datos y dinero

- Los importes se almacenan como **centavos enteros**. Las fechas de estadía son `YYYY-MM-DD`, sin conversiones de zona horaria. “Hoy” y la fecha de los respaldos usan Argentina/Buenos Aires.
- Ocupación por intervalos **[ingreso, salida)**. El día de salida admite otro ingreso. Las reservas canceladas liberan disponibilidad. Se controlan superposiciones entre reservas y dentro de una misma reserva.
- Crear reservas o consumiciones aumenta cargos; **no registra ingresos de dinero**. Cada cobro crea el pago y su movimiento en una sola transacción.
- Efectivo, transferencias y tarjetas se llevan por separado. El efectivo esperado es apertura + entradas de efectivo − salidas de efectivo. Los otros medios no alteran el efectivo físico.
- Las consumiciones pertenecen a una reserva y a su habitación. Se admite consumo en el día de salida. La reserva siguiente no hereda los consumos anteriores.
- Anular un consumo conserva su historial. Revertir un cobro o movimiento crea una contrapartida en la caja abierta; no modifica un cierre anterior. Los saldos iniciales importados tienen anulación propia, sin afectar caja.
- Los pagos mayores al cargo dejan crédito a favor del huésped. Cancelar una reserva conserva cargos y cobros para ajustar o devolver explícitamente lo que corresponda.
- La versión de cada reserva impide sobrescribir cambios hechos desde otra ventana. Cada formulario de cobro, reserva, consumo o movimiento envía un identificador persistente durante sus reintentos; repetir la misma operación no la duplica.
- Una sola caja abierta a la vez. Las nuevas aperturas deben ser posteriores al último cierre. Esto mantiene el orden de los cierres diarios.

## Datos locales y respaldos

Base predeterminada: `data/san-german.sqlite`. Directorio de copias: `data/backups/`. `SG_DATABASE` permite configurar otra ubicación. Las carpetas de datos están excluidas de Git.

SQLite usa claves foráneas, WAL y migraciones versionadas mediante `PRAGMA user_version`. Cada modificación de negocio es transaccional. El historial conserva cambios y motivos de anulaciones.

Se crea una copia diaria al iniciar la app; si sigue abierta, se comprueba cada hora. Las copias usan `VACUUM INTO`; la restauración valida la integridad y versión, crea un respaldo previo y usa la API de backup de SQLite para reemplazar los datos dentro de una transacción. Durante ese paso se suspenden las peticiones de la aplicación.

Las copias automáticas están en el mismo disco: descargalas o copialas periódicamente a otro dispositivo. Para trasladar los datos, usá una copia de seguridad consistente; no copies únicamente un archivo `.sqlite` en uso omitiendo su WAL.

El acceso está limitado a esta máquina y no se implementó autenticación multiusuario. Para habilitar acceso en red se deberá incorporar autenticación y revisar el esquema de operación. El archivo de base de datos debe permanecer en el disco local del servidor.

## Importación desde los Excel

En esta instalación ya hay **191 registros preparados para revisión** en Datos y respaldos. **No se crearon reservas reales ni movimientos a partir de ellos.**

Para preparar registros desde otra copia:

```powershell
npm run import:excel -- "C:\ruta\Reservas y Caja.xlsx" "C:\ruta\Almanaque.xlsx"
```

El segundo archivo es opcional. El importador lee `RESERVAS` y busca coincidencias exactas de nombre normalizado, ingreso y salida en los comentarios del almanaque para proponer habitaciones, datos y tarifa. Guarda procedencia y datos originales para revisión. No modifica los libros.

`TOTAL COBRADO` **no se interpreta como tarifa de alojamiento**. Las tarifas ausentes, fechas, personas y habitaciones faltantes deben completarse antes de incorporar una reserva. Los cobros históricos solo se incorporan cuando se selecciona explícitamente la opción de saldo inicial, con importes revisables por medio de pago; no generan dinero en caja.

Repetir la importación del mismo archivo y número de reserva no duplica sus candidatos. Se actualizan las propuestas pendientes de revisión y se conservan los registros ya incorporados. Los movimientos históricos de caja, las reservas que existen únicamente en el almanaque y las consumiciones anotadas como texto libre **no se migran automáticamente**. Ese contenido requiere conciliación y carga revisada para no inventar importes o duplicar cargos.

## Verificación

```powershell
npm test
npm run build
```

Las pruebas de integración usan bases y Excel temporales. Cubren persistencia, superposiciones, fechas, cambios de habitación, consumos, medios de pago, arqueos, reversiones, cierres, control de versiones, reintentos, respaldo/restauración, migraciones e importación revisada.

## Estructura

```text
src/       Pantallas React, panel de cuenta, formularios y estilos
server/    API Fastify, reglas, SQLite, auditoría y respaldos
shared/    Tipos, habitaciones, leyenda, importes y fechas
scripts/   Importación revisada de Excel e iniciador local
tests/     Pruebas de integración con datos aislados
dist/      Interfaz compilada (generada)
build/     Servidor compilado (generado)
data/      Base y respaldos locales (no se versionan)
```

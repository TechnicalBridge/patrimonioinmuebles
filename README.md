# Patrimonio Inmuebles

Sitio web de una corredora de propiedades chilena: front en React y API con base de datos SQLite.

Proyecto de Capstone. La empresa, las personas y las propiedades son ficticias.

La base guarda **nombre, apellido, teléfono, correo**, interés, presupuesto, mensajes y el inventario de propiedades.

## Cómo arrancar

En la raíz del proyecto:

```bash
npm install
npm run install:all
npm run dev
```

- Sitio: http://localhost:5173
- API: http://localhost:3001

## Panel interno

- Ruta: http://localhost:5173/admin
- Contraseña: `patrimonio`

Ahí ves clientes, consultas (teléfono y correo) y puedes publicar o quitar propiedades.

## Datos que guarda la base

**Clientes:** nombre, apellido, correo, teléfono, tipo de interés, presupuesto, notas.

**Consultas:** mensaje, origen, propiedad de interés y fecha.

**Asesores:** nombre, apellido, correo, teléfono, cargo y especialidad.

**Propiedades:** título, tipo, operación, precio y moneda, dormitorios, baños, m² útiles y de terreno, dirección, comuna, ciudad, región y fotos.

## Administración de arriendos

Además de vender y publicar, Patrimonio **administra arriendos**: cobra el arriendo mes a mes por cuenta del propietario. Esa es la parte que la convierte en acreedora, y de ahí sale la cartera morosa.

| Tabla | Qué guarda |
| --- | --- |
| `tenants` | El arrendatario, con su **RUT** normalizado. Va aparte de `clients` porque un cliente pregunta por una propiedad y un arrendatario firmó y debe plata |
| `leases` | El contrato. Su `codigo` (`CTR-2025-014`) es el identificador que viaja a la cobranza y permite que un pago vuelva hasta acá |
| `charges` | Un cargo por mes. El `UNIQUE` impide cobrar dos veces el mismo período |
| `charge_payments` | Los pagos, sumados aparte. **El saldo se calcula, no se guarda**, para que no haya dos números que puedan discrepar |
| `collection_batches` | Qué cartera se entregó a cobranza y cuándo |

Dos vistas hacen las cuentas: `v_charge_balance` (saldo de cada cargo) y `v_lease_debt` (deuda por contrato).

Las propiedades en administración quedan con estatus `arrendada`, así que no se publican en el sitio.

**La cartera morosa** se arma con `server/cartera.js` en el formato del contrato de integración, y funciona igual con agencia de cobranza, contra la plataforma de pagos directo, o sin nadie: el módulo devuelve el objeto y quien lo envía decide después.

### En el panel

La pestaña **arriendos** muestra los morosos a la fecha que elijas, con su deuda y sus días de mora, y permite:

- **Generar los cargos del mes.** Correrlo dos veces no cobra dos veces.
- **Registrar un pago** recibido en la oficina, total o parcial.
- **Emitir la cartera** a una fecha de corte. Queda en borrador y se puede descargar como archivo; recién al marcarla como enviada cuenta como entregada.

Un contrato que se puso al día después de haber sido entregado sale en la cartera siguiente como **retiro**, no como deuda. Eso es lo que evita seguir cobrándole a alguien que ya pagó.

### Recibir pagos desde la cobranza

`POST /api/eventos` recibe los avisos de pago y marca los cargos. Pide firma HMAC y **está apagado mientras no definas `EVENTOS_SECRET`**:

```bash
EVENTOS_SECRET=una-clave-larga npm run dev
```

No hay secreto por defecto a propósito: uno escrito en el código no es un secreto. Sin configurarlo, Patrimonio funciona igual y los pagos se registran a mano.

> **Ojo con las llaves foráneas.** `db.export()` de sql.js cierra y reabre la base, lo que apaga el PRAGMA `foreign_keys`. Como acá se persiste después de cada escritura, hay que volver a encenderlo pegado al `export`, si no las llaves foráneas quedan decorativas desde el primer INSERT.

La venta se publica en **UF** y el arriendo residencial en **pesos**; el arriendo comercial se pacta en UF. Por eso cada propiedad guarda su moneda.

El archivo de la base queda en `server/patrimonio.db` la primera vez que arranca el servidor. El esquema se crea con `CREATE TABLE IF NOT EXISTS`, así que **un cambio de columnas no se aplica sobre una base existente**: hay que borrar `server/patrimonio.db` y dejar que el servidor la regenere con los datos de demostración.

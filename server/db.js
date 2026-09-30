import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { seedIfEmpty, sembrarAdministrador } from './seed.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// PATRIMONIO_DB permite otra base: las pruebas usan un archivo temporal para
// no borrar la de desarrollo cada vez que corren.
const DB_PATH = process.env.PATRIMONIO_DB || path.join(__dirname, 'patrimonio.db');

let db;

// sql.js cierra y reabre la base para exportarla, y al reabrirla los PRAGMA
// vuelven a su valor por defecto: foreign_keys queda APAGADO. Como aca se
// persiste despues de cada escritura, encenderlo una sola vez al arrancar
// dejaria las llaves foraneas decorativas desde el primer INSERT. Por eso se
// vuelve a encender aca, pegado al export.
function encenderLlavesForaneas() {
  db.run('PRAGMA foreign_keys = ON');
}

function persist() {
  const data = db.export();
  encenderLlavesForaneas();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function agregarColumna(tabla, columna, tipo) {
  const columnas = db.exec(`PRAGMA table_info(${tabla})`)[0]?.values.map((fila) => fila[1]) ?? [];
  if (!columnas.includes(columna)) db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
}

// ===========================================================================
//  VERSION 1 — el esquema inicial, tal como estaba antes del versionado
// ===========================================================================

function esquemaV1() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      apellido TEXT NOT NULL,
      correo TEXT NOT NULL UNIQUE,
      telefono TEXT NOT NULL,
      cargo TEXT,
      especialidad TEXT,
      bio TEXT
    );

    CREATE TABLE IF NOT EXISTS properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      titulo TEXT NOT NULL,
      slug TEXT UNIQUE,
      descripcion TEXT,
      tipo TEXT NOT NULL,
      operacion TEXT NOT NULL,
      precio REAL NOT NULL,
      -- En Chile la venta se publica en UF y el arriendo residencial en pesos.
      moneda TEXT NOT NULL DEFAULT 'UF' CHECK (moneda IN ('UF', 'CLP')),
      dormitorios INTEGER DEFAULT 0,
      banos REAL DEFAULT 0,
      estacionamientos INTEGER DEFAULT 0,
      m2_utiles REAL DEFAULT 0,
      m2_terreno REAL DEFAULT 0,
      direccion TEXT,
      comuna TEXT,
      ciudad TEXT,
      region TEXT,
      equipamiento TEXT,
      imagenes TEXT,
      destacado INTEGER DEFAULT 0,
      -- 'arrendada' es una propiedad en administracion: tiene contrato vigente
      -- y por eso no se publica en el sitio.
      estatus TEXT NOT NULL DEFAULT 'disponible'
        CHECK (estatus IN ('disponible', 'reservada', 'arrendada', 'vendida')),
      agent_id INTEGER REFERENCES agents(id) ON DELETE SET NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      apellido TEXT,
      correo TEXT NOT NULL,
      telefono TEXT NOT NULL,
      tipo_interes TEXT,
      presupuesto TEXT,
      notas TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      -- Borrar un cliente se lleva sus consultas; borrar una propiedad solo
      -- deja la consulta sin propiedad, porque la consulta sigue siendo un
      -- dato comercial valido.
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
      property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
      mensaje TEXT,
      origen TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // =========================================================================
  //  ADMINISTRACION DE ARRIENDOS
  //
  //  Esta es la parte que convierte a Patrimonio en acreedor: cobra el
  //  arriendo mes a mes por cuenta del propietario, y el arrendatario que se
  //  atrasa es su cartera morosa. Sin estas tablas no hay nada que entregarle
  //  a APOFYX.
  //
  //  Los nombres de tabla van en ingles y las columnas en espanol, que es la
  //  convencion que ya traian agents, properties, clients e inquiries.
  // =========================================================================
  db.exec(`
    -- El arrendatario. Se separa de 'clients' a proposito: un cliente es
    -- alguien que pregunta por una propiedad, un arrendatario es alguien que
    -- firmo y debe plata. Mezclarlos haria que un interesado y un deudor
    -- vivieran en la misma tabla.
    CREATE TABLE IF NOT EXISTS tenants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      -- Normalizado, sin puntos y con guion: 16482337-7. Es la llave con la
      -- que esta persona se identifica fuera de Patrimonio, asi que el
      -- formato lo obliga la base.
      -- GLOB no tiene alternancia, asi que los dos largos de RUT van escritos
      -- uno al lado del otro: 7 digitos u 8, guion, y digito verificador.
      rut TEXT NOT NULL UNIQUE CHECK (
        rut GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9K]' OR
        rut GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9K]'
      ),
      tipo TEXT NOT NULL DEFAULT 'persona' CHECK (tipo IN ('persona', 'empresa')),
      nombre TEXT NOT NULL,
      correo TEXT,
      telefono TEXT,
      notas TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      -- Sin correo ni telefono no hay por donde cobrarle, y el contrato de
      -- integracion lo rechazaria con 'sin_canal_contacto'. Mejor no dejarlo
      -- entrar.
      CHECK (correo IS NOT NULL OR telefono IS NOT NULL)
    );

    -- El contrato de arriendo. Su 'codigo' es el que viaja a APOFYX y a
    -- DataBridge como id_externo de la deuda, y por eso es unico y no se
    -- reutiliza: es lo que permite que un pago vuelva hasta aca.
    CREATE TABLE IF NOT EXISTS leases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
      tenant_id INTEGER NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
      -- Lo que el arrendatario lee primero en el portal de pago.
      concepto TEXT NOT NULL DEFAULT 'Arriendo mensual',
      fecha_inicio TEXT NOT NULL CHECK (
        fecha_inicio GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      ),
      fecha_termino TEXT,
      renta_monto REAL NOT NULL CHECK (renta_monto > 0),
      -- El arriendo de vivienda se pacta en pesos y el comercial en UF.
      moneda TEXT NOT NULL DEFAULT 'CLP' CHECK (moneda IN ('CLP', 'UF')),
      dia_vencimiento INTEGER NOT NULL DEFAULT 5
        CHECK (dia_vencimiento BETWEEN 1 AND 28),
      estado TEXT NOT NULL DEFAULT 'vigente'
        CHECK (estado IN ('vigente', 'terminado')),
      created_at TEXT DEFAULT (datetime('now')),
      CHECK (fecha_termino IS NULL OR fecha_termino >= fecha_inicio)
    );

    -- Un cargo es un mes de arriendo. El UNIQUE es lo que hace que generar
    -- los cargos del mes dos veces no cobre dos veces.
    CREATE TABLE IF NOT EXISTS charges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE CASCADE,
      concepto TEXT NOT NULL,
      -- La forma no basta: '[0-1][0-9]' deja pasar el mes 13. El GLOB revisa
      -- la forma y el CAST revisa que el mes exista de verdad.
      periodo TEXT NOT NULL CHECK (
        periodo GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'
        AND CAST(substr(periodo, 6, 2) AS INTEGER) BETWEEN 1 AND 12
      ),
      monto REAL NOT NULL CHECK (monto > 0),
      fecha_vencimiento TEXT NOT NULL CHECK (
        fecha_vencimiento GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      ),
      -- Anular no borra: un cargo emitido y despues perdonado es historia.
      anulado_en TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (lease_id, periodo, concepto)
    );

    -- Los pagos no se restan del cargo: se suman aparte. Guardar un saldo
    -- ademas de los pagos abre la puerta a que los dos numeros dejen de
    -- calzar; el saldo se calcula (ver la vista de mas abajo).
    CREATE TABLE IF NOT EXISTS charge_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      charge_id INTEGER NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
      monto REAL NOT NULL CHECK (monto > 0),
      medio TEXT NOT NULL
        CHECK (medio IN ('transferencia', 'efectivo', 'databridge')),
      pagado_en TEXT NOT NULL,
      -- Id del pago en DataBridge cuando llega por evento. El UNIQUE hace que
      -- un evento repetido no abone dos veces: en SQLite los NULL no chocan
      -- entre si, asi que los pagos de oficina no lo necesitan.
      referencia TEXT UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Que se le mando a APOFYX y cuando. Sin esto no se puede reenviar sin
    -- duplicar, ni saber que contratos ya estan en cobranza.
    CREATE TABLE IF NOT EXISTS collection_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_externo TEXT NOT NULL UNIQUE,
      fecha_corte TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'borrador'
        CHECK (estado IN ('borrador', 'enviado', 'aceptado', 'rechazado')),
      enviado_en TEXT,
      respuesta TEXT,
      -- La cartera tal como se emitio: es la que se envia y la que se descarga.
      cartera TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Eventos que llegan de la cobranza (pagos, repactaciones). El contrato
    -- entrega "al menos una vez": el mismo evento puede llegar dos veces, y
    -- esta tabla es la que hace que la segunda no vuelva a abonar.
    CREATE TABLE IF NOT EXISTS inbound_events (
      id TEXT PRIMARY KEY,
      tipo TEXT NOT NULL,
      ocurrido_en TEXT,
      recibido_en TEXT NOT NULL DEFAULT (datetime('now')),
      cuerpo TEXT NOT NULL,
      resultado TEXT
    );

    CREATE TABLE IF NOT EXISTS collection_batch_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL REFERENCES collection_batches(id) ON DELETE CASCADE,
      lease_id INTEGER NOT NULL REFERENCES leases(id) ON DELETE RESTRICT,
      accion TEXT NOT NULL DEFAULT 'registrar'
        CHECK (accion IN ('registrar', 'retirar')),
      motivo_retiro TEXT,
      monto_enviado REAL NOT NULL,
      moneda TEXT NOT NULL CHECK (moneda IN ('CLP', 'UF')),
      resultado TEXT,
      UNIQUE (batch_id, lease_id),
      CHECK (accion = 'registrar' OR motivo_retiro IS NOT NULL)
    );
  `);

  // Lo que se le agrego a una tabla despues de crearla: una base que ya
  // existia no lo tiene, y CREATE TABLE IF NOT EXISTS no lo agrega.
  agregarColumna('collection_batches', 'cartera', 'TEXT');

  // Vistas: el saldo de un cargo y la deuda de un contrato se calculan, no se
  // guardan. Asi no hay dos numeros que puedan discrepar.
  db.exec(`
    CREATE VIEW IF NOT EXISTS v_charge_balance AS
    SELECT
      c.id, c.lease_id, c.concepto, c.periodo, c.monto, c.fecha_vencimiento,
      c.anulado_en,
      COALESCE((SELECT SUM(p.monto) FROM charge_payments p WHERE p.charge_id = c.id), 0) AS pagado,
      c.monto - COALESCE((SELECT SUM(p.monto) FROM charge_payments p WHERE p.charge_id = c.id), 0) AS saldo
    FROM charges c;

    -- Un moroso es un contrato con al menos un cargo vencido e impago. La
    -- vista no filtra por fecha: eso lo hace quien consulta, con su fecha de
    -- corte, porque la cartera se arma a una fecha determinada.
    CREATE VIEW IF NOT EXISTS v_lease_debt AS
    SELECT
      l.id AS lease_id, l.codigo, l.moneda, l.concepto,
      t.rut, t.nombre AS arrendatario,
      COUNT(b.id) AS cargos_impagos,
      SUM(b.saldo) AS deuda,
      MIN(b.fecha_vencimiento) AS vencimiento_mas_antiguo
    FROM leases l
    JOIN tenants t ON t.id = l.tenant_id
    JOIN v_charge_balance b ON b.lease_id = l.id
    WHERE b.anulado_en IS NULL AND b.saldo > 0
    GROUP BY l.id, l.codigo, l.moneda, l.concepto, t.rut, t.nombre;
  `);
}

// ===========================================================================
//  VERSION 2 — clientes unificados, usuarios, sesiones y cobranza generica
//
//  - Un solo cliente. El interesado que pregunta por una propiedad y el
//    arrendatario que firmo son la misma persona en otra etapa: 'tenants' se
//    funde en 'clients', y el contrato apunta al cliente. El RUT pasa a
//    'clients' (opcional: un interesado no lo necesita), y un trigger impide
//    firmar un contrato con un cliente sin RUT.
//  - Usuarios con clave y sesiones guardadas en la base, en vez de una clave
//    unica y sesiones en memoria que se perdian al reiniciar.
//  - La conexion con la agencia de cobranza, en la base y no en variables de
//    entorno: se configura desde el panel, con cualquier agencia que hable el
//    contrato de integracion.
//  - 'cobranza' en vez de 'databridge' como medio de pago: Patrimonio no sabe
//    ni tiene por que saber que plataforma cobro.
//  - 'parcial' para un lote que la agencia acepto en parte, en vez de reusar
//    'enviado' para dos cosas.
//
//  SQLite no cambia un CHECK ni una llave foranea con ALTER TABLE: esas tablas
//  se reconstruyen (crear la nueva, copiar, borrar la vieja, renombrar), con
//  las llaves foraneas apagadas mientras tanto y revisadas al final.
// ===========================================================================

const RUT_VALIDO = `rut GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9K]' OR
        rut GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9K]'`;

function aV2() {
  db.exec('PRAGMA foreign_keys = OFF');
  try {
    db.exec(ESQUEMA_V2);
  } catch (error) {
    //  A medio camino la base quedaria sin clientes ni contratos: se deshace.
    try { db.exec('ROLLBACK'); } catch { /* ya no habia transaccion */ }
    throw error;
  }
  const rotas = db.exec('PRAGMA foreign_key_check');
  if (rotas.length) {
    throw new Error(`La migracion a la version 2 dejo llaves foraneas rotas: ${JSON.stringify(rotas[0].values)}`);
  }
  encenderLlavesForaneas();
}

const ESQUEMA_V2 = `
    BEGIN;

    -- Las vistas nombran tablas que se van a reconstruir: se rehacen al final.
    DROP VIEW IF EXISTS v_lease_debt;
    DROP VIEW IF EXISTS v_charge_balance;

    -- ---- Un solo cliente --------------------------------------------------
    CREATE TABLE clients_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT NOT NULL DEFAULT 'persona' CHECK (tipo IN ('persona', 'empresa')),
      -- Normalizado, sin puntos y con guion: 16482337-7. Es la llave con la
      -- que el cliente se identifica fuera de Patrimonio. Opcional hasta que
      -- firma un contrato (ver el trigger contrato_con_rut).
      rut TEXT UNIQUE CHECK (rut IS NULL OR ${RUT_VALIDO}),
      nombre TEXT NOT NULL,
      apellido TEXT,
      correo TEXT,
      telefono TEXT,
      tipo_interes TEXT,
      presupuesto TEXT,
      notas TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      -- Sin correo ni telefono no hay por donde contactarlo, ni cobrarle.
      CHECK (correo IS NOT NULL OR telefono IS NOT NULL)
    );
    INSERT INTO clients_v2 (id, tipo, rut, nombre, apellido, correo, telefono,
                            tipo_interes, presupuesto, notas, created_at)
      SELECT id, 'persona', NULL, nombre, apellido, correo, telefono,
             tipo_interes, presupuesto, notas, created_at
        FROM clients;
    INSERT INTO clients_v2 (tipo, rut, nombre, correo, telefono, notas, created_at)
      SELECT tipo, rut, nombre, correo, telefono, notas, created_at FROM tenants;

    CREATE TABLE leases_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE RESTRICT,
      client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
      concepto TEXT NOT NULL DEFAULT 'Arriendo mensual',
      fecha_inicio TEXT NOT NULL CHECK (
        fecha_inicio GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      ),
      fecha_termino TEXT,
      renta_monto REAL NOT NULL CHECK (renta_monto > 0),
      moneda TEXT NOT NULL DEFAULT 'CLP' CHECK (moneda IN ('CLP', 'UF')),
      dia_vencimiento INTEGER NOT NULL DEFAULT 5
        CHECK (dia_vencimiento BETWEEN 1 AND 28),
      estado TEXT NOT NULL DEFAULT 'vigente'
        CHECK (estado IN ('vigente', 'terminado')),
      created_at TEXT DEFAULT (datetime('now')),
      CHECK (fecha_termino IS NULL OR fecha_termino >= fecha_inicio)
    );
    INSERT INTO leases_v2 (id, codigo, property_id, client_id, concepto, fecha_inicio,
                           fecha_termino, renta_monto, moneda, dia_vencimiento, estado, created_at)
      SELECT l.id, l.codigo, l.property_id, c.id, l.concepto, l.fecha_inicio,
             l.fecha_termino, l.renta_monto, l.moneda, l.dia_vencimiento, l.estado, l.created_at
        FROM leases l
        JOIN tenants t ON t.id = l.tenant_id
        JOIN clients_v2 c ON c.rut = t.rut;

    DROP TABLE leases;
    DROP TABLE tenants;
    DROP TABLE clients;
    ALTER TABLE clients_v2 RENAME TO clients;
    ALTER TABLE leases_v2 RENAME TO leases;

    -- ---- Pagos: la cobranza, sin nombrar a la plataforma ------------------
    CREATE TABLE charge_payments_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      charge_id INTEGER NOT NULL REFERENCES charges(id) ON DELETE CASCADE,
      monto REAL NOT NULL CHECK (monto > 0),
      -- 'cobranza': llego por el aviso de la agencia, sea cual sea la
      -- plataforma donde pago el arrendatario.
      medio TEXT NOT NULL CHECK (medio IN ('transferencia', 'efectivo', 'cobranza')),
      pagado_en TEXT NOT NULL,
      -- Id del pago en la cobranza cuando llega por aviso. El UNIQUE hace que
      -- un aviso repetido no abone dos veces.
      referencia TEXT UNIQUE,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO charge_payments_v2 (id, charge_id, monto, medio, pagado_en, referencia, created_at)
      SELECT id, charge_id, monto, CASE medio WHEN 'databridge' THEN 'cobranza' ELSE medio END,
             pagado_en, referencia, created_at
        FROM charge_payments;
    DROP TABLE charge_payments;
    ALTER TABLE charge_payments_v2 RENAME TO charge_payments;

    -- ---- Lotes: 'parcial' cuando la agencia acepta una parte -------------
    CREATE TABLE collection_batches_v2 (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_externo TEXT NOT NULL UNIQUE,
      fecha_corte TEXT NOT NULL,
      estado TEXT NOT NULL DEFAULT 'borrador'
        CHECK (estado IN ('borrador', 'enviado', 'aceptado', 'parcial', 'rechazado')),
      enviado_en TEXT,
      respuesta TEXT,
      -- La cartera tal como se emitio: es la que se envia y la que se descarga.
      cartera TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    INSERT INTO collection_batches_v2 (id, id_externo, fecha_corte, estado, enviado_en,
                                       respuesta, cartera, created_at)
      SELECT id, id_externo, fecha_corte, estado, enviado_en, respuesta, cartera, created_at
        FROM collection_batches;
    DROP TABLE collection_batches;
    ALTER TABLE collection_batches_v2 RENAME TO collection_batches;

    -- ---- Contratos solo con clientes identificados -----------------------
    CREATE TRIGGER contrato_con_rut BEFORE INSERT ON leases
    WHEN (SELECT rut FROM clients WHERE id = NEW.client_id) IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'Para firmar un contrato el cliente necesita RUT');
    END;
    CREATE TRIGGER contrato_con_rut_al_cambiar BEFORE UPDATE OF client_id ON leases
    WHEN (SELECT rut FROM clients WHERE id = NEW.client_id) IS NULL
    BEGIN
      SELECT RAISE(ABORT, 'Para firmar un contrato el cliente necesita RUT');
    END;
    CREATE TRIGGER arrendatario_conserva_rut BEFORE UPDATE OF rut ON clients
    WHEN NEW.rut IS NULL AND EXISTS (SELECT 1 FROM leases WHERE client_id = NEW.id)
    BEGIN
      SELECT RAISE(ABORT, 'Un cliente con contrato no puede quedar sin RUT');
    END;

    -- ---- Usuarios y sesiones ---------------------------------------------
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      correo TEXT NOT NULL UNIQUE COLLATE NOCASE,
      nombre TEXT NOT NULL,
      -- scrypt con sal propia: 'scrypt$<sal>$<huella>'. La clave no se guarda.
      clave_hash TEXT NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Una sesion por inicio. Se guarda la huella del token, no el token: quien
    -- lea la base no puede entrar con lo que ve.
    CREATE TABLE sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      creada_en TEXT NOT NULL DEFAULT (datetime('now')),
      expira_en TEXT NOT NULL,
      revocada_en TEXT
    );
    CREATE INDEX ix_sessions_user ON sessions(user_id);

    -- ---- La agencia de cobranza ------------------------------------------
    -- Una sola fila (id = 1). La llena el panel al conectar: la direccion y la
    -- clave que la agencia le emitio a Patrimonio, y el secreto con que firma
    -- sus avisos. El nombre sale de la agencia misma: Patrimonio no tiene el
    -- de nadie escrito en el codigo.
    CREATE TABLE agency_connection (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      nombre TEXT NOT NULL,
      rut TEXT,
      url TEXT NOT NULL,
      clave TEXT NOT NULL,
      url_avisos TEXT NOT NULL,
      secreto_eventos TEXT,
      conectada_en TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- ---- Vistas ----------------------------------------------------------
    -- El saldo de un cargo y la deuda de un contrato se calculan, no se
    -- guardan: asi no hay dos numeros que puedan discrepar.
    CREATE VIEW v_charge_balance AS
    SELECT c.id, c.lease_id, c.concepto, c.periodo, c.monto, c.fecha_vencimiento, c.anulado_en,
           COALESCE(p.pagado, 0) AS pagado,
           c.monto - COALESCE(p.pagado, 0) AS saldo
      FROM charges c
      LEFT JOIN (SELECT charge_id, SUM(monto) AS pagado FROM charge_payments GROUP BY charge_id) p
        ON p.charge_id = c.id;

    -- Un moroso es un contrato con al menos un cargo vencido e impago. La
    -- vista no filtra por fecha: eso lo hace quien consulta, con su corte.
    CREATE VIEW v_lease_debt AS
    SELECT l.id AS lease_id, l.codigo, l.moneda, l.concepto,
           c.rut, c.nombre AS arrendatario,
           COUNT(b.id) AS cargos_impagos,
           SUM(b.saldo) AS deuda,
           MIN(b.fecha_vencimiento) AS vencimiento_mas_antiguo
      FROM leases l
      JOIN clients c ON c.id = l.client_id
      JOIN v_charge_balance b ON b.lease_id = l.id
     WHERE b.anulado_en IS NULL AND b.saldo > 0
     GROUP BY l.id, l.codigo, l.moneda, l.concepto, c.rut, c.nombre;

    COMMIT;
`;

// Cada cambio del esquema es una version. La base guarda la suya en
// PRAGMA user_version y al arrancar se aplican solo las que le faltan, en
// orden. Una base anterior al versionado tiene 0: la version 1 es el esquema de
// siempre, escrito con IF NOT EXISTS, y no le hace nada.
const MIGRACIONES = [
  [1, esquemaV1],
  [2, aV2],
];
export const VERSION = MIGRACIONES.at(-1)[0];

export function versionDeLaBase() {
  return db.exec('PRAGMA user_version')[0].values[0][0];
}

export function migrar(hasta = VERSION) {
  for (const [numero, aplicar] of MIGRACIONES) {
    if (numero <= versionDeLaBase() || numero > hasta) continue;
    aplicar();
    db.exec(`PRAGMA user_version = ${numero}`);
  }
  persist();
}

export function all(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

export function run(sql, params = []) {
  db.run(sql, params);
  const result = db.exec('SELECT last_insert_rowid() AS id');
  const id = result[0]?.values?.[0]?.[0] ?? null;
  persist();
  return id;
}

export function parseJson(value, fallback) {
  try {
    return JSON.parse(value || '');
  } catch {
    return fallback;
  }
}

export function hydrateProperty(row) {
  if (!row) return null;
  const agent = row.agent_id
    ? {
        id: row.agent_id,
        nombre: row.agent_nombre,
        apellido: row.agent_apellido,
        correo: row.agent_correo,
        telefono: row.agent_telefono,
        cargo: row.agent_cargo,
        especialidad: row.agent_especialidad,
      }
    : null;

  return {
    id: row.id,
    titulo: row.titulo,
    slug: row.slug,
    descripcion: row.descripcion,
    tipo: row.tipo,
    operacion: row.operacion,
    precio: row.precio,
    moneda: row.moneda,
    dormitorios: row.dormitorios,
    banos: row.banos,
    estacionamientos: row.estacionamientos,
    m2_utiles: row.m2_utiles,
    m2_terreno: row.m2_terreno,
    direccion: row.direccion,
    comuna: row.comuna,
    ciudad: row.ciudad,
    region: row.region,
    equipamiento: parseJson(row.equipamiento, []),
    imagenes: parseJson(row.imagenes, []),
    destacado: Boolean(row.destacado),
    estatus: row.estatus,
    agent_id: row.agent_id,
    created_at: row.created_at,
    agent,
  };
}

const PROPERTY_SELECT = `
  SELECT p.*,
    a.nombre AS agent_nombre,
    a.apellido AS agent_apellido,
    a.correo AS agent_correo,
    a.telefono AS agent_telefono,
    a.cargo AS agent_cargo,
    a.especialidad AS agent_especialidad
  FROM properties p
  LEFT JOIN agents a ON a.id = p.agent_id
`;

export function listProperties(filters = {}) {
  const where = [];
  const params = [];

  if (filters.q) {
    where.push(
      '(p.titulo LIKE ? OR p.comuna LIKE ? OR p.ciudad LIKE ? OR p.descripcion LIKE ?)'
    );
    const like = `%${filters.q}%`;
    params.push(like, like, like, like);
  }
  if (filters.tipo) {
    where.push('p.tipo = ?');
    params.push(filters.tipo);
  }
  if (filters.operacion) {
    where.push('p.operacion = ?');
    params.push(filters.operacion);
  }
  if (filters.comuna) {
    where.push('p.comuna = ?');
    params.push(filters.comuna);
  }
  if (filters.estatus) {
    where.push('p.estatus = ?');
    params.push(filters.estatus);
  }
  if (filters.destacado) {
    where.push('p.destacado = 1');
  }
  if (filters.dormitorios) {
    where.push('p.dormitorios >= ?');
    params.push(Number(filters.dormitorios));
  }
  // Un rango de precio solo tiene sentido dentro de una misma moneda:
  // comparar UF contra pesos daria resultados sin sentido.
  if (filters.moneda) {
    where.push('p.moneda = ?');
    params.push(filters.moneda);
  }
  if (filters.minPrecio) {
    where.push('p.precio >= ?');
    params.push(Number(filters.minPrecio));
  }
  if (filters.maxPrecio) {
    where.push('p.precio <= ?');
    params.push(Number(filters.maxPrecio));
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = all(
    `${PROPERTY_SELECT} ${clause} ORDER BY p.destacado DESC, p.precio DESC`,
    params
  );
  return rows.map(hydrateProperty);
}

export function getProperty(id) {
  return hydrateProperty(get(`${PROPERTY_SELECT} WHERE p.id = ?`, [Number(id)]));
}

/**
 * Abre la base, la lleva a la ultima version y la siembra.
 *
 * `hasta` y `sembrar` son para las pruebas de la migracion: dejan una base en
 * una version anterior y sin datos de demostracion.
 */
export async function initDb({ hasta = VERSION, sembrar = true } = {}) {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  encenderLlavesForaneas();
  migrar(hasta);
  if (sembrar) {
    seedIfEmpty({ all, get, run });
    sembrarAdministrador({ get, run });
  }
  return db;
}

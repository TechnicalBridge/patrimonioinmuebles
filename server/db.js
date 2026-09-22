import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { seedIfEmpty } from './seed.js';

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

function migrate() {
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

export async function initDb() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }
  encenderLlavesForaneas();
  migrate();
  persist();
  seedIfEmpty({ all, get, run });
  return db;
}

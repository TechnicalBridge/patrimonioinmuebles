import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  initDb,
  all,
  get,
  run,
  listProperties,
  getProperty,
} from './db.js';
import {
  cargosDeContrato,
  emitirLote,
  generarCargosDelMes,
  hoy,
  listarContratos,
  listarLotes,
  listarMorosos,
  marcarLoteEnviado,
  previsualizarCartera,
  procesarEvento,
  registrarPago,
  verLote,
} from './arriendos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'patrimonio';
const sessions = new Set();

const app = express();
app.use(cors());
// Se guarda el cuerpo crudo porque la firma de los eventos se calcula sobre el
// texto exacto que llego: volver a serializar el objeto cambia los espacios y
// el orden, y la firma dejaria de calzar.
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function digits(value) {
  return String(value || '').replace(/\D/g, '');
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, name: 'Patrimonio Inmuebles' });
});

app.get('/api/properties', (req, res) => {
  const rows = listProperties({
    q: req.query.q,
    tipo: req.query.tipo,
    operacion: req.query.operacion,
    comuna: req.query.comuna,
    estatus: req.query.all ? '' : req.query.estatus || 'disponible',
    destacado: req.query.destacado,
    dormitorios: req.query.dormitorios,
    moneda: req.query.moneda,
    minPrecio: req.query.minPrecio,
    maxPrecio: req.query.maxPrecio,
  });
  res.json(rows);
});

app.get('/api/properties/:id', (req, res) => {
  const property = getProperty(req.params.id);
  if (!property) return res.status(404).json({ error: 'Propiedad no encontrada' });
  res.json(property);
});

app.get('/api/agents', (_req, res) => {
  res.json(all('SELECT * FROM agents ORDER BY id'));
});

app.get('/api/stats', (_req, res) => {
  const properties = get('SELECT COUNT(*) AS n FROM properties WHERE estatus = ?', [
    'disponible',
  ]);
  const clients = get('SELECT COUNT(*) AS n FROM clients');
  // Solo lo publicado: las propiedades en administracion estan 'arrendada' y
  // no deben aparecer en los filtros del sitio.
  const cities = all(
    "SELECT DISTINCT ciudad FROM properties WHERE estatus = 'disponible' ORDER BY ciudad"
  );
  const comunas = all(
    "SELECT DISTINCT comuna FROM properties WHERE estatus = 'disponible' ORDER BY comuna"
  );
  res.json({
    propiedades: properties?.n || 0,
    clientes: clients?.n || 0,
    ciudades: cities.map((c) => c.ciudad),
    comunas: comunas.map((c) => c.comuna),
    anios: 18,
    asesores: 4,
  });
});

app.post('/api/inquiries', (req, res) => {
  const {
    nombre,
    apellido = '',
    correo,
    telefono,
    tipo_interes = 'asesoria',
    presupuesto = '',
    mensaje = '',
    property_id = null,
    origen = 'web',
  } = req.body || {};

  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: 'El nombre es obligatorio' });
  }
  if (!isEmail(correo)) {
    return res.status(400).json({ error: 'El correo no es válido' });
  }
  if (digits(telefono).length < 8) {
    return res.status(400).json({ error: 'El teléfono debe tener al menos 8 dígitos' });
  }

  let client = get('SELECT * FROM clients WHERE lower(correo) = lower(?)', [
    String(correo).trim(),
  ]);

  if (client) {
    run(
      `UPDATE clients
       SET nombre = ?, apellido = ?, telefono = ?, tipo_interes = ?, presupuesto = ?
       WHERE id = ?`,
      [
        String(nombre).trim(),
        String(apellido).trim(),
        String(telefono).trim(),
        tipo_interes,
        presupuesto,
        client.id,
      ]
    );
  } else {
    const id = run(
      `INSERT INTO clients (nombre, apellido, correo, telefono, tipo_interes, presupuesto)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        String(nombre).trim(),
        String(apellido).trim(),
        String(correo).trim().toLowerCase(),
        String(telefono).trim(),
        tipo_interes,
        presupuesto,
      ]
    );
    client = { id };
  }

  const inquiryId = run(
    `INSERT INTO inquiries (client_id, property_id, mensaje, origen)
     VALUES (?, ?, ?, ?)`,
    [client.id, property_id ? Number(property_id) : null, String(mensaje).trim(), origen]
  );

  res.status(201).json({
    ok: true,
    inquiry_id: inquiryId,
    message: 'Recibimos tus datos. Un asesor te contactará pronto.',
  });
});

app.post('/api/admin/login', (req, res) => {
  const password = req.body?.password || '';
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  sessions.add(token);
  res.json({ token });
});

app.get('/api/admin/clients', requireAdmin, (_req, res) => {
  const rows = all(`
    SELECT c.*,
      (SELECT COUNT(*) FROM inquiries i WHERE i.client_id = c.id) AS consultas
    FROM clients c
    ORDER BY c.created_at DESC
  `);
  res.json(rows);
});

app.get('/api/admin/inquiries', requireAdmin, (_req, res) => {
  const rows = all(`
    SELECT i.id, i.mensaje, i.origen, i.created_at, i.property_id,
      c.id AS client_id, c.nombre, c.apellido, c.correo, c.telefono, c.tipo_interes, c.presupuesto,
      p.titulo AS property_titulo
    FROM inquiries i
    JOIN clients c ON c.id = i.client_id
    LEFT JOIN properties p ON p.id = i.property_id
    ORDER BY i.created_at DESC
  `);
  res.json(rows);
});

app.post('/api/admin/properties', requireAdmin, (req, res) => {
  const p = req.body || {};
  if (!p.titulo || !p.tipo || !p.operacion || p.precio == null) {
    return res.status(400).json({ error: 'Faltan datos de la propiedad' });
  }
  const slug =
    p.slug ||
    String(p.titulo)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');

  const moneda = p.moneda || (p.operacion === 'arriendo' ? 'CLP' : 'UF');
  if (!['UF', 'CLP'].includes(moneda)) {
    return res.status(400).json({ error: 'La moneda debe ser UF o CLP' });
  }

  const id = run(
    `INSERT INTO properties (
      titulo, slug, descripcion, tipo, operacion, precio, moneda, dormitorios, banos,
      estacionamientos, m2_utiles, m2_terreno, direccion, comuna, ciudad,
      region, equipamiento, imagenes, destacado, estatus, agent_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      p.titulo,
      slug,
      p.descripcion || '',
      p.tipo,
      p.operacion,
      Number(p.precio),
      moneda,
      Number(p.dormitorios || 0),
      Number(p.banos || 0),
      Number(p.estacionamientos || 0),
      Number(p.m2_utiles || 0),
      Number(p.m2_terreno || 0),
      p.direccion || '',
      p.comuna || '',
      p.ciudad || '',
      p.region || '',
      JSON.stringify(p.equipamiento || []),
      JSON.stringify(p.imagenes || []),
      p.destacado ? 1 : 0,
      p.estatus || 'disponible',
      p.agent_id || null,
    ]
  );
  res.status(201).json(getProperty(id));
});

app.delete('/api/admin/properties/:id', requireAdmin, (req, res) => {
  run('DELETE FROM properties WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

// ===========================================================================
//  Administracion de arriendos
//
//  Los handlers solo traducen HTTP; las reglas viven en arriendos.js. Los
//  errores de dominio traen su propio codigo en err.status.
// ===========================================================================

const manejar = (fn) => (req, res) => {
  try {
    res.json(fn(req));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
};

app.get('/api/admin/arriendos/contratos', requireAdmin, manejar(() => listarContratos()));

app.get('/api/admin/arriendos/contratos/:id/cargos', requireAdmin,
  manejar((req) => cargosDeContrato(Number(req.params.id))));

app.get('/api/admin/arriendos/morosos', requireAdmin,
  manejar((req) => listarMorosos(req.query.corte || hoy())));

app.post('/api/admin/arriendos/cargos', requireAdmin,
  manejar((req) => generarCargosDelMes(req.body?.periodo)));

app.post('/api/admin/arriendos/pagos', requireAdmin,
  manejar((req) => registrarPago(req.body || {})));

app.get('/api/admin/arriendos/cartera', requireAdmin,
  manejar((req) => previsualizarCartera(req.query.corte || hoy())));

app.get('/api/admin/arriendos/lotes', requireAdmin, manejar(() => listarLotes()));

app.post('/api/admin/arriendos/lotes', requireAdmin,
  manejar((req) => emitirLote(req.body?.corte || hoy())));

app.post('/api/admin/arriendos/lotes/:id/enviado', requireAdmin,
  manejar((req) => marcarLoteEnviado(req.params.id)));

// La cartera como archivo, para el modo sin integracion: se descarga y se
// entrega a mano.
app.get('/api/admin/arriendos/lotes/:id/archivo', requireAdmin, (req, res) => {
  try {
    const lote = verLote(req.params.id);
    const cartera = previsualizarCartera(lote.fecha_corte);
    cartera.lote.id_externo = lote.id_externo;
    res.setHeader('Content-Disposition', `attachment; filename="${lote.id_externo}.json"`);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.send(JSON.stringify(cartera, null, 2));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ===========================================================================
//  Eventos de la cobranza (Eventos v1)
//
//  Sin EVENTOS_SECRET configurado el receptor queda apagado, y Patrimonio
//  sigue funcionando sin cobranza externa. No hay secreto por defecto a
//  proposito: uno escrito en el codigo no es un secreto.
// ===========================================================================

const EVENTOS_SECRET = process.env.EVENTOS_SECRET || '';
const MAX_DESFASE_SEGUNDOS = 300;

function firmaValida(req) {
  const firma = String(req.headers['x-firma'] || '');
  const marca = Number(req.headers['x-timestamp']);
  if (!firma.startsWith('v1=') || !Number.isFinite(marca)) return false;
  if (Math.abs(Date.now() / 1000 - marca) > MAX_DESFASE_SEGUNDOS) return false;

  const esperada = crypto
    .createHmac('sha256', EVENTOS_SECRET)
    .update(`${marca}.${req.rawBody?.toString('utf8') ?? ''}`)
    .digest('hex');
  const recibida = firma.slice(3);
  // timingSafeEqual exige el mismo largo y revienta si no lo es.
  if (recibida.length !== esperada.length) return false;
  return crypto.timingSafeEqual(Buffer.from(recibida), Buffer.from(esperada));
}

app.post('/api/eventos', (req, res) => {
  if (!EVENTOS_SECRET) {
    return res.status(503).json({ error: 'La recepcion de eventos no esta configurada' });
  }
  if (!firmaValida(req)) {
    return res.status(401).json({ error: 'Firma invalida o vencida' });
  }
  try {
    res.json(procesarEvento(req.body || {}));
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Patrimonio Inmuebles API en http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('No se pudo iniciar la base de datos', err);
    process.exit(1);
  });

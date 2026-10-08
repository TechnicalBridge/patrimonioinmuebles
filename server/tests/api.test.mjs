// La API por HTTP, con el servidor de verdad levantado sobre una base temporal:
// el login con sesiones en la base, clientes y contratos, cargos del mes, pagos
// en oficina, el lote para la cobranza y los avisos firmados que vuelven con
// los pagos. Una agencia falsa atiende la conexion.
import { CLAVE_ADMIN } from './entorno.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const SECRETO = 'whsec_de_la_agencia';
const PUERTO = 3900 + Math.floor(Math.random() * 90);
const B = `http://localhost:${PUERTO}/api`;
let servidor;
let agencia;
let H = {};

async function j(ruta, opts = {}) {
  const r = await fetch(B + ruta, { ...opts, headers: { 'Content-Type': 'application/json', ...H, ...(opts.headers || {}) } });
  const texto = await r.text();
  try { return { status: r.status, body: JSON.parse(texto) }; } catch { return { status: r.status, body: texto }; }
}
const post = (ruta, body, headers) => j(ruta, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers });
const put = (ruta, body) => j(ruta, { method: 'PUT', body: JSON.stringify(body) });
const firmar = (cuerpo, marca = Math.floor(Date.now() / 1000), secreto = SECRETO) => ({
  'X-Timestamp': String(marca),
  'X-Firma': 'v1=' + crypto.createHmac('sha256', secreto).update(`${marca}.${cuerpo}`).digest('hex'),
});
const entrar = (correo = 'admin@patrimonioinmuebles.cl', clave = CLAVE_ADMIN) =>
  j('/admin/login', { method: 'POST', body: JSON.stringify({ correo, clave }), headers: { Authorization: '' } });

/** La primera vez del mes: el dia 1 de hace `meses` meses, como 2026-07-01. */
function inicioDeHace(meses) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - meses);
  return d.toISOString().slice(0, 10);
}

before(async () => {
  //  La agencia: solo lo que hace falta para conectarse.
  agencia = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (req.url === '/api/v1/cuenta') {
      res.end(JSON.stringify({ rut: '76418902-7', nombre: 'Patrimonio Inmuebles', tipo: 'acreedor',
        receptor: { rut: '77305118-6', nombre: 'Agencia de prueba' } }));
    } else {
      res.end(JSON.stringify({ url: 'x', eventos: 'todos', secreto: SECRETO }));
    }
  });
  await new Promise((listo) => agencia.listen(0, '127.0.0.1', listo));

  const base = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'patrimonio-api-')), 'prueba.db');
  servidor = spawn(process.execPath, ['index.js'], {
    cwd: path.join(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(PUERTO), PATRIMONIO_DB: base, ADMIN_CORREO: '', ADMIN_PASSWORD: CLAVE_ADMIN },
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('el servidor no arranco')), 20000);
    servidor.stdout.on('data', (d) => { if (String(d).includes('API en')) { clearTimeout(t); resolve(); } });
  });
  H = { Authorization: `Bearer ${(await entrar()).body.token}` };
  const conectado = await post('/admin/cobranza/conexion', {
    url: `http://127.0.0.1:${agencia.address().port}`, clave: 'apx_prueba', url_avisos: `${B}/eventos`,
  });
  assert.equal(conectado.status, 200, JSON.stringify(conectado.body));
});

after(() => {
  servidor?.kill();
  agencia?.close();
});

// ---------------------------------------------------------------------------
//  Sesiones
// ---------------------------------------------------------------------------

test('se entra con correo y clave, y la clave mala no dice si el correo existe', async () => {
  const bien = await entrar();
  assert.equal(bien.status, 200);
  assert.equal(bien.body.usuario.correo, 'admin@patrimonioinmuebles.cl');
  const claveMala = await entrar('admin@patrimonioinmuebles.cl', 'otra');
  const correoMalo = await entrar('nadie@patrimonioinmuebles.cl', CLAVE_ADMIN);
  assert.equal(claveMala.status, 401);
  assert.equal(correoMalo.status, 401);
  assert.equal(claveMala.body.error, correoMalo.body.error);
});

test('cerrar sesion la deja sin efecto al tiro', async () => {
  const token = (await entrar()).body.token;
  const conSesion = { Authorization: `Bearer ${token}` };
  assert.equal((await j('/admin/yo', { headers: conSesion })).status, 200);
  assert.equal((await j('/admin/logout', { method: 'POST', headers: conSesion })).status, 200);
  assert.equal((await j('/admin/yo', { headers: conSesion })).status, 401);
});

test('sin sesion el panel no responde', async () => {
  assert.equal((await j('/admin/clients', { headers: { Authorization: '' } })).status, 401);
  assert.equal((await j('/admin/clients', { headers: { Authorization: 'Bearer inventado' } })).status, 401);
});

// ---------------------------------------------------------------------------
//  Arriendos de la demo
// ---------------------------------------------------------------------------

test('contratos y morosos al corte', async () => {
  const contratos = (await j('/admin/arriendos/contratos')).body;
  assert.equal(contratos.length, 10);
  assert.equal(contratos.find(c => c.codigo === 'CTR-2025-014').deuda, 1040000);
  const morosos = (await j('/admin/arriendos/morosos?corte=2026-09-18')).body;
  //  Siete: el contrato terminado de Ignacio no cuenta, solo los vigentes.
  assert.equal(morosos.length, 7);
  assert.equal(morosos[0].dias_mora, 44);
  assert.equal(morosos[0].cargos.length, 2);
});

test('emitir los cargos del mes dos veces no cobra dos veces', async () => {
  const primera = (await post('/admin/arriendos/cargos', { periodo: '2026-10' })).body;
  assert.deepEqual([primera.emitidos, primera.existentes], [9, 0]);
  const segunda = (await post('/admin/arriendos/cargos', { periodo: '2026-10' })).body;
  assert.deepEqual([segunda.emitidos, segunda.existentes], [0, 9]);
  assert.equal((await post('/admin/arriendos/cargos', { periodo: '2026-13' })).status, 400);
  assert.equal((await j('/admin/arriendos/morosos?corte=2026-09-18')).body.length, 7,
    'un cargo que aun no vence no hace moroso a nadie');
});

test('un pago en la oficina deja el saldo, no el monto original, en la cartera', async () => {
  const contratos = (await j('/admin/arriendos/contratos')).body;
  const cargos = (await j(`/admin/arriendos/contratos/${contratos.find(c => c.codigo === 'CTR-2026-031').id}/cargos`)).body;
  const sept = cargos.find(c => c.periodo === '2026-09');
  assert.equal((await post('/admin/arriendos/pagos', { charge_id: sept.id, monto: 999999 })).status, 400,
    'un pago mayor que el saldo se rechaza');
  const parcial = (await post('/admin/arriendos/pagos',
    { charge_id: sept.id, monto: 200000, medio: 'efectivo', pagado_en: '2026-09-17' })).body;
  assert.equal(parcial.saldo, 210000);
  const cartera = (await j('/admin/arriendos/cartera?corte=2026-09-18')).body;
  assert.equal(cartera.deudas.find(d => d.id_externo === 'CTR-2026-031').cargos[0].monto, 210000);
});

test('el lote lleva a todos los clientes con contrato, y se descarga', async () => {
  const emitido = (await post('/admin/arriendos/lotes', { corte: '2026-09-18' })).body;
  assert.equal(emitido.lote.estado, 'borrador');
  assert.equal(emitido.lote.items.length, 10, 'los que deben y los que estan al dia');
  assert.equal(emitido.cartera.deudas.find(d => d.id_externo === 'CTR-2026-008').cargos.length, 0,
    'Josefa esta al dia: va sin cargos');
  assert.equal(emitido.lote.id_externo, 'PAT-2026-09-18-01');
  const archivo = await fetch(`${B}/admin/arriendos/lotes/${emitido.lote.id}/archivo`, { headers: H });
  assert.match(archivo.headers.get('content-disposition') || '', /PAT-2026-09-18-01\.json/);
  const enviado = (await post(`/admin/arriendos/lotes/${emitido.lote.id}/enviado`, {})).body;
  assert.equal(enviado.estado, 'enviado');
  assert.equal((await post(`/admin/arriendos/lotes/${emitido.lote.id}/enviado`, {})).status, 409);
});

test('los avisos de pago: firma con el secreto de la agencia, antirrepeticion y deduplicacion', async () => {
  const cuerpo = JSON.stringify({
    id: 'evt_prueba_1', tipo: 'pago.confirmado', version: '1',
    ocurrido_en: '2026-09-20T14:03:11-03:00', acreedor_rut: '76418902-7',
    datos: { deuda_id_externo: 'CTR-2026-031', pago_id: 'pg_1', monto: 210000, moneda: 'CLP',
             pagado_en: '2026-09-20T14:03:11-03:00' },
  });
  assert.equal((await post('/eventos', cuerpo)).status, 401, 'sin firma');
  assert.equal((await post('/eventos', cuerpo, firmar(cuerpo, undefined, 'otro'))).status, 401, 'otro secreto');
  assert.equal((await post('/eventos', cuerpo, firmar(cuerpo, Math.floor(Date.now() / 1000) - 600))).status, 401,
    'firma de hace 10 minutos');

  const aplicado = await post('/eventos', cuerpo, firmar(cuerpo));
  assert.equal(aplicado.status, 200);
  assert.equal(aplicado.body.repetido, false);
  assert.equal((await post('/eventos', cuerpo, firmar(cuerpo))).body.repetido, true);

  const morosos = (await j('/admin/arriendos/morosos?corte=2026-09-18')).body;
  assert.ok(!morosos.some(m => m.codigo === 'CTR-2026-031'), 'el contrato pagado por aviso sale de los morosos');
  assert.equal(morosos.length, 6);
});

test('la disputa de un arrendatario llega por aviso, y el contrato muestra en que va', async () => {
  const aviso = async (id, tipo, datos) => {
    const cuerpo = JSON.stringify({ id, tipo, version: '1', ocurrido_en: '2026-09-21T10:00:00-03:00',
      acreedor_rut: '76418902-7', datos });
    const r = await post('/eventos', cuerpo, firmar(cuerpo));
    assert.equal(r.status, 200, JSON.stringify(r.body));
    return r.body;
  };
  const contrato = async (codigo) =>
    (await j('/admin/arriendos/contratos')).body.find((c) => c.codigo === codigo);

  await aviso('evt_disputa_1', 'deuda.disputada', { deuda_id_externo: 'CTR-2025-014', motivo: 'ya_pagada' });
  let c = await contrato('CTR-2025-014');
  assert.equal(c.disputa_estado, 'abierta');
  assert.equal(c.disputa_motivo, 'ya_pagada');
  assert.equal(c.disputa_desde, '2026-09-21');
  assert.ok(c.deuda > 0, 'la deuda no cambia: la revisa la agencia');

  await aviso('evt_disputa_2', 'deuda.reanudada',
    { deuda_id_externo: 'CTR-2025-014', motivo: 'disputa_rechazada', con_convenio: false });
  c = await contrato('CTR-2025-014');
  assert.equal(c.disputa_estado, 'rechazada');
  assert.equal(c.disputa_motivo, 'ya_pagada', 'queda el motivo que dio el arrendatario');

  await aviso('evt_disputa_3', 'deuda.disputada', { deuda_id_externo: 'CTR-2026-008', motivo: 'no_reconoce' });
  await aviso('evt_disputa_4', 'deuda.retirada',
    { deuda_id_externo: 'CTR-2026-008', motivo: 'disputa_resuelta' });
  assert.equal((await contrato('CTR-2026-008')).disputa_estado, 'aceptada');

  //  Un retiro por otro motivo no toca la disputa.
  await aviso('evt_disputa_5', 'deuda.retirada', { deuda_id_externo: 'CTR-2025-014', motivo: 'pago_directo' });
  assert.equal((await contrato('CTR-2025-014')).disputa_estado, 'rechazada');
});

// ---------------------------------------------------------------------------
//  Un cliente nuevo, que se vuelve moroso
// ---------------------------------------------------------------------------

test('un interesado se crea sin RUT, pero no puede firmar hasta tenerlo', async () => {
  const cliente = await post('/admin/clients', { nombre: 'Marta', apellido: 'Lagos', correo: 'marta@correo.cl' });
  assert.equal(cliente.status, 200, JSON.stringify(cliente.body));
  assert.equal(cliente.body.etapa, 'interesado');
  const propiedad = (await post('/admin/properties',
    { titulo: 'Depto para Marta', tipo: 'departamento', operacion: 'arriendo', precio: 450000 })).body;

  const sinRut = await post('/admin/arriendos/contratos', { client_id: cliente.body.id, property_id: propiedad.id,
    renta_monto: 450000, fecha_inicio: inicioDeHace(3) });
  assert.equal(sinRut.status, 400);
  assert.match(sinRut.body.error, /no tiene RUT/);

  assert.equal((await put(`/admin/clients/${cliente.body.id}`, { rut: '16.482.337-1' })).status, 400,
    'un RUT con el digito malo no entra');
  const conRut = await put(`/admin/clients/${cliente.body.id}`, { rut: '19.876.543-0' });
  assert.equal(conRut.status, 200, JSON.stringify(conRut.body));
  assert.equal(conRut.body.rut, '19876543-0');
});

test('un contrato que empezo hace tres meses nace con sus arriendos, y es un moroso de verdad', async () => {
  const marta = (await j('/admin/clients')).body.find((c) => c.correo === 'marta@correo.cl');
  const propiedad = (await j('/properties?all=1')).body.find((p) => p.titulo === 'Depto para Marta');

  const contrato = await post('/admin/arriendos/contratos', { client_id: marta.id, property_id: propiedad.id,
    renta_monto: 450000, dia_vencimiento: 5, fecha_inicio: inicioDeHace(3) });
  assert.equal(contrato.status, 200, JSON.stringify(contrato.body));
  assert.equal(contrato.body.cargos_emitidos, 4, 'tres meses atras y el actual');
  assert.match(contrato.body.codigo, /^CTR-\d{4}-\d{3}$/);

  const hoy = new Date().toISOString().slice(0, 10);
  const moroso = (await j(`/admin/arriendos/morosos?corte=${hoy}`)).body.find((m) => m.codigo === contrato.body.codigo);
  assert.ok(moroso, 'Marta aparece en los morosos');
  assert.ok(moroso.cargos.length >= 3);
  const cartera = (await j(`/admin/arriendos/cartera?corte=${hoy}`)).body;
  const suya = cartera.deudas.find((d) => d.id_externo === contrato.body.codigo);
  assert.equal(suya.deudor.rut, '19876543-0');
  assert.equal(suya.deudor.nombre, 'Marta Lagos');

  const otra = await post('/admin/arriendos/contratos', { client_id: marta.id, property_id: propiedad.id,
    renta_monto: 1, fecha_inicio: hoy });
  assert.equal(otra.status, 409, 'la propiedad ya esta arrendada');

  const ficha = (await j(`/admin/clients/${marta.id}`)).body;
  assert.equal(ficha.etapa, 'arrendatario');
  assert.equal(ficha.contratos.length, 1);
});

test('terminar un contrato deja la propiedad disponible y conserva la deuda', async () => {
  const marta = (await j('/admin/clients')).body.find((c) => c.correo === 'marta@correo.cl');
  const contrato = (await j(`/admin/clients/${marta.id}`)).body.contratos[0];
  const terminado = await post(`/admin/arriendos/contratos/${contrato.id}/termino`, {});
  assert.equal(terminado.body.estado, 'terminado');
  const propiedad = (await j('/properties?all=1')).body.find((p) => p.titulo === 'Depto para Marta');
  assert.equal(propiedad.estatus, 'disponible');
  assert.ok((await j(`/admin/clients/${marta.id}`)).body.contratos[0].deuda > 0);
});

// ---------------------------------------------------------------------------
//  Errores
// ---------------------------------------------------------------------------

test('dos propiedades con el mismo titulo no revientan: la segunda recibe otro slug', async () => {
  const casa = { titulo: 'Depto en Ñuñoa', tipo: 'departamento', operacion: 'arriendo', precio: 520000 };
  const primera = await post('/admin/properties', casa);
  const segunda = await post('/admin/properties', casa);
  assert.equal(primera.status, 201);
  assert.equal(segunda.status, 201);
  assert.equal(primera.body.slug, 'depto-en-nunoa');
  assert.equal(segunda.body.slug, 'depto-en-nunoa-2');
  const aMano = await post('/admin/properties', { ...casa, slug: 'depto-en-nunoa' });
  assert.equal(aMano.status, 409, 'un slug escrito a mano que ya existe es un conflicto, no un 500');
});

test('ningun error sale con el stack del servidor', async () => {
  // Una propiedad arrendada: la de un contrato vigente.
  const conContrato = (await j('/admin/arriendos/contratos')).body[0];
  const propiedades = (await j('/properties?all=1')).body;
  const propiedad = propiedades.find((p) => p.direccion === conContrato.direccion);
  assert.ok(propiedad, 'la propiedad del contrato existe');
  const borrar = await j(`/admin/properties/${propiedad.id}`, { method: 'DELETE' });
  assert.equal(borrar.status, 409, 'una propiedad con contrato no se borra');
  assert.ok(!JSON.stringify(borrar.body).includes(' at '), 'sin stack');
  assert.match(borrar.body.error, /otro registro depende/);
});

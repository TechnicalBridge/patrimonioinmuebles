// La API de arriendos por HTTP, con el servidor de verdad levantado sobre una
// base temporal: cargos del mes, pagos en oficina, el lote para la cobranza y
// los eventos firmados que vuelven con los pagos.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const SECRETO = 'secreto-de-prueba';
const PUERTO = 3900 + Math.floor(Math.random() * 90);
const B = `http://localhost:${PUERTO}/api`;
let servidor;
let H = {};

async function j(ruta, opts = {}) {
  const r = await fetch(B + ruta, { ...opts, headers: { 'Content-Type': 'application/json', ...H, ...(opts.headers || {}) } });
  const texto = await r.text();
  try { return { status: r.status, body: JSON.parse(texto) }; } catch { return { status: r.status, body: texto }; }
}
const post = (ruta, body, headers) => j(ruta, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), headers });
const firmar = (cuerpo, marca = Math.floor(Date.now() / 1000), secreto = SECRETO) => ({
  'X-Timestamp': String(marca),
  'X-Firma': 'v1=' + crypto.createHmac('sha256', secreto).update(`${marca}.${cuerpo}`).digest('hex'),
});

before(async () => {
  const base = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'patrimonio-api-')), 'prueba.db');
  servidor = spawn(process.execPath, ['index.js'], {
    cwd: path.join(import.meta.dirname, '..'),
    env: { ...process.env, PORT: String(PUERTO), EVENTOS_SECRET: SECRETO, PATRIMONIO_DB: base },
  });
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('el servidor no arranco')), 20000);
    servidor.stdout.on('data', (d) => { if (String(d).includes('API en')) { clearTimeout(t); resolve(); } });
  });
  H = { Authorization: `Bearer ${(await post('/admin/login', { password: 'patrimonio' })).body.token}` };
});

after(() => servidor?.kill());

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

test('el lote se emite, se descarga y se marca enviado una sola vez', async () => {
  const emitido = (await post('/admin/arriendos/lotes', { corte: '2026-09-18' })).body;
  assert.equal(emitido.lote.estado, 'borrador');
  assert.equal(emitido.lote.items.length, 8);
  assert.equal(emitido.lote.id_externo, 'PAT-2026-09-18-01');
  const archivo = await fetch(`${B}/admin/arriendos/lotes/${emitido.lote.id}/archivo`, { headers: H });
  assert.match(archivo.headers.get('content-disposition') || '', /PAT-2026-09-18-01\.json/);
  const enviado = (await post(`/admin/arriendos/lotes/${emitido.lote.id}/enviado`, {})).body;
  assert.equal(enviado.estado, 'enviado');
  assert.equal((await post(`/admin/arriendos/lotes/${emitido.lote.id}/enviado`, {})).status, 409);
});

test('los eventos de pago: firma, antirrepeticion y deduplicacion', async () => {
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
  assert.ok(!morosos.some(m => m.codigo === 'CTR-2026-031'), 'el contrato pagado por evento sale de la cartera');
  assert.equal(morosos.length, 6);
});

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
